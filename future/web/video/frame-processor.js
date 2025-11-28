// filepath: future/web/video/frame-processor.js
import { structuredLog, shouldSample } from '../utils/logging.js';
import { rgbaToY } from './videoframe-helper.js';
import { getGridConfig } from './grids/grid-config.js';
import { 
  executeCriticalOperation, 
  AccessibilityError, 
  showCriticalError 
} from '../utils/error-handling.js';
import { WorkerContract } from './workers/worker-contract.js';
import { FrameConductor } from './frame-conductor.js';
import { AudioRouter } from '../audio/audio-router.js';
import { VIDEO_SOURCE_MANIFEST } from './source/video-source-manifest.js';
import { trackFeatureUse } from '../utils/ingest.js';
import { BufferPool } from '../core/deamons/buffer-pool.js';
import { createMetricsCollector, estimateUtilization } from '../core/metrics-collector.js';
import { VideoSourceFactory } from './video-source-factory.js';

// ============================================================================
// FrameConductor description: R261125-fcd description missing, please describe in great detail FrameConductor
// ============================================================================


// --- Module State ---
let _config = {};
let activeVideoSource = null; // Active video source provider (Canvas or MediaStreamTrack)
let previousDepthPath = null;  // Track depth path for change detection
let lastLoggedMode = null; // Track last logged mode to avoid duplicate logs

// BufferPool: Reusable typed arrays to reduce GC pressure 
// On low-end devices, GC pauses cause audio stutters; pooling reduces allocation frequency
const bufferPool = new BufferPool({
  'Uint32Array': 2  // Pool 2 Uint32Array buffers for delta histograms R261125-dh is this only for the histograms? , if it is we need to enable/disble to reduce cpu usage when needed
});

// FrameConductor: Manifest-driven orchestrator for Flow/Focus/Hybrid modes R261125-fcmdo arent we hardcoding values? is there a use case to have this exposed at Developer Panel?
let frameConductor = null;
let audioRouter = null;
let metricsCollector = null;
const DELTA_HISTOGRAM_BINS = 16;
const DELTA_STATS_FLUSH_INTERVAL = 120;
const PAN_MAX_DELTA = 2;
const INTENSITY_MAX_DELTA = 1;
const PAN_TINY_THRESHOLD = 0.005;
const INTENSITY_TINY_THRESHOLD = 0.01;

function createDeltaHistogramState() {
  return {
    pan: bufferPool.acquire(Uint32Array, DELTA_HISTOGRAM_BINS),
    intensity: bufferPool.acquire(Uint32Array, DELTA_HISTOGRAM_BINS),
    panPrev: null,
    intensityPrev: null,
    panZeroStreak: 0,
    intensityZeroStreak: 0,
    samples: 0,
    recentMeanPanDelta: 0,
    recentMeanIntensityDelta: 0,
    recentVarPanDelta: 0,
    recentVarIntensityDelta: 0,
    lastWindowResetTs: Date.now()
  };
}

function resetDeltaHistogramState() {
  // Release previous buffers back to pool before creating new ones
  if (deltaHistogramState && deltaHistogramState.pan) {
    bufferPool.release(Uint32Array, deltaHistogramState.pan);
  }
  if (deltaHistogramState && deltaHistogramState.intensity) {
    bufferPool.release(Uint32Array, deltaHistogramState.intensity);
  }
  
  deltaHistogramState = createDeltaHistogramState();
  deltaFramesSinceSnapshot = 0;
}

function bucketHistogram(bins, delta, maxDelta) {
  if (maxDelta <= 0) return;
  const normalized = Math.min(1, delta / maxDelta);
  const idx = Math.min(bins.length - 1, Math.floor(normalized * bins.length));
  bins[idx] = (bins[idx] || 0) + 1;
}

function createDeltaSnapshot(hist) {
  return {
    pan: Array.from(hist.pan),
    intensity: Array.from(hist.intensity),
    meanPanDelta: hist.recentMeanPanDelta,
    meanIntensityDelta: hist.recentMeanIntensityDelta,
    zeroPanStreak: hist.panZeroStreak,
    zeroIntensityStreak: hist.intensityZeroStreak,
    samples: hist.samples,
    lastWindowResetTs: hist.lastWindowResetTs
  };
}

function decayHistogram(hist) {
  for (let i = 0; i < hist.pan.length; i++) {
    hist.pan[i] = hist.pan[i] >>> 1;
    hist.intensity[i] = hist.intensity[i] >>> 1;
  }
  hist.samples = hist.samples >>> 1;
  hist.recentVarPanDelta *= 0.5;
  hist.recentVarIntensityDelta *= 0.5;
  hist.lastWindowResetTs = Date.now();
}

function updateDeltaHistogram(pan, intensity, stallStats) {
  if (!stallStats) return;
  const hist = deltaHistogramState;
  if (hist.panPrev === null) {
    hist.panPrev = pan;
    hist.intensityPrev = intensity;
    return;
  }

  const panDelta = Math.abs(pan - hist.panPrev);
  const intensityDelta = Math.abs(intensity - hist.intensityPrev);
  hist.panPrev = pan;
  hist.intensityPrev = intensity;

  bucketHistogram(hist.pan, panDelta, PAN_MAX_DELTA);
  bucketHistogram(hist.intensity, intensityDelta, INTENSITY_MAX_DELTA);

  hist.panZeroStreak = panDelta < PAN_TINY_THRESHOLD ? hist.panZeroStreak + 1 : 0;
  hist.intensityZeroStreak = intensityDelta < INTENSITY_TINY_THRESHOLD ? hist.intensityZeroStreak + 1 : 0;

  hist.samples++;
  if (hist.samples > 0) {
    const panDiff = panDelta - hist.recentMeanPanDelta;
    hist.recentMeanPanDelta += panDiff / hist.samples;
    hist.recentVarPanDelta += panDiff * (panDelta - hist.recentMeanPanDelta);

    const intensityDiff = intensityDelta - hist.recentMeanIntensityDelta;
    hist.recentMeanIntensityDelta += intensityDiff / hist.samples;
    hist.recentVarIntensityDelta += intensityDiff * (intensityDelta - hist.recentMeanIntensityDelta);
  }

  deltaFramesSinceSnapshot++;
  if (deltaFramesSinceSnapshot >= DELTA_STATS_FLUSH_INTERVAL) {
    deltaFramesSinceSnapshot = 0;
    stallStats.deltaSnapshot = createDeltaSnapshot(hist);
    if (hist.samples > 10000) {
      decayHistogram(hist);
    }
  }
}

let deltaHistogramState = createDeltaHistogramState();
let deltaFramesSinceSnapshot = 0;
// Stall watchdog interval reference
let stallWatchdogInterval = null;

// Current mode and grid config are derived from engine state, not stored locally
// This keeps frame-processor stateless for configuration

/**
 * Process frame using Flow mode worker chain via FrameConductor (Phase 3.1b)
 * Sequential processing: motion → grid → params → audio
 * 
 * PERF FIX (Nov 28): Removed legacy fallback code that duplicated FrameConductor logic.
 * The conductor chain (motion → grid → pan-mapper) produces {pan, intensity} directly.
 * If the conductor fails, we log ERROR and return empty - no silent fallback.
 */
async function processFlowMode(frameData, width, height, state) {
  if (!frameConductor) {
    structuredLog('ERROR', 'FrameConductor not initialized', {});
    return { cues: [], panIntensity: { pan: 0, intensity: 0 } };
  }

  try {
    // Use FrameConductor for orchestration - single source of truth
    const result = await frameConductor.processFrame(frameData, width, height, state);
    
    // Initialize return values
    let cues = [];
    let panIntensity = { pan: 0, intensity: 0 };
    
    // PHASE-TRIANGULAR: Check if conductor result contains zone-based cues (from triangular-zone-mapper)
    // Triangular mesh grid produces array of {zone, profile, intensity, pitch, x, y, duration, pan} cues
    if (result.result && Array.isArray(result.result.cues) && result.result.cues.length > 0) {
      cues = result.result.cues;
      
      structuredLog('DEBUG', 'Flow mode: Using zone cues from triangular-zone-mapper', () => ({
        cuesCount: cues.length,
        zones: [...new Set(cues.map(c => c.zone))].join(',')
      }), false, shouldSample('cueGeneration'));
    }
    // Fall back to pan/intensity if no zone cues present
    // The chain (motion → grid → pan-mapper) produces {pan, intensity} directly
    else if (result.result && typeof result.result.pan === 'number' && typeof result.result.intensity === 'number') {
      panIntensity = {
        pan: result.result.pan,
        intensity: result.result.intensity
      };
      
      structuredLog('DEBUG', 'Flow mode: Using conductor pan/intensity', () => ({ 
        panIntensity,
        cuesCount: cues.length 
      }), false, shouldSample('cueGeneration'));
    } else if (result.result && !result.result.empty) {
      // FAIL FAST: Log error if conductor didn't produce expected output
      // This surfaces bugs instead of silently falling back to broken legacy code
      structuredLog('ERROR', 'processFlowMode: Conductor result missing pan/intensity or zone cues', () => ({
        hasResult: !!result.result,
        resultKeys: result.result ? Object.keys(result.result) : [],
        mode: state?.mode,
        hasCues: result.result && Array.isArray(result.result.cues)
      }));
    }
    
    // CORE-15: Return telemetry along with cues for state update
    return { 
      cues, 
      panIntensity,
      normalizationTelemetry: result.normalizationTelemetry 
    };
  } catch (error) {
    structuredLog('ERROR', 'processFlowMode error', { error: error.message });
    return { cues: [], panIntensity: { pan: 0, intensity: 0 } };
  }
}

// --- Video Frame Processing ---
// Frame processing is orchestrated by FrameConductor (Phase 3.1b).
// All worker management (motion, depth, objects) goes through the conductor manifest.
// See frame-conductor.js for worker chain definition and orchestration logic.

/**
 * Simulates object detection based on motion results.
 * In Focus mode, this converts motion data into detected semantic objects.
 * 
 * ⚠️  DEVELOPMENT-ONLY: This is a placeholder function for testing without ML model.
 * It returns simulated confidence/labels and should NOT be used in production.
 * Gate this behind debugConfig.useMocks or similar flag in production code.
 * 
 * @param {object} motionResults - Results from motion worker containing movingRegions, etc.
 * @param {boolean} useMocks - Whether to allow mock/simulated data (development-only)
 * @returns {object} Object detection results with detectedObjects array
 */
async function simulateObjectDetection(motionResults = {}, useMocks = false) {
  // STRICT GATING: Do not return simulated data unless explicitly enabled for development
  if (!useMocks) {
    structuredLog('DEBUG', 'simulateObjectDetection blocked: useMocks=false. Placeholder function for development only.');
    return { detectedObjects: [] };
  }

  try {
    // If no semantic detection is enabled or no motion, return empty
    if (!motionResults.objects || motionResults.objects.length === 0) {
      return { detectedObjects: [] };
    }

    // In a real implementation, this would run an ML model (TensorFlow, etc.)
    // For now, we simulate by treating the first motion object as a detected object
    const detectedObjects = motionResults.objects.slice(0, 1).map((obj, idx) => ({
      id: `obj_${idx}`,
      label: obj.label || 'unknown_object',
      confidence: Math.min(1.0, obj.confidence || 0.7),
      position: obj.position || { x: 0, y: 0, z: 0 },
      boundingBox: obj.boundingBox || { x: 0, y: 0, width: 100, height: 100 }
    }));

    return { detectedObjects };
  } catch (e) {
    structuredLog('WARN', 'simulateObjectDetection failed', { error: e?.message || String(e) });
    return { detectedObjects: [] };
  }
}

/**
 * Simulates shape analysis for a detected object.
 * Provides additional shape metadata (texture, edges, corners) for grid mapping.
 * 
 * ⚠️  DEVELOPMENT-ONLY: This is a placeholder function for testing without ML model.
 * It returns simulated shape data and should NOT be used in production.
 * Gate this behind debugConfig.useMocks or similar flag in production code.
 * 
 * @param {object} detectedObject - A detected object from object detection
 * @param {boolean} useMocks - Whether to allow mock/simulated data (development-only)
 * @returns {object} Shape analysis results
 */
async function simulateShapeAnalysis(detectedObject = {}, useMocks = false) {
  // STRICT GATING: Do not return simulated data unless explicitly enabled for development
  if (!useMocks) {
    structuredLog('DEBUG', 'simulateShapeAnalysis blocked: useMocks=false. Placeholder function for development only.');
    return {
      shapeType: 'unknown',
      edges: [],
      texture: [],
      movingRegions: []
    };
  }

  try {
    if (!detectedObject.id) {
      return { 
        shapeType: 'unknown',
        edges: [],
        texture: [],
        movingRegions: [] 
      };
    }

    // In a real implementation, this would analyze pixel-level features
    // For now, we return a basic shape analysis structure
    return {
      shapeType: detectedObject.label || 'generic',
      confidence: detectedObject.confidence || 0.5,
      edges: [],
      texture: [],
      // Simulate some motion regions based on the object's bounding box
      movingRegions: [{
        x: detectedObject.position?.x || 0.5,
        y: detectedObject.position?.y || 0.5,
        intensity: (detectedObject.confidence || 0.7) * 100
      }]
    };
  } catch (e) {
    structuredLog('WARN', 'simulateShapeAnalysis failed', { error: e?.message || String(e) });
    return {
      shapeType: 'unknown',
      edges: [],
      texture: [],
      movingRegions: []
    };
  }
}

/**
 * WARNING R261125-cbp THIS IS AN ANTI-PATTERN TO ME (MAMware) DONT WE HAVE A NEW METHOD as per `future/web/video/source` ?
 * Canvas-based path for video frame capture if no MediaStreamTrackProcessor support is available.
 * This runs frame capture in the main thread and processes frames through the audio pipeline.
 * Slower than MediaStreamTrackProcessor but works in all browsers (Firefox, Safari, iOS).
 * 
 * NOTE: Frame processing logic for Flow/Focus modes uses FrameConductor for
 * manifest-driven worker orchestration (Phase 3.1b). Canvas is available
 * for browsers without OffscreenCanvas, using processFlowMode for motion detection.
 * Both paths produce identical audio cues.
 * 
 * @param {HTMLVideoElement} videoElement - The video element to capture from
 * @param {object} engine - The state engine
 * @returns {Promise<object>} Control interface { start, stop, dispose }
 */
async function initializeVideoCanvasFallback(videoElement, engine) {
  structuredLog('INFO', 'Using canvas-based video capture (fallback mode)');
  
  // CRITICAL FIX: Track canvas in state for timeout adaptation
  if (engine?.state?.videoCapture) {
    engine.state.videoCapture.usingCanvas = true;
    engine.state.videoCapture.detectedAt = Date.now();
    structuredLog('DEBUG', 'Canvas fallback detected - state updated for timeout adaptation', {
      timestamp: engine.state.videoCapture.detectedAt
    });
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth || 640;
  canvas.height = videoElement.videoHeight || 480;
  
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }
  
  let frameCounter = 0;
  let isRunning = false;
  let lastFrameTime = 0;
  const minFrameInterval = 66; // ~15fps target (milliseconds)
  
  // Main frame capture loop
  async function captureFrame() {
    if (!isRunning) return;
    
    const now = performance.now();
    if (now - lastFrameTime < minFrameInterval) {
      requestAnimationFrame(captureFrame);
      return;
    }
    lastFrameTime = now;
    
    try {
      // Update canvas if video element size changed
      if (canvas.width !== videoElement.videoWidth || canvas.height !== videoElement.videoHeight) {
        canvas.width = videoElement.videoWidth || 320;
        canvas.height = videoElement.videoHeight || 240;
        structuredLog('DEBUG', 'Canvas fallback: Video size changed', {
          width: canvas.width,
          height: canvas.height
        });
      }
      
      // Draw current video frame to canvas
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // Extract image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      frameCounter++;
      
      // Simulate frame processing (same interface as worker-based approach)
      const state = engine.getState();
      // Use direct reference to avoid unnecessary buffer copy (imageData.data is already Uint8ClampedArray)
      const frameData = imageData.data;
      const grid = _config.getCurrentGrid();
      let dispatchPayload = null;
      
      // Only log every 30th frame to avoid flooding console
      if (frameCounter % 30 === 0) {
        structuredLog('DEBUG', 'Canvas fallback: Frame captured', {
          frameId: frameCounter,
          mode: state.currentMode,
          hasGrid: !!grid,
          width: canvas.width,
          height: canvas.height
        });
      }
      
      if (state.currentMode === 'flow') {
        const flowResult = await processFlowMode(frameData, canvas.width, canvas.height, state);
        
        // CORE-15: Update normalization telemetry in engine state if available
        if (flowResult && flowResult.normalizationTelemetry) {
          engine.setState({ 
            normalizationTelemetry: flowResult.normalizationTelemetry 
          });
        }
        
        if (flowResult && flowResult.cues) {
          if (flowResult.cues.length > 0) {
            dispatchPayload = flowResult;
            if (frameCounter % 30 === 0) {
              structuredLog('DEBUG', 'Canvas fallback: Flow mode cues generated', {
                cuesCount: flowResult.cues.length,
                pan: flowResult.panIntensity?.pan.toFixed(2),
                intensity: flowResult.panIntensity?.intensity.toFixed(2)
              });
            }
          } else {
            dispatchPayload = { cues: [], panIntensity: flowResult.panIntensity };
            if (frameCounter % 100 === 0) {
              structuredLog('DEBUG', 'Canvas fallback: No motion or intensity too low', {
                panIntensity: flowResult.panIntensity
              });
            }
          }
        } else {
          dispatchPayload = { cues: [], panIntensity: { pan: 0, intensity: 0 } };
        }
      } else if (state.currentMode === 'focus') {
        const motionResults = await frameConductor.processFrame(frameData, canvas.width, canvas.height, state);
        
        dispatchPayload = {
          cues: motionResults.objects || [],
          motion: motionResults,
          specialists
        };
      }
      
      // Dispatch audio cues via AudioRouter (ADR-0006)
      if (dispatchPayload && audioRouter) {
        audioRouter.route(dispatchPayload, state);
      }
      
    } catch (e) {
      structuredLog('ERROR', 'Canvas fallback frame capture error', {
        error: e?.message || String(e),
        frameId: frameCounter
      });
    }
    
    if (isRunning) {
      requestAnimationFrame(captureFrame);
    }
  }
  
  // Start the frame capture loop
  isRunning = true;
  requestAnimationFrame(captureFrame);
  
  structuredLog('INFO', 'Canvas fallback video capture started');
  
  return {
    start: () => {
      isRunning = true;
      requestAnimationFrame(captureFrame);
      structuredLog('DEBUG', 'Canvas fallback: Capture resumed');
    },
    stop: () => {
      isRunning = false;
      structuredLog('DEBUG', 'Canvas fallback: Capture stopped');
    },
    dispose: () => {
      isRunning = false;
      ctx = null;
      canvas = null;
      structuredLog('DEBUG', 'Canvas fallback: Disposed');
    }
  };
}

/**
 * Initializes the modern, off-thread video processing pipeline.
 * This is the single, correct entry point for video processing. //single? R281025
 */
export async function initializeVideo(config) {
  _config = { ..._config, ...config };
  
  structuredLog('DEBUG', 'initializeVideo: Starting video pipeline initialization', config);

  // Get current mode from engine state
  const currentMode = config.engine?.getState?.()?.currentMode || 'flow';
  
  // Dispose existing FrameConductor before re-initialization
  // Prevents orphaned workers if initializeVideo is called multiple times without stopProcessing
  if (frameConductor) {
    structuredLog('DEBUG', 'Disposing existing FrameConductor before re-initialization');
    frameConductor.dispose();
    frameConductor = null;
  }
  
  // Initialize FrameConductor (Phase 3.1b - manifest-driven worker orchestration)
  // Single source of truth for video worker lifecycle management across all modes.
  // CRITICAL FIX: Pass engine so timeout config can detect canvas fallback
  frameConductor = new FrameConductor({
    engine: config.engine,  // Pass engine for state-aware timeout calculation
    flowTimeout: 100,
    focusTimeout: 200,
    hybridTimeout: 10,
    logMetrics: true,
    logFrames: true,
    // Optional debug-only worker filter; may be set by dev panel
    debugWorkerEnabled: config.debugWorkerEnabled || null,
  });
  
  // Initialize AudioRouter (ADR-0006)
  audioRouter = new AudioRouter(config.engine);

  // Initialize MetricsCollector (Phase 2A: Orchestration Visibility)
  metricsCollector = createMetricsCollector({
    bufferSize: 100,
    samplingRate: 100
  });

  // Initialize conductor for default mode
  try {
    await frameConductor.initializeForMode(currentMode);
    structuredLog('INFO', 'FrameConductor initialized', { mode: currentMode });
  } catch (error) {
    structuredLog('ERROR', 'FrameConductor initialization failed', { mode: currentMode, error: error.message });
  }

  return await executeCriticalOperation('video-processing', async () => {
    const { videoElement, engine } = config;
    if (!videoElement || !videoElement.srcObject) {
      throw new AccessibilityError(
        "Camera access is required for visual-to-audio conversion",
        'VIDEO_SOURCE_UNAVAILABLE',
        { hasVideoElement: !!videoElement, hasSrcObject: !!videoElement?.srcObject }
      );
    }
    
    // Only log video validation occasionally to reduce dev panel spam
    if (shouldSample('frameProcessing')) {
      structuredLog('DEBUG', 'initializeVideo: Video element validated', { 
        hasVideoElement: !!videoElement, 
        hasSrcObject: !!videoElement.srcObject,
        videoWidth: videoElement.videoWidth,
        videoHeight: videoElement.videoHeight 
      });
    }
    
    // ============================================================================
    // MANIFEST STRATEGY: Capability-based video source selection (ADR-0011)
    // Replaces exception-based fallback pattern with first-class strategies.
    // ============================================================================
    
    // Define frame processing callback for source strategies
    const onFrameCallback = async (frameEvent) => {
      const { type, payload } = frameEvent;
      if (type !== 'frame') return;

      // Start metrics collection for this frame
      const endFrameMetrics = metricsCollector ? metricsCollector.startFrame() : () => {};

      const state = engine.getState();
      const frameData = new Uint8ClampedArray(payload.imageDataBuffer);
      const grid = _config.getCurrentGrid();
      let dispatchPayload = null;
      
      // Access stallStats (guaranteed to exist in state.js); mutate in place
      const stallStats = state.stallStats || { deltaSnapshot: { pan: [], intensity: [] } };
      state.stallStats = stallStats;
      stallStats.lastFrameId = payload.frameId;

      // Only log every 30th frame to avoid flooding console
      if (payload.frameId && payload.frameId % 30 === 0) {
        structuredLog('DEBUG', 'Frame processor: Received frame', { 
          mode: state.currentMode, 
          hasGrid: !!grid, 
          gridId: grid?.id 
        });
      }

      // Process frame based on current mode (same logic as before)
      if (state.currentMode === 'flow') {
        const flowResult = await processFlowMode(frameData, payload.width, payload.height, state);
        
        // Always set dispatchPayload, even if cues are empty (important for audio state)
        if (flowResult && flowResult.cues) {
          if (flowResult.cues.length > 0) {
            dispatchPayload = flowResult;
            
            // Sample log for successful motion detection
            if (payload.frameId && payload.frameId % 30 === 0) {
              structuredLog('DEBUG', 'Frame processor: Flow mode cues generated', {
                cuesCount: flowResult.cues.length,
                pan: flowResult.panIntensity?.pan.toFixed(2),
                intensity: flowResult.panIntensity?.intensity.toFixed(2)
              });
            }
          } else {
            // Motion detected but intensity too low - still dispatch empty
            dispatchPayload = { cues: [], panIntensity: flowResult.panIntensity };
            
            if (payload.frameId && payload.frameId % 100 === 0) {
              structuredLog('DEBUG', 'Frame processor: Flow mode - no motion or intensity too low', {
                panIntensity: flowResult.panIntensity
              });
            }
          }
        } else {
          // Timeout or error - dispatch empty safely
          dispatchPayload = { cues: [], panIntensity: { pan: 0, intensity: 0 } };
        }
      } else if (state.currentMode === 'focus') {
        // In Focus mode, use FrameConductor for all worker orchestration
        const motionResults = await frameConductor.processFrame(frameData, payload.width, payload.height, state);
        const objectResults = motionResults.result || {};

        if (objectResults.detectedObjects && objectResults.detectedObjects.length > 0) {
          const mainObject = objectResults.detectedObjects[0];
          const useMocks = state.debugConfig && state.debugConfig.useMocks === true;
          const shapeResults = await simulateShapeAnalysis(mainObject, useMocks);

          const primaryCue = {
            objectType: mainObject.label,
            intensity: mainObject.confidence,
            position: mainObject.position,
            isPrimary: true
          };

          let secondaryCues = [];
          if (grid && grid.mapFunction) {
            const gridOutput = grid.mapFunction(null, payload.width, payload.height, null, shapeResults);
            secondaryCues = (gridOutput && gridOutput.cues) || [];
          }
          structuredLog('DEBUG', 'Grid cues generated', { cueCount: secondaryCues.length, mode: state.currentMode, motionPresent: !!objectResults });

          if (secondaryCues.length === 0) {
            secondaryCues.push({ pitch: 440, intensity: 0.8, position: mainObject.position }); //R251125fp this hardcoding does not make sense to me, why and what is this for?
          }

          const combinedCues = [primaryCue, ...secondaryCues];
          dispatchPayload = { cues: combinedCues };
        } else {
          if (grid && grid.mapFunction) {
            const gridOutput = grid.mapFunction(frameData, payload.width, payload.height, null, motionResults);
            if (gridOutput && gridOutput.cues && gridOutput.cues.length > 0) {
              dispatchPayload = { cues: gridOutput.cues };
              structuredLog('DEBUG', 'Focus mode fallback: Using motion-based cues', { cueCount: gridOutput.cues.length });
            }
          }
        }
      }
      
      if (dispatchPayload) {
        const panIntensity = dispatchPayload.panIntensity || { pan: 0, intensity: 0 };
        const pan = panIntensity.pan ?? 0;
        const intensity = panIntensity.intensity ?? 0;
        updateDeltaHistogram(pan, intensity, stallStats);
        
        const PAN_DELTA_THRESHOLD = 0.01;
        const INTENSITY_DELTA_THRESHOLD = 0.01;
        const panChanged = Math.abs(pan - stallStats.lastPan) > PAN_DELTA_THRESHOLD;
        const intensityChanged = Math.abs(intensity - stallStats.lastIntensity) > INTENSITY_DELTA_THRESHOLD;
        if (panChanged || intensityChanged) {
          stallStats.unchangedPanFrames = 0;
          stallStats.lastPan = pan;
          stallStats.lastIntensity = intensity;
        } else {
          stallStats.unchangedPanFrames++;
        }
        
        const routeResult = audioRouter.route(dispatchPayload, state);
        
        stallStats.lastAudioCueTs = Date.now();
        stallStats.lastCueCount = routeResult.cueCount;
        if (stallStats.stallDetected && stallStats.lastCueCount > 0) {
          stallStats.stallDetected = false;
        }
        
        if (payload.frameId && payload.frameId % 60 === 0) {
          structuredLog('DEBUG', 'STALL_STATS_SAMPLE', {
            lastAudioCueTs: stallStats.lastAudioCueTs,
            unchangedPanFrames: stallStats.unchangedPanFrames,
            stallDetected: stallStats.stallDetected,
            stallCount: stallStats.stallCount,
            lastCueCount: stallStats.lastCueCount
          });
          
          try {
            const snap = stallStats.deltaSnapshot || createDeltaSnapshot({
              pan: new Uint32Array(DELTA_HISTOGRAM_BINS),
              intensity: new Uint32Array(DELTA_HISTOGRAM_BINS)
            });
            const payloadSnapshot = {
              frameId: payload.frameId,
              meanPanDelta: snap.meanPanDelta,
              meanIntensityDelta: snap.meanIntensityDelta,
              zeroPanStreak: snap.zeroPanStreak,
              zeroIntensityStreak: snap.zeroIntensityStreak,
              pan: Array.from(snap.pan || []),
              intensity: Array.from(snap.intensity || [])
            };
            engine.dispatch && engine.dispatch('deltaHistogramSnapshot', payloadSnapshot);
          } catch (e) {
            structuredLog('ERROR', 'Failed to emit delta histogram snapshot', { error: e?.message || String(e) });
          }
        }
      }

      // End metrics collection and update orchestration state
      if (metricsCollector) {
        metricsCollector.endFrame({
          resolutionWidth: payload.width,
          resolutionHeight: payload.height,
          memoryUsageMB: (performance.memory?.usedJSHeapSize || 0) / 1048576
        });
        
        // Dispatch metrics update periodically (e.g. every 10 frames) to keep UI fresh but not spam
        if (payload.frameId && payload.frameId % 10 === 0) {
           const agg = metricsCollector.getAggregatedMetrics();
           const util = estimateUtilization(agg);
           
           const metrics = {
             fps: agg.fps,
             frameExtractionTimeMs: agg.avgExtractionTimeMs,
             gridMappingTimeMs: agg.avgMappingTimeMs,
             audioProcessingTimeMs: agg.avgProcessingTimeMs,
             totalCycleTimeMs: agg.avgTotalTimeMs,
             resolutionWidth: agg.avgResolutionWidth,
             resolutionHeight: agg.avgResolutionHeight,
             memoryUsageMB: agg.memoryUsageMB,
             gpuUtilization: util.gpuUtilization,
             underutilization: Math.max(0, 100 - util.cpuUtilization) // CPU Idle
           };
           
           engine.dispatch('updateOrchestration', { 
             metrics,
             isProcessing: true,
             activeExtractor: activeVideoSource?.name || 'unknown'
           });
        }
      }
    };
    
    activeVideoSource = await VideoSourceFactory.createSource(videoElement, engine, _config, onFrameCallback);
    return activeVideoSource;
  }, { 
    videoElement: config?.videoElement, 
    hasCamera: !!config?.videoElement?.srcObject 
  });
}



/**
 * Dispose video processor and clean up all resources (Phase 3.1b).
 * Call this on app shutdown to terminate workers and free memory.
 * 
 * This function:
 * - Disposes active video source provider (CanvasSource or MediaStreamTrackSource)
 * - Disposes FrameConductor and all its manifest-managed workers
 * - Clears module state
 */
export function disposeVideo() {
  try {
    // Dispose active video source provider (Manifest Strategy ADR-0011)
    if (activeVideoSource) {
      activeVideoSource.dispose();
      activeVideoSource = null;
      structuredLog('INFO', 'Active video source provider disposed');
    }
    
    // Phase 3.1b: Dispose FrameConductor (terminates all manifest-managed workers)
    if (frameConductor) {
      frameConductor.dispose();
      frameConductor = null;
      structuredLog('INFO', 'FrameConductor disposed (all workers terminated)');
    }
    
    // Clean up buffer pool (release buffers and clear cache)
    if (deltaHistogramState && deltaHistogramState.pan) {
      bufferPool.release(Uint32Array, deltaHistogramState.pan);
    }
    if (deltaHistogramState && deltaHistogramState.intensity) {
      bufferPool.release(Uint32Array, deltaHistogramState.intensity);
    }
    bufferPool.clear();
    
    // Reset module state
    _config = {};
    
    structuredLog('INFO', 'Video processor fully disposed');
  } catch (error) {
    structuredLog('ERROR', 'Error during video processor disposal', { 
      error: error.message 
    });
  }
}