/**
 * delta-histogram.js - Telemetry Collector for Pan/Intensity Deltas
 * 
 * Extracted from frame-processor.js as part of SRP refactoring (ADR-0011).
 * Tracks frame-to-frame changes in pan and intensity values to detect:
 * - Motion stalls (zero delta streaks)
 * - Signal variability (mean/variance tracking)
 * - Distribution patterns (histogram bins)
 * 
 * Used by frame-processor.js orchestrator to populate stallStats for UI diagnostics.
 * 
 * @module video/telemetry/delta-histogram
 */

import { BufferPool } from '../../core/deamons/buffer-pool.js';

// ============================================================================
// Constants - Shared configuration for histogram collection R281125-hc dont we have this at constants.js? 
// ============================================================================

/** Number of bins for delta distribution histogram */
export const DELTA_HISTOGRAM_BINS = 16;

/** Frames between snapshot emissions to engine */
export const DELTA_STATS_FLUSH_INTERVAL = 120;

/** Maximum expected pan delta for normalization */
export const PAN_MAX_DELTA = 2;

/** Maximum expected intensity delta for normalization */
export const INTENSITY_MAX_DELTA = 1;

/** Pan delta below this threshold counts as "zero" for streak tracking */
export const PAN_TINY_THRESHOLD = 0.005;

/** Intensity delta below this threshold counts as "zero" for streak tracking */
export const INTENSITY_TINY_THRESHOLD = 0.01;

// ============================================================================
// DeltaHistogramCollector Class
// ============================================================================

/**
 * Collects delta statistics for pan and intensity values across frames.
 * 
 * Features:
 * - Histogram binning: Tracks distribution of delta magnitudes
 * - Welford's algorithm: Running mean/variance without storing all values
 * - Zero-streak detection: Counts consecutive near-zero deltas (stall indicator)
 * - Decay mechanism: Prevents unbounded growth on long sessions
 * - BufferPool integration: Reuses typed arrays to reduce GC pressure
 * 
 * @example
 * const collector = new DeltaHistogramCollector(bufferPool);
 * 
 * // In frame loop:
 * const snapshot = collector.update(pan, intensity);
 * if (snapshot) {
 *   engine.dispatch('deltaHistogramSnapshot', snapshot);
 * }
 * 
 * // On dispose:
 * collector.dispose();
 */
export class DeltaHistogramCollector {
  /**
   * @param {BufferPool} bufferPool - Pool for typed array reuse (optional, creates internal if not provided)
   * @param {Object} config - Optional configuration overrides
   * @param {number} config.bins - Number of histogram bins (default: 16)
   * @param {number} config.flushInterval - Frames between snapshots (default: 120)
   */
  constructor(bufferPool = null, config = {}) {
    this._bufferPool = bufferPool || new BufferPool({ 'Uint32Array': 2 });
    this._ownsBufferPool = !bufferPool; // Track if we created it (for disposal)
    
    this._config = {
      bins: config.bins || DELTA_HISTOGRAM_BINS,
      flushInterval: config.flushInterval || DELTA_STATS_FLUSH_INTERVAL,
      panMaxDelta: config.panMaxDelta || PAN_MAX_DELTA,
      intensityMaxDelta: config.intensityMaxDelta || INTENSITY_MAX_DELTA,
      panTinyThreshold: config.panTinyThreshold || PAN_TINY_THRESHOLD,
      intensityTinyThreshold: config.intensityTinyThreshold || INTENSITY_TINY_THRESHOLD
    };
    
    this._state = this._createState();
    this._framesSinceSnapshot = 0;
  }

  /**
   * Creates initial histogram state with pooled buffers
   * @private
   */
  _createState() {
    return {
      pan: this._bufferPool.acquire(Uint32Array, this._config.bins),
      intensity: this._bufferPool.acquire(Uint32Array, this._config.bins),
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

  /**
   * Places a delta value into the appropriate histogram bin
   * @private
   * @param {Uint32Array} bins - Histogram bins array
   * @param {number} delta - Absolute delta value
   * @param {number} maxDelta - Maximum expected delta for normalization
   */
  _bucketHistogram(bins, delta, maxDelta) {
    if (maxDelta <= 0) return;
    const normalized = Math.min(1, delta / maxDelta);
    const idx = Math.min(bins.length - 1, Math.floor(normalized * bins.length));
    bins[idx] = (bins[idx] || 0) + 1;
  }

  /**
   * Creates a snapshot of current histogram state for emission
   * @private
   * @returns {Object} Snapshot with histogram arrays and statistics
   */
  _createSnapshot() {
    const hist = this._state;
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

  /**
   * Applies exponential decay to histogram bins to prevent unbounded growth
   * @private
   */
  _decayHistogram() {
    const hist = this._state;
    for (let i = 0; i < hist.pan.length; i++) {
      hist.pan[i] = hist.pan[i] >>> 1;
      hist.intensity[i] = hist.intensity[i] >>> 1;
    }
    hist.samples = hist.samples >>> 1;
    hist.recentVarPanDelta *= 0.5;
    hist.recentVarIntensityDelta *= 0.5;
    hist.lastWindowResetTs = Date.now();
  }

  /**
   * Updates histogram with new pan/intensity values.
   * 
   * @param {number} pan - Current pan value (-1 to 1)
   * @param {number} intensity - Current intensity value (0 to 1)
   * @returns {Object|null} Snapshot if flush interval reached, null otherwise
   */
  update(pan, intensity) {
    const hist = this._state;
    const cfg = this._config;
    
    // First frame: initialize previous values, no delta yet
    if (hist.panPrev === null) {
      hist.panPrev = pan;
      hist.intensityPrev = intensity;
      return null;
    }

    // Calculate deltas
    const panDelta = Math.abs(pan - hist.panPrev);
    const intensityDelta = Math.abs(intensity - hist.intensityPrev);
    hist.panPrev = pan;
    hist.intensityPrev = intensity;

    // Update histogram bins
    this._bucketHistogram(hist.pan, panDelta, cfg.panMaxDelta);
    this._bucketHistogram(hist.intensity, intensityDelta, cfg.intensityMaxDelta);

    // Track zero-delta streaks (stall detection)
    hist.panZeroStreak = panDelta < cfg.panTinyThreshold ? hist.panZeroStreak + 1 : 0;
    hist.intensityZeroStreak = intensityDelta < cfg.intensityTinyThreshold ? hist.intensityZeroStreak + 1 : 0;

    // Welford's online algorithm for running mean/variance
    hist.samples++;
    if (hist.samples > 0) {
      const panDiff = panDelta - hist.recentMeanPanDelta;
      hist.recentMeanPanDelta += panDiff / hist.samples;
      hist.recentVarPanDelta += panDiff * (panDelta - hist.recentMeanPanDelta);

      const intensityDiff = intensityDelta - hist.recentMeanIntensityDelta;
      hist.recentMeanIntensityDelta += intensityDiff / hist.samples;
      hist.recentVarIntensityDelta += intensityDiff * (intensityDelta - hist.recentMeanIntensityDelta);
    }

    // Check if it's time to emit a snapshot
    this._framesSinceSnapshot++;
    if (this._framesSinceSnapshot >= cfg.flushInterval) {
      this._framesSinceSnapshot = 0;
      const snapshot = this._createSnapshot();
      
      // Apply decay if samples are getting too large
      if (hist.samples > 10000) {
        this._decayHistogram();
      }
      
      return snapshot;
    }

    return null;
  }

  /**
   * Gets current zero-streak values for external stall detection
   * @returns {Object} { panZeroStreak, intensityZeroStreak }
   */
  getStreaks() {
    return {
      panZeroStreak: this._state.panZeroStreak,
      intensityZeroStreak: this._state.intensityZeroStreak
    };
  }

  /**
   * Gets current sample count
   * @returns {number}
   */
  getSampleCount() {
    return this._state.samples;
  }

  /**
   * Resets histogram state (e.g., on mode change)
   */
  reset() {
    // Release current buffers back to pool
    if (this._state.pan) {
      this._bufferPool.release(Uint32Array, this._state.pan);
    }
    if (this._state.intensity) {
      this._bufferPool.release(Uint32Array, this._state.intensity);
    }
    
    // Create fresh state
    this._state = this._createState();
    this._framesSinceSnapshot = 0;
  }

  /**
   * Disposes collector and releases all resources.
   * Call this on app shutdown.
   */
  dispose() {
    // Release buffers
    if (this._state.pan) {
      this._bufferPool.release(Uint32Array, this._state.pan);
      this._state.pan = null;
    }
    if (this._state.intensity) {
      this._bufferPool.release(Uint32Array, this._state.intensity);
      this._state.intensity = null;
    }
    
    // Clear pool if we created it
    if (this._ownsBufferPool) {
      this._bufferPool.clear();
    }
  }
}
