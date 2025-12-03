/**
 * @fileoverview Real-Time Latency Measurement System (Phase 5)
 * 
 * Replaces any hardcoded/fake latency values with actual measurements.
 * Implements per-worker latency tracking with circular buffers and validation.
 * 
 * Performance Targets:
 * - Measurement overhead: <1ms per operation
 * - CPU usage: <2% for collection + rendering
 * - Memory: <50MB for 1-hour session
 * 
 * @module latency-measurement
 * @see DEV_PANEL_RESTRUCTURE_PHASES.md - Phase 5 requirements
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const LATENCY_CONFIG = {
  // Buffer sizes
  bufferSize: 300,           // 300 samples (~5 seconds at 60fps)
  workerBufferSize: 100,     // 100 samples per worker
  
  // Thresholds (milliseconds)
  idealLatency: 45,          // Ideal end-to-end latency
  acceptableLatency: 100,    // Acceptable maximum
  criticalLatency: 200,      // Critical threshold
  
  // Jitter targets
  idealJitter: 5,            // Ideal standard deviation
  acceptableJitter: 10,      // Acceptable std dev
  
  // Update intervals
  statsUpdateMs: 100,        // Stats calculation interval
  emitIntervalMs: 1000,      // Event emission interval
  
  // Validation
  maxValidLatency: 5000,     // Reject measurements > 5s (likely errors)
  minValidLatency: 0         // Reject negative values
};

// ============================================================================
// CIRCULAR BUFFER
// ============================================================================

/**
 * Efficient circular buffer using TypedArray for numeric measurements
 */
class LatencyBuffer {
  /** @type {Float64Array} */
  #buffer;
  /** @type {number} */
  #head = 0;
  /** @type {number} */
  #count = 0;
  /** @type {number} */
  #size;
  
  /**
   * @param {number} size - Buffer capacity
   */
  constructor(size = LATENCY_CONFIG.bufferSize) {
    this.#size = size;
    this.#buffer = new Float64Array(size);
  }
  
  /**
   * Push a new measurement
   * @param {number} value - Latency value in ms
   */
  push(value) {
    // Validate measurement
    if (!Number.isFinite(value) || 
        value < LATENCY_CONFIG.minValidLatency || 
        value > LATENCY_CONFIG.maxValidLatency) {
      return; // Skip invalid measurements
    }
    
    this.#buffer[this.#head] = value;
    this.#head = (this.#head + 1) % this.#size;
    if (this.#count < this.#size) {
      this.#count++;
    }
  }
  
  /**
   * Get all values in order (oldest to newest)
   * @returns {number[]}
   */
  toArray() {
    if (this.#count === 0) return [];
    
    const result = new Array(this.#count);
    const start = this.#count < this.#size ? 0 : this.#head;
    
    for (let i = 0; i < this.#count; i++) {
      result[i] = this.#buffer[(start + i) % this.#size];
    }
    
    return result;
  }
  
  /**
   * Get the most recent value
   * @returns {number|null}
   */
  last() {
    if (this.#count === 0) return null;
    const idx = (this.#head - 1 + this.#size) % this.#size;
    return this.#buffer[idx];
  }
  
  /**
   * Get buffer statistics
   * @returns {{mean: number, stdDev: number, min: number, max: number, count: number}}
   */
  getStats() {
    if (this.#count === 0) {
      return { mean: 0, stdDev: 0, min: 0, max: 0, count: 0 };
    }
    
    let sum = 0;
    let min = Infinity;
    let max = -Infinity;
    
    for (let i = 0; i < this.#count; i++) {
      const idx = (this.#head - this.#count + i + this.#size) % this.#size;
      const val = this.#buffer[idx];
      sum += val;
      if (val < min) min = val;
      if (val > max) max = val;
    }
    
    const mean = sum / this.#count;
    
    // Calculate standard deviation
    let variance = 0;
    for (let i = 0; i < this.#count; i++) {
      const idx = (this.#head - this.#count + i + this.#size) % this.#size;
      variance += Math.pow(this.#buffer[idx] - mean, 2);
    }
    const stdDev = Math.sqrt(variance / this.#count);
    
    return { mean, stdDev, min, max, count: this.#count };
  }
  
  /**
   * Clear all measurements
   */
  clear() {
    this.#head = 0;
    this.#count = 0;
    this.#buffer.fill(0);
  }
  
  /**
   * Get buffer size
   * @returns {number}
   */
  get size() {
    return this.#size;
  }
  
  /**
   * Get current count
   * @returns {number}
   */
  get count() {
    return this.#count;
  }
}

// ============================================================================
// LATENCY MEASUREMENT SYSTEM
// ============================================================================

/**
 * Real-time latency measurement system with per-worker tracking
 */
export class LatencyMeasurementSystem {
  /** @type {import('../core/engine.js').Engine|null} */
  #engine = null;
  
  /** @type {LatencyBuffer} */
  #endToEndBuffer;
  
  /** @type {Map<string, LatencyBuffer>} */
  #workerBuffers = new Map();
  
  /** @type {Map<string, number>} */
  #pendingFrames = new Map();
  
  /** @type {number|null} */
  #statsInterval = null;
  
  /** @type {number|null} */
  #emitInterval = null;
  
  /** @type {boolean} */
  #enabled = true;
  
  /** @type {Object} */
  #lastStats = null;
  
  /**
   * @param {import('../core/engine.js').Engine} engine - Application engine
   * @param {Object} [options] - Configuration options
   */
  constructor(engine, options = {}) {
    this.#engine = engine;
    
    // Apply custom configuration
    const config = { ...LATENCY_CONFIG, ...options };
    
    // Initialize buffers
    this.#endToEndBuffer = new LatencyBuffer(config.bufferSize);
    
    // Subscribe to frame events
    this.#subscribeToEvents();
    
    // Start stats calculation interval
    this.#startStatsLoop(config.statsUpdateMs);
    
    // Start event emission interval
    this.#startEmitLoop(config.emitIntervalMs);
  }
  
  /**
   * Subscribe to relevant engine events
   * @private
   */
  #subscribeToEvents() {
    if (!this.#engine?.on) return;
    
    // Frame start - record timestamp
    this.#engine.on('video_frame_captured', (payload) => {
      if (!this.#enabled) return;
      const frameId = payload?.frameId ?? `frame_${performance.now()}`;
      this.#pendingFrames.set(frameId, performance.now());
      
      // Cleanup old pending frames (>10s old)
      this.#cleanupPendingFrames();
    });
    
    // Frame processed - calculate latency
    this.#engine.on('video_frame_processed', (payload) => {
      if (!this.#enabled) return;
      this.#recordFrameLatency(payload);
    });
    
    // Per-worker latency
    this.#engine.on('worker_latency_measured', (payload) => {
      if (!this.#enabled) return;
      this.#recordWorkerLatency(payload);
    });
    
    // Worker stats from instrumented workers
    this.#engine.on('workerStats', (payload) => {
      if (!this.#enabled) return;
      this.#recordWorkerStats(payload);
    });
  }
  
  /**
   * Record end-to-end frame latency
   * @private
   */
  #recordFrameLatency(payload) {
    const frameId = payload?.frameId;
    const now = performance.now();
    
    // Try to match with pending frame
    if (frameId && this.#pendingFrames.has(frameId)) {
      const startTime = this.#pendingFrames.get(frameId);
      const latency = now - startTime;
      this.#endToEndBuffer.push(latency);
      this.#pendingFrames.delete(frameId);
    } else if (payload?.latencyMs !== undefined) {
      // Use provided latency if available
      this.#endToEndBuffer.push(payload.latencyMs);
    } else if (payload?.processingTimeMs !== undefined) {
      // Fall back to processing time
      this.#endToEndBuffer.push(payload.processingTimeMs);
    }
    
    // Record per-worker breakdown if available
    if (payload?.workerBreakdown) {
      for (const [workerName, timing] of Object.entries(payload.workerBreakdown)) {
        this.#recordWorkerLatency({ workerId: workerName, latencyMs: timing });
      }
    }
  }
  
  /**
   * Record per-worker latency
   * @private
   */
  #recordWorkerLatency(payload) {
    const workerId = payload?.workerId ?? payload?.workerName ?? 'unknown';
    const latency = payload?.latencyMs ?? payload?.processingTimeMs;
    
    if (latency === undefined || !Number.isFinite(latency)) return;
    
    // Get or create buffer for this worker
    if (!this.#workerBuffers.has(workerId)) {
      this.#workerBuffers.set(workerId, new LatencyBuffer(LATENCY_CONFIG.workerBufferSize));
    }
    
    this.#workerBuffers.get(workerId).push(latency);
  }
  
  /**
   * Record worker utilization stats
   * @private
   */
  #recordWorkerStats(payload) {
    // These stats come from installWorkerMonitor in workers
    // They include CPU utilization, not just latency
    const workerId = payload?.id ?? 'unknown';
    
    // Utilization is % not ms, so don't add to latency buffer
    // But we can emit this for the dashboard
    if (this.#engine?.emit && payload?.util !== undefined) {
      this.#engine.emit('worker_utilization_measured', {
        workerId,
        utilizationPercent: payload.util,
        intervalMs: payload.intervalMs,
        memory: payload.memory,
        timestamp: performance.now()
      });
    }
  }
  
  /**
   * Cleanup pending frames older than 10 seconds
   * @private
   */
  #cleanupPendingFrames() {
    const now = performance.now();
    const maxAge = 10000; // 10 seconds
    
    for (const [frameId, startTime] of this.#pendingFrames) {
      if (now - startTime > maxAge) {
        this.#pendingFrames.delete(frameId);
      }
    }
  }
  
  /**
   * Start stats calculation loop
   * @private
   */
  #startStatsLoop(intervalMs) {
    this.#statsInterval = setInterval(() => {
      this.#calculateStats();
    }, intervalMs);
  }
  
  /**
   * Start event emission loop
   * @private
   */
  #startEmitLoop(intervalMs) {
    this.#emitInterval = setInterval(() => {
      this.#emitLatencyStats();
    }, intervalMs);
  }
  
  /**
   * Calculate and cache stats
   * @private
   */
  #calculateStats() {
    const endToEndStats = this.#endToEndBuffer.getStats();
    
    // Determine health status
    let status = 'optimal';
    if (endToEndStats.mean > LATENCY_CONFIG.criticalLatency) {
      status = 'critical';
    } else if (endToEndStats.mean > LATENCY_CONFIG.acceptableLatency) {
      status = 'warning';
    } else if (endToEndStats.mean > LATENCY_CONFIG.idealLatency) {
      status = 'acceptable';
    }
    
    // Determine jitter health
    let jitterStatus = 'optimal';
    if (endToEndStats.stdDev > LATENCY_CONFIG.acceptableJitter) {
      jitterStatus = 'warning';
    } else if (endToEndStats.stdDev > LATENCY_CONFIG.idealJitter) {
      jitterStatus = 'acceptable';
    }
    
    // Per-worker stats
    const workerStats = {};
    for (const [workerId, buffer] of this.#workerBuffers) {
      workerStats[workerId] = buffer.getStats();
    }
    
    this.#lastStats = {
      endToEnd: endToEndStats,
      status,
      jitterStatus,
      workers: workerStats,
      timestamp: performance.now(),
      pendingFrames: this.#pendingFrames.size
    };
  }
  
  /**
   * Emit latency stats event
   * @private
   */
  #emitLatencyStats() {
    if (!this.#engine?.emit || !this.#lastStats) return;
    
    this.#engine.emit('latency_stats_updated', {
      ...this.#lastStats,
      historyMs: this.#endToEndBuffer.toArray()
    });
  }
  
  /**
   * Manually record a latency measurement (for external instrumentation)
   * @param {number} latencyMs - Latency value in milliseconds
   * @param {string} [workerId] - Optional worker ID for per-worker tracking
   */
  recordLatency(latencyMs, workerId = null) {
    if (!this.#enabled) return;
    
    if (workerId) {
      this.#recordWorkerLatency({ workerId, latencyMs });
    } else {
      this.#endToEndBuffer.push(latencyMs);
    }
  }
  
  /**
   * Get current statistics
   * @returns {Object|null} Current stats or null if not calculated yet
   */
  getStats() {
    return this.#lastStats;
  }
  
  /**
   * Get end-to-end latency history
   * @returns {number[]} Array of latency values (oldest to newest)
   */
  getHistory() {
    return this.#endToEndBuffer.toArray();
  }
  
  /**
   * Get per-worker statistics
   * @returns {Object} Map of worker ID to stats
   */
  getWorkerStats() {
    const result = {};
    for (const [workerId, buffer] of this.#workerBuffers) {
      result[workerId] = {
        ...buffer.getStats(),
        history: buffer.toArray()
      };
    }
    return result;
  }
  
  /**
   * Check if measurements are within valid range
   * @returns {{valid: boolean, issues: string[]}}
   */
  validateMeasurements() {
    const issues = [];
    const stats = this.#lastStats;
    
    if (!stats || stats.endToEnd.count === 0) {
      issues.push('No measurements collected yet');
      return { valid: false, issues };
    }
    
    if (stats.endToEnd.mean > LATENCY_CONFIG.criticalLatency) {
      issues.push(`Mean latency (${stats.endToEnd.mean.toFixed(1)}ms) exceeds critical threshold (${LATENCY_CONFIG.criticalLatency}ms)`);
    }
    
    if (stats.endToEnd.stdDev > LATENCY_CONFIG.acceptableJitter * 2) {
      issues.push(`Jitter (${stats.endToEnd.stdDev.toFixed(1)}ms) is very high`);
    }
    
    if (this.#pendingFrames.size > 10) {
      issues.push(`${this.#pendingFrames.size} frames pending - possible measurement gaps`);
    }
    
    return {
      valid: issues.length === 0,
      issues
    };
  }
  
  /**
   * Enable measurement collection
   */
  enable() {
    this.#enabled = true;
  }
  
  /**
   * Disable measurement collection
   */
  disable() {
    this.#enabled = false;
  }
  
  /**
   * Reset all measurements
   */
  reset() {
    this.#endToEndBuffer.clear();
    this.#workerBuffers.clear();
    this.#pendingFrames.clear();
    this.#lastStats = null;
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    this.#enabled = false;
    
    if (this.#statsInterval) {
      clearInterval(this.#statsInterval);
      this.#statsInterval = null;
    }
    
    if (this.#emitInterval) {
      clearInterval(this.#emitInterval);
      this.#emitInterval = null;
    }
    
    this.#pendingFrames.clear();
    this.#workerBuffers.clear();
    this.#engine = null;
  }
}

// ============================================================================
// FACTORY & EXPORTS
// ============================================================================

/**
 * Create a latency measurement system instance
 * @param {import('../core/engine.js').Engine} engine
 * @param {Object} [options]
 * @returns {LatencyMeasurementSystem}
 */
export function createLatencyMeasurementSystem(engine, options = {}) {
  return new LatencyMeasurementSystem(engine, options);
}

/**
 * Export LatencyBuffer for external use
 */
export { LatencyBuffer };

/**
 * Export configuration for reference
 */
export { LATENCY_CONFIG };
