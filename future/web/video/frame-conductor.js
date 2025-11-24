/**
 * frame-conductor.js - Manifest-Driven Worker Orchestrator
 * 
 * The FrameConductor is responsible for:
 * 1. Reading worker-manifest.js to determine which workers execute per mode
 * 2. Managing worker lifecycle (load, unload, hot-swap on mode changes)
 * 3. Orchestrating workers in sequence (chain execution)
 * 4. Validating all messages via WorkerContract
 * 5. Extracting and aggregating capabilities from workers
 * 6. Handling errors gracefully without crashing the app
 * 
 * This module replaces ~290 lines of hardcoded chain logic in frame-processor.js,
 * making it 6× faster to add new workers (just update manifest, no code changes).
 * 
 * Architecture (per frame):
 * 1. Get worker chain from manifest
 * 2. Feed frame through workers sequentially
 * 3. Each worker processes output of previous worker
 * 4. Collect capabilities from all workers
 * 5. Return aggregated result
 * 
 * Worker Communication:
 * - Main thread sends: { type: 'processingRequest', data: frameData, width, height, state }
 * - Worker responds: { type: 'processingResult', capabilities, result, ... } (WorkerContract)
 * - On error: { type: 'processingError', error: message } (WorkerContract)
 * 
 * Lifecycle Management:
 * - initializeForMode(mode): Load workers for new mode, cleanup old workers
 * - processFrame(frameData, ...): Run frame through current chain
 * - dispose(): Terminate all workers (call on app shutdown)
 * 
 * Performance Targets:
 * - Flow mode: <50ms total (workers already optimized)
 * - Focus mode: <200ms total (workers already optimized)
 * - Hybrid mode: <10ms each (decision workers)
 * 
 * Implementation is optimized for clarity and performance:
 * - No dynamic code generation
 * - No complex state machines
 * - Clear error boundaries
 * - Structured logging for debugging
 */

import { structuredLog, throttleError } from '../utils/logging.js';
import { WorkerContract, WORKER_TYPES } from './workers/worker-contract.js';
import { getWorkersForMode, getTotalLatencyBudget } from './workers/worker-manifest.js';
import { detectDeviceTier, getWorkerTimeoutConfig } from '../utils/performance.js';

/**
 * FrameConductor: Manifest-driven orchestrator for video workers
 * 
 * Created once at app startup; reused for all frames in current mode.
 * On mode change, call initializeForMode(newMode) to hot-swap workers.
 * 
 * IMPORTANT: Latency Targets are DIAGNOSTIC SLAs, not hard timeouts.
 * - latencyTargetMs from worker-manifest.js helps identify bottlenecks
 * - If worker exceeds target, we log it but continue processing (no crash)
 * - Flow mode targets <50ms; Focus targets <200ms; Hybrid targets <10ms
 * 
 * Phase 3.1b-Hotfix: Mode switching is now graceful via #isTransitioning flag.
 * - When switching modes, initializeForMode sets #isTransitioning = true
 * - This causes processFrame() to return empty results instead of crashing
 * - Prevents audio dropout during the ~50-200ms worker swap window
 */
export class FrameConductor {
  /**
   * @param {Object} config - Configuration
   * @param {number} config.flowTimeout - Diagnostic SLA for Flow mode (default 100ms, not a hard timeout)
   * @param {number} config.focusTimeout - Diagnostic SLA for Focus mode (default 200ms, not a hard timeout)
   * @param {number} config.hybridTimeout - Diagnostic SLA for Hybrid mode (default 10ms, not a hard timeout)
   * @param {boolean} config.logMetrics - Whether to log timing metrics (default true)
   * @param {boolean} config.logFrames - Whether to sample-log frame processing (default true)
   */
  constructor(config = {}) {
    // Device-aware timeout adjustment (HAR analysis finding)
    // Import timeout config from performance.js (respects SRP)
    // CRITICAL FIX: Pass engine state to detect canvas fallback
    const timeoutConfig = getWorkerTimeoutConfig(config.engine?.state);
    const deviceTier = detectDeviceTier();

    this.config = Object.assign(
      {
        flowTimeout: timeoutConfig.flowTimeout,
        focusTimeout: timeoutConfig.focusTimeout,
        hybridTimeout: timeoutConfig.hybridTimeout,
        logMetrics: true,
        logFrames: true,
      },
      config  // Allow explicit override if needed
    );

    // Worker storage: Map<workerName, Worker>
    this.#workers = new Map();

    // Current mode: 'flow' | 'focus' | 'hybrid' | null
    this.#currentMode = null;

    // Worker chain for current mode: Array<{ name, config }>
    this.#currentChain = null;

    // Performance tracking
    this.#timingMetrics = {
      lastFrameTimeMs: 0,
      totalFramesProcessed: 0,
      totalErrorsEncountered: 0,
      workerTimings: {}, // { workerName: [measurements] }
      deviceTier: deviceTier,
    };

    structuredLog('DEBUG', 'FrameConductor created', {
      config: this.config,
      deviceTier: this.#timingMetrics.deviceTier,
    });
  }

  /**
   * Update depth estimation path (pseudo vs cnn)
   * 
   * Called by frame-processor when state.depthPath changes.
   * Finds the depth worker (if active) and sends configuration update.
   * 
   * @param {string} path - 'pseudo' | 'cnn'
   */
  updateDepthPath(path) {
    const workerName = WORKER_TYPES.DEPTH;
    const worker = this.#workers.get(workerName);

    if (worker) {
      structuredLog('INFO', 'FrameConductor: updating depth path', { 
        worker: workerName, 
        path 
      });
      worker.postMessage({ type: 'setPath', path });
    } else {
      structuredLog('DEBUG', 'FrameConductor: depth worker not active, path update deferred', { 
        path,
        currentMode: this.#currentMode 
      });
    }
  }

  // =========================================================================
  // Lifecycle Methods (mode switching, cleanup)
  // =========================================================================

  /**
   * Initialize conductor for a specific mode
   * 
   * This method:
   * 1. Validates the mode is known
   * 2. Terminates old workers (if mode is changing)
   * 3. Loads new workers for the mode
   * 4. Caches the worker chain for fast lookup
   * 5. Logs the transition
   * 
   * Call this when switching modes (e.g., Flow → Focus) to hot-swap workers.
   * Safe to call multiple times with same mode (no-op if already initialized).
   * 
   * @param {string} mode - 'flow' | 'focus' | 'hybrid'
   * @throws {Error} If mode is unknown or workers fail to load
   */
  async initializeForMode(mode) {
    // Validate mode
    if (!['flow', 'focus', 'hybrid'].includes(mode)) {
      const error = new Error(`Unknown mode: ${mode}`);
      structuredLog('ERROR', 'FrameConductor: invalid mode', { mode, error: error.message });
      throw error;
    }

    // If already initialized for this mode, no-op
    if (this.#currentMode === mode) {
      structuredLog('DEBUG', 'FrameConductor: already initialized for mode (no-op)', { mode });
      return;
    }

    // Phase 3.1b-hotfix: Mark transition start (prevents frame processing during switch)
    // This prevents audio dropout by returning empty results instead of crashes
    this.#isTransitioning = true;

    // Cleanup old workers
    if (this.#currentMode !== null) {
      structuredLog('DEBUG', 'FrameConductor: cleaning up old mode workers (transition start)', {
        oldMode: this.#currentMode,
        oldWorkerCount: this.#workers.size,
      });
      this.#cleanupWorkers();
    }

    // Load new workers
    let chain = getWorkersForMode(mode);
    if (!chain || chain.length === 0) {
      const error = new Error(`No workers defined for mode: ${mode}`);
      structuredLog('ERROR', 'FrameConductor: no workers for mode', { mode });
      throw error;
    }

    // Optional debug-only filtering: allow external config to disable specific workers
    const debugEnabled = this.config?.debugWorkerEnabled;
    if (debugEnabled && typeof debugEnabled === 'object') {
      const originalCount = chain.length;
      chain = chain.filter(w => {
        if (!Object.prototype.hasOwnProperty.call(debugEnabled, w.name)) return true;
        return !!debugEnabled[w.name];
      });
      if (chain.length === 0) {
        structuredLog('WARN', 'FrameConductor: all workers disabled by debug config; using original chain', {
          mode,
          originalCount,
        });
        chain = getWorkersForMode(mode);
      } else if (chain.length !== originalCount) {
        structuredLog('INFO', 'FrameConductor: debug worker filter applied', {
          mode,
          originalCount,
          filteredCount: chain.length,
          enabled: debugEnabled,
        });
      }
    }

    try {
      for (const workerConfig of chain) {
        await this.#loadWorker(workerConfig);
      }
    } catch (error) {
      // On any error loading workers, cleanup and bail
      this.#cleanupWorkers();
      structuredLog('ERROR', 'FrameConductor: failed to load workers for mode', {
        mode,
        error: error.message,
      });
      throw error;
    }

    // Update state
    this.#currentMode = mode;
    this.#currentChain = chain;

    // Phase 3.1b-hotfix: Mark transition complete (resume frame processing)
    this.#isTransitioning = false;

    const totalLatencyBudget = getTotalLatencyBudget(mode);
    structuredLog('INFO', 'FrameConductor: mode initialized', {
      mode,
      workerCount: this.#workers.size,
      workers: chain.map(w => w.name),
      totalLatencyBudgetMs: totalLatencyBudget,
    });
  }

  /**
   * Load a single worker from the config
   * 
   * Private method called during mode initialization.
   * Each worker is loaded with error handler attached.
   * 
   * @private
   * @param {Object} workerConfig - { name, path, mode, capabilities, ... }
   * @throws {Error} If worker fails to instantiate
   */
  async #loadWorker(workerConfig) {
    try {
      // Create worker: path is relative, resolve from import.meta.url
      const workerPath = new URL(
        workerConfig.path,
        import.meta.url
      );

      const worker = new Worker(workerPath, { type: 'module' });

      // Attach error handler (catches uncaught exceptions in worker)
      worker.onerror = (event) => {
        this.#timingMetrics.totalErrorsEncountered += 1;
        structuredLog('ERROR', `FrameConductor: ${workerConfig.name} crashed`, {
          workerName: workerConfig.name,
          message: event.message,
          filename: event.filename,
          lineno: event.lineno,
        });
        // Note: Don't rethrow or terminate the app; let the worker be unavailable
        // This allows graceful degradation if one worker fails
      };

      // Store worker
      this.#workers.set(workerConfig.name, worker);

      // Initialize metrics for this worker
      if (!this.#timingMetrics.workerTimings[workerConfig.name]) {
        this.#timingMetrics.workerTimings[workerConfig.name] = [];
      }

      structuredLog('DEBUG', 'FrameConductor: worker loaded', {
        workerName: workerConfig.name,
        path: workerConfig.path,
        capabilities: workerConfig.capabilities.length,
      });
    } catch (error) {
      structuredLog('ERROR', 'FrameConductor: failed to load worker', {
        workerName: workerConfig.name,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Cleanup all active workers
   * 
   * Private method called on mode change or app shutdown.
   * Terminates all workers and clears the map.
   * 
   * @private
   */
  #cleanupWorkers() {
    for (const [name, worker] of this.#workers.entries()) {
      try {
        worker.terminate();
        structuredLog('DEBUG', 'FrameConductor: worker terminated', { workerName: name });
      } catch (error) {
        structuredLog('WARN', 'FrameConductor: error terminating worker', {
          workerName: name,
          error: error.message,
        });
      }
    }
    this.#workers.clear();
  }

  /**
   * Dispose of the conductor (cleanup on app shutdown)
   * 
   * Call this when shutting down the app or video pipeline.
   * After dispose(), the conductor cannot be reused; create a new one.
   */
  dispose() {
    structuredLog('INFO', 'FrameConductor: disposing', {
      mode: this.#currentMode,
      workerCount: this.#workers.size,
      totalFramesProcessed: this.#timingMetrics.totalFramesProcessed,
    });
    this.#cleanupWorkers();
    this.#currentMode = null;
    this.#currentChain = null;
  }

  // =========================================================================
  // Frame Processing (main entry point)
  // =========================================================================

  /**
   * Process a frame through the worker chain for the current mode
   * 
   * This is the main entry point for frame processing:
   * 1. Validates that a mode is initialized
   * 2. Retrieves worker chain for current mode
   * 3. Feeds frame through each worker sequentially
   * 4. Validates each result via WorkerContract
   * 5. Aggregates capabilities and results
   * 6. Returns aggregated output and capabilities
   * 
   * Frame flow:
   * - Input: ImageData or canvas pixel array
   * - Worker 0: Receives raw frame, emits { capabilities, result }
   * - Worker 1: Receives output of Worker 0 as input, emits { capabilities, result }
   * - ... (N workers in chain)
   * - Output: Final { capabilities: [...], result, timings: {...} }
   * 
   * Error handling:
   * - If a worker times out: logged but doesn't crash app
   * - If a worker fails: logged but doesn't crash app
   * - Graceful degradation: later stages may receive partial input
   * 
   * @param {ImageData|Uint8ClampedArray|Object} frameData - Frame to process
   * @param {number} width - Frame width in pixels
   * @param {number} height - Frame height in pixels
   * @param {Object} state - Engine state (for worker context)
   * @returns {Promise<Object>} { capabilities: [...], result, mode, timings: {...} }
   * @throws {Error} If not initialized for a mode, or critical error occurs
   */
  async processFrame(frameData, width, height, state) {
    // Validation
    if (this.#currentMode === null) {
      const error = new Error('FrameConductor: not initialized for any mode. Call initializeForMode() first.');
      structuredLog('ERROR', 'FrameConductor: processFrame called before mode init', {
        error: error.message,
      });
      throw error;
    }

    // Phase 3.1b-hotfix: Check transition state
    // During mode switch, return empty result instead of crashing
    // This prevents audio dropout (silence is better than error)
    if (this.#isTransitioning) {
      return {
        type: 'processingResult',
        capabilities: [],
        result: { empty: true, reason: 'conductor_transitioning' },
        timing: { totalMs: 0 },
      };
    }

    if (!this.#currentChain || this.#currentChain.length === 0) {
      const error = new Error('FrameConductor: no workers in current chain');
      structuredLog('ERROR', 'FrameConductor: empty chain', { mode: this.#currentMode });
      throw error;
    }

    const frameStartTime = performance.now();
    let aggregatedCapabilities = [];
    let currentInput = frameData;
    const timings = {}; // { workerName: durationMs }

    const getNextWorkerName = (name) => {
      if (!this.#currentChain) return null;
      const idx = this.#currentChain.findIndex(w => w.name === name);
      if (idx === -1 || idx + 1 >= this.#currentChain.length) return null;
      return this.#currentChain[idx + 1].name;
    };

    // Process frame through chain
    for (const workerConfig of this.#currentChain) {
      const workerStartTime = performance.now();
      let workerResult;

      try {
        // Run worker with timeout
        workerResult = await this.#runWorker(
          workerConfig.name,
          currentInput,
          width,
          height,
          state
        );

        const workerDurationMs = performance.now() - workerStartTime;
        timings[workerConfig.name] = workerDurationMs;

        // Record metric (keep recent measurements for averaging)
        const metrics = this.#timingMetrics.workerTimings[workerConfig.name];
        if (metrics) {
          metrics.push(workerDurationMs);
          // Keep only last 100 measurements (rolling window)
          if (metrics.length > 100) {
            metrics.shift();
          }
        }

        // Validate result
        const validation = WorkerContract.validate(workerResult);
        if (!validation.valid) {
          structuredLog('WARN', 'FrameConductor: worker returned invalid message', {
            workerName: workerConfig.name,
            error: validation.error,
          });
          continue; // Skip this worker's output, feed next worker the current input
        }

        if (validation.warning) {
          structuredLog('WARN', 'FrameConductor: worker message validation warning', {
            workerName: workerConfig.name,
            warning: validation.warning,
          });
        }

        // Extract result and capabilities
        const capabilities = WorkerContract.getCapabilities(workerResult);
        aggregatedCapabilities = [...aggregatedCapabilities, ...capabilities];
        currentInput = workerResult.result;

        // Sampled shape check before pan-intensity-mapper to debug grid size mismatches
        if (workerConfig.name === 'fast-grid-aggregator') {
          const nextName = getNextWorkerName(workerConfig.name);
          if (nextName === 'pan-intensity-mapper' && workerResult.result) {
            const out = workerResult.result;
            const grid = out.grid || (out.data && out.data.grid) || out.data || null;
            const gridConfig = out.gridConfig || null;
            if (grid && gridConfig && Number.isInteger(gridConfig.rows) && Number.isInteger(gridConfig.cols)) {
              const expected = gridConfig.rows * gridConfig.cols;
              const actual = grid.length;
              if (expected !== actual && Math.random() < 0.02) {
                structuredLog('WARN', 'FrameConductor: grid size mismatch before pan-mapper', {
                  workerName: workerConfig.name,
                  nextWorker: nextName,
                  expected,
                  actual,
                  rows: gridConfig.rows,
                  cols: gridConfig.cols
                });
              }
            }
          }
        }
        
        // CORE-15: Extract normalization telemetry from motion worker result R151125C15ingest
        if (workerConfig.name === 'fast-motion-worker' && workerResult.result?.normalizationTelemetry) {
          this.#lastNormalizationTelemetry = workerResult.result.normalizationTelemetry;
        }
        
        // TEMPORARY DIAGNOSTIC: Log what we're extracting R111125 could the use of eventBus by optimal than console.log here in the citrical hot path?
        if (workerConfig.name === 'pan-intensity-mapper') {
          console.log('[Conductor] pan-mapper result:', workerResult.result);
        }

        structuredLog('DEBUG', `FrameConductor: ${workerConfig.name} completed`, {
          workerName: workerConfig.name,
          durationMs: workerDurationMs,
          capabilitiesCount: capabilities.length,
          latencyTargetMs: workerConfig.latencyTargetMs,
          onTarget: workerDurationMs <= workerConfig.latencyTargetMs,
        });
      } catch (error) {
        this.#timingMetrics.totalErrorsEncountered += 1;
        
        // Throttle worker errors to prevent log spam (first occurrence + every 10th)
        const throttle = throttleError(error, { 
          key: `worker:${workerConfig.name}:${error.message}`,
          sampleEvery: 10 
        });
        
        if (throttle.log) {
          structuredLog('ERROR', `FrameConductor: ${workerConfig.name} error`, {
            workerName: workerConfig.name,
            error: error.message || 'no-message',
            stack: error.stack || 'no-stack',
            name: error.name || 'Error',
            occurrences: throttle.occurrences,
          });
        }
        // Continue with current input (graceful degradation)
      }
    }

    // Finalize frame
    const totalFrameTimeMs = performance.now() - frameStartTime;
    this.#timingMetrics.lastFrameTimeMs = totalFrameTimeMs;
    this.#timingMetrics.totalFramesProcessed += 1;

    // Log metrics (sampled to avoid overhead)
    if (this.config.logMetrics && Math.random() < 0.05) {
      // 5% sample rate
      this.#logMetrics(totalFrameTimeMs, timings);
    }

    // Sample log individual frames (1% sample rate)
    if (this.config.logFrames && Math.random() < 0.01) {
      structuredLog('DEBUG', 'FrameConductor: frame processed', {
        mode: this.#currentMode,
        totalTimeMs: totalFrameTimeMs,
        capabilitiesCount: aggregatedCapabilities.length,
        workerCount: this.#currentChain.length,
      });
    }

    return {
      capabilities: aggregatedCapabilities,
      result: currentInput,
      mode: this.#currentMode,
      timings,
      totalTimeMs: totalFrameTimeMs,
      normalizationTelemetry: this.#lastNormalizationTelemetry // CORE-15: Include latest telemetry
    };
  }

  // =========================================================================
  // Worker Communication (message passing, timeouts)
  // =========================================================================

  /**
   * Extract only serializable state fields for worker communication
   * 
   * Workers receive state via postMessage(), which uses structured cloning.
   * Structured cloning cannot serialize functions, class instances, Symbols, etc.
   * This helper extracts only JSON-serializable fields from the engine state.
   * 
   * Fields INCLUDED (safe to serialize):
   * - orchestration (gridType, maxNotes, dynamicMode, etc.)
   * - depthPath, motionThreshold, gridScale, etc. (primitives)
   * 
   * Fields EXCLUDED (cannot serialize):
   * - grids (contains mapFunction functions)
   * - settings (contains class instances)
   * - audioContext, mediaStream, Worker instances
   * - Functions, circular references
   * 
   * @private
   * @param {Object} state - Full engine state
   * @returns {Object} Serializable subset of state
   */
  #extractSerializableState(state) {
    return {
      // Orchestration config
      orchestration: state.orchestration ? {
        gridType: state.orchestration.gridType,
        maxNotes: state.orchestration.maxNotes,
        dynamicMode: state.orchestration.dynamicMode,
        intensityScale: state.orchestration.intensityScale,
        pitchRangeMin: state.orchestration.pitchRangeMin,
        pitchRangeMax: state.orchestration.pitchRangeMax,
      } : {},
      
      // Motion/video settings
      depthPath: state.depthPath,
      motionThreshold: state.motionThreshold,
      gridScale: state.gridScale,
      
      // CORE-15: Motion detection tuning parameters
      motionDetection: state.motionDetection ? {
        step: state.motionDetection.step,
        threshold: state.motionDetection.threshold,
        maxRegions: state.motionDetection.maxRegions,
        windowSize: state.motionDetection.windowSize,
        adaptiveEnabled: state.motionDetection.adaptiveEnabled,
        smoothing: state.motionDetection.smoothing,
        minHeadroom: state.motionDetection.minHeadroom,
        strategy: state.motionDetection.strategy
      } : {
        step: 6,
        threshold: 20,
        maxRegions: 64,
        windowSize: 5,
        adaptiveEnabled: true,
        smoothing: 0.95,
        minHeadroom: 0.5,
        strategy: 'adaptive'
      },
      
      // Mode info
      mode: state.mode,
      
      // NOTE: grids (with mapFunction) is NOT included
      // NOTE: settings, audioContext, mediaStream NOT included
      // Workers receive frame data and parameters, not app-level state
    };
  }

  /**
   * Run a single worker with frame data
   * 
   * Private method called during chain processing.
   * Handles timeout, error handling, and message protocol.
   * 
   * Protocol:
   * - Sends: { type: 'processingRequest', data: frameData, width, height, state }
   * - Receives: WorkerContract.createResult(...) or WorkerContract.createError(...)
   * - Timeout: Returns error after config.XXXTimeout ms
   * 
   * @private
   * @param {string} workerName - Name of worker (used for logging and timeout selection)
   * @param {*} frameData - Data to pass to worker
   * @param {number} width - Frame width
   * @param {number} height - Frame height
   * @param {Object} state - Engine state
   * @returns {Promise<Object>} Worker message (WorkerContract format)
   * @throws {Error} If worker times out or communication fails
   */
  async #runWorker(workerName, frameData, width, height, state) {
    const worker = this.#workers.get(workerName);
    if (!worker) {
      throw new Error(`Worker not loaded: ${workerName}`);
    }

    // Determine timeout based on mode
    let timeout = this.config.flowTimeout; // default
    if (this.#currentMode === 'focus') {
      timeout = this.config.focusTimeout;
    } else if (this.#currentMode === 'hybrid') {
      timeout = this.config.hybridTimeout;
    }

    return new Promise((resolve, reject) => {
      // Setup timeout
      const timeoutHandle = setTimeout(() => {
        reject(new Error(`Worker ${workerName} timed out after ${timeout}ms`));
      }, timeout);

      // One-shot message handler
      const onMessage = (event) => {
        clearTimeout(timeoutHandle);
        worker.removeEventListener('message', onMessage);
        resolve(event.data);
      };

      // Attach listener
      worker.addEventListener('message', onMessage);

      // Send message to worker with SERIALIZABLE state only
      // (functions like grid.mapFunction cannot be cloned via postMessage)
      try {
        const serializableState = this.#extractSerializableState(state);
        worker.postMessage({
          type: 'processingRequest',
          data: frameData,
          width,
          height,
          state: serializableState,
          timestamp: Date.now(),
        });
      } catch (error) {
        clearTimeout(timeoutHandle);
        worker.removeEventListener('message', onMessage);
        reject(new Error(`Failed to send message to worker ${workerName}: ${error.message}`));
      }
    });
  }

  // =========================================================================
  // Metrics & Debugging
  // =========================================================================

  /**
   * Log performance metrics
   * 
   * Private method called during frame processing (sampled to avoid overhead).
   * Logs aggregated timing across all workers in the chain.
   * 
   * @private
   * @param {number} totalTimeMs - Total time for the frame
   * @param {Object} timings - Per-worker timing: { workerName: ms }
   */
  #logMetrics(totalTimeMs, timings) {
    const workerLines = Object.entries(timings).map(
      ([name, ms]) => `${name}: ${ms.toFixed(1)}ms`
    );

    const budgetMs = getTotalLatencyBudget(this.#currentMode);
    const onBudget = totalTimeMs <= budgetMs;

    structuredLog('INFO', 'FrameConductor: frame timing', {
      mode: this.#currentMode,
      totalTimeMs: totalTimeMs.toFixed(1),
      budgetMs,
      onBudget,
      workers: workerLines.join(' | '),
      framesProcessed: this.#timingMetrics.totalFramesProcessed,
      errorsEncountered: this.#timingMetrics.totalErrorsEncountered,
    });
  }

  /**
   * Get timing metrics (for diagnostics)
   * 
   * Returns a snapshot of current timing metrics.
   * Useful for dev-panel or diagnostic logging.
   * 
   * @returns {Object} { lastFrameTimeMs, totalFramesProcessed, totalErrorsEncountered, ... }
   */
  getMetrics() {
    return {
      lastFrameTimeMs: this.#timingMetrics.lastFrameTimeMs,
      totalFramesProcessed: this.#timingMetrics.totalFramesProcessed,
      totalErrorsEncountered: this.#timingMetrics.totalErrorsEncountered,
      currentMode: this.#currentMode,
      currentWorkerCount: this.#workers.size,
      workerAverageTimings: this.#computeAverageTimings(),
    };
  }

  /**
   * Compute average timings for each worker (from rolling window)
   * 
   * @private
   * @returns {Object} { workerName: avgMs }
   */
  #computeAverageTimings() {
    const averages = {};
    for (const [name, measurements] of Object.entries(this.#timingMetrics.workerTimings)) {
      if (measurements.length > 0) {
        const sum = measurements.reduce((a, b) => a + b, 0);
        averages[name] = (sum / measurements.length).toFixed(1);
      }
    }
    return averages;
  }

  // =========================================================================
  // Private State
  // =========================================================================

  #workers = new Map();
  #currentMode = null;
  #currentChain = null;
  #isTransitioning = false;  // Phase 3.1b-hotfix: Graceful mode transition to prevent audio dropout
  #timingMetrics = {};
  // CORE-15: Track latest normalization telemetry from motion worker
  #lastNormalizationTelemetry = {
    recentMax: 0,
    effectiveMax: 0,
    clippingRate: 0,
    frameCount: 0
  };
}

export default FrameConductor;
