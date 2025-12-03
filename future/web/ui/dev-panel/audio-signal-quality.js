/**
 * @fileoverview Audio Signal Quality Measurement System (Phase 5)
 * 
 * Implements comprehensive audio signal analysis:
 * - Signal clipping detection (% samples exceeding ±1.0)
 * - Noise floor measurement (dBFS during silent periods)
 * - FFT spectrum analysis for visualization
 * - Buffer health monitoring (underruns/overruns)
 * 
 * Performance Targets:
 * - Clipping detection: <1ms per buffer
 * - FFT calculation: <20ms (uses AnalyserNode when possible)
 * - Memory: Uses typed arrays for efficiency
 * 
 * @module audio-signal-quality
 * @see DEV_PANEL_RESTRUCTURE_PHASES.md - Phase 5 requirements
 */

// ============================================================================
// CONSTANTS
// ============================================================================

const AUDIO_QUALITY_CONFIG = {
  // Clipping detection
  clippingThreshold: 0.99,     // Samples >= this are considered clipping
  clippingWindowSize: 2048,    // Samples per analysis window
  
  // Noise floor
  noiseFloorThreshold: 0.01,   // Samples below this = "silence"
  noiseFloorWindowMs: 500,     // Window for noise floor calculation
  targetNoiseFloorDB: -80,     // Target noise floor in dBFS
  
  // FFT
  fftSize: 2048,               // FFT size (power of 2)
  smoothingTimeConstant: 0.8,  // FFT smoothing (0-1)
  
  // Buffer health
  bufferTargetMs: 128,         // Target buffer size
  bufferWarningMs: 64,         // Warning threshold
  bufferCriticalMs: 32,        // Critical threshold
  
  // Update intervals
  analysisIntervalMs: 100,     // How often to analyze
  emitIntervalMs: 500          // How often to emit events
};

// ============================================================================
// SIGNAL QUALITY ANALYZER
// ============================================================================

/**
 * Audio signal quality analyzer
 */
export class AudioSignalQualityAnalyzer {
  /** @type {import('../core/engine.js').Engine|null} */
  #engine = null;
  
  /** @type {AudioContext|null} */
  #audioContext = null;
  
  /** @type {AnalyserNode|null} */
  #analyser = null;
  
  /** @type {Float32Array|null} */
  #timeDomainData = null;
  
  /** @type {Float32Array|null} */
  #frequencyData = null;
  
  /** @type {number|null} */
  #analysisInterval = null;
  
  /** @type {number|null} */
  #emitInterval = null;
  
  /** @type {boolean} */
  #enabled = true;
  
  /** @type {Object} */
  #metrics = {
    clippingPercent: 0,
    clippingSamples: 0,
    totalSamples: 0,
    noiseFloorDB: -Infinity,
    peakDB: -Infinity,
    rmsDB: -Infinity,
    bufferUnderruns: 0,
    bufferOverruns: 0,
    bufferHealthPercent: 100
  };
  
  /** @type {Float32Array|null} */
  #spectrum = null;
  
  /**
   * @param {import('../core/engine.js').Engine} engine - Application engine
   * @param {Object} [options] - Configuration options
   */
  constructor(engine, options = {}) {
    this.#engine = engine;
    
    // Apply custom configuration
    const config = { ...AUDIO_QUALITY_CONFIG, ...options };
    
    // Subscribe to engine events
    this.#subscribeToEvents();
    
    // Start analysis loop
    this.#startAnalysisLoop(config.analysisIntervalMs);
    
    // Start emit loop
    this.#startEmitLoop(config.emitIntervalMs);
  }
  
  /**
   * Connect to an AudioContext for direct analysis
   * @param {AudioContext} audioContext - The audio context to analyze
   * @param {AudioNode} [sourceNode] - Optional source node to connect
   */
  connectAudioContext(audioContext, sourceNode = null) {
    this.#audioContext = audioContext;
    
    // Create analyser node
    this.#analyser = audioContext.createAnalyser();
    this.#analyser.fftSize = AUDIO_QUALITY_CONFIG.fftSize;
    this.#analyser.smoothingTimeConstant = AUDIO_QUALITY_CONFIG.smoothingTimeConstant;
    
    // Allocate typed arrays
    this.#timeDomainData = new Float32Array(this.#analyser.fftSize);
    this.#frequencyData = new Float32Array(this.#analyser.frequencyBinCount);
    this.#spectrum = new Float32Array(this.#analyser.frequencyBinCount);
    
    // Connect source if provided
    if (sourceNode) {
      sourceNode.connect(this.#analyser);
    }
    
    // Don't connect analyser to destination (silent analysis)
  }
  
  /**
   * Subscribe to engine events for buffer health
   * @private
   */
  #subscribeToEvents() {
    if (!this.#engine?.on) return;
    
    // Buffer underrun events
    this.#engine.on('audio_buffer_underrun', () => {
      if (!this.#enabled) return;
      this.#metrics.bufferUnderruns++;
      this.#updateBufferHealth();
    });
    
    // Buffer overrun events
    this.#engine.on('audio_buffer_overrun', () => {
      if (!this.#enabled) return;
      this.#metrics.bufferOverruns++;
      this.#updateBufferHealth();
    });
    
    // Clipping events from external sources
    this.#engine.on('audio_clipping_detected', (payload) => {
      if (!this.#enabled) return;
      if (payload?.clippingSamples) {
        this.#metrics.clippingSamples += payload.clippingSamples;
      }
      if (payload?.totalSamples) {
        this.#metrics.totalSamples += payload.totalSamples;
        this.#updateClippingPercent();
      }
    });
    
    // Audio context state changes
    this.#engine.on('audio_context_state_changed', (payload) => {
      if (payload?.audioContext && !this.#audioContext) {
        this.connectAudioContext(payload.audioContext);
      }
    });
  }
  
  /**
   * Start analysis loop
   * @private
   */
  #startAnalysisLoop(intervalMs) {
    this.#analysisInterval = setInterval(() => {
      this.#performAnalysis();
    }, intervalMs);
  }
  
  /**
   * Start emit loop
   * @private
   */
  #startEmitLoop(intervalMs) {
    this.#emitInterval = setInterval(() => {
      this.#emitMetrics();
    }, intervalMs);
  }
  
  /**
   * Perform signal analysis
   * @private
   */
  #performAnalysis() {
    if (!this.#enabled || !this.#analyser) return;
    
    // Get time domain data
    this.#analyser.getFloatTimeDomainData(this.#timeDomainData);
    
    // Get frequency data
    this.#analyser.getFloatFrequencyData(this.#frequencyData);
    
    // Copy frequency data to spectrum buffer
    this.#spectrum.set(this.#frequencyData);
    
    // Analyze time domain data
    this.#analyzeTimeDomain(this.#timeDomainData);
  }
  
  /**
   * Analyze time domain data for clipping, levels, noise
   * @private
   */
  #analyzeTimeDomain(data) {
    if (!data || data.length === 0) return;
    
    let clippingSamples = 0;
    let sumSquares = 0;
    let peak = 0;
    let silentSamples = 0;
    let silentSum = 0;
    
    for (let i = 0; i < data.length; i++) {
      const sample = Math.abs(data[i]);
      
      // Clipping detection
      if (sample >= AUDIO_QUALITY_CONFIG.clippingThreshold) {
        clippingSamples++;
      }
      
      // Peak detection
      if (sample > peak) {
        peak = sample;
      }
      
      // RMS calculation
      sumSquares += sample * sample;
      
      // Noise floor (silent samples)
      if (sample < AUDIO_QUALITY_CONFIG.noiseFloorThreshold) {
        silentSamples++;
        silentSum += sample * sample;
      }
    }
    
    // Update metrics
    this.#metrics.clippingSamples += clippingSamples;
    this.#metrics.totalSamples += data.length;
    this.#updateClippingPercent();
    
    // Calculate dB values
    const rms = Math.sqrt(sumSquares / data.length);
    this.#metrics.peakDB = this.#linearToDb(peak);
    this.#metrics.rmsDB = this.#linearToDb(rms);
    
    // Noise floor (only if we have enough silent samples)
    if (silentSamples > data.length * 0.1) {
      const noiseRms = Math.sqrt(silentSum / silentSamples);
      this.#metrics.noiseFloorDB = this.#linearToDb(noiseRms);
    }
  }
  
  /**
   * Convert linear amplitude to dBFS
   * @private
   */
  #linearToDb(linear) {
    if (linear <= 0) return -Infinity;
    return 20 * Math.log10(linear);
  }
  
  /**
   * Update clipping percentage
   * @private
   */
  #updateClippingPercent() {
    if (this.#metrics.totalSamples > 0) {
      this.#metrics.clippingPercent = 
        (this.#metrics.clippingSamples / this.#metrics.totalSamples) * 100;
    }
  }
  
  /**
   * Update buffer health metric
   * @private
   */
  #updateBufferHealth() {
    // Simple health score based on underruns/overruns
    const totalIssues = this.#metrics.bufferUnderruns + this.#metrics.bufferOverruns;
    this.#metrics.bufferHealthPercent = Math.max(0, 100 - (totalIssues * 5));
  }
  
  /**
   * Emit metrics event
   * @private
   */
  #emitMetrics() {
    if (!this.#engine?.emit) return;
    
    // Determine health status
    let status = 'optimal';
    if (this.#metrics.clippingPercent > 0) {
      status = 'warning';
    }
    if (this.#metrics.clippingPercent > 1) {
      status = 'critical';
    }
    if (this.#metrics.noiseFloorDB > AUDIO_QUALITY_CONFIG.targetNoiseFloorDB) {
      status = status === 'critical' ? 'critical' : 'warning';
    }
    
    this.#engine.emit('audio_quality_measured', {
      ...this.#metrics,
      status,
      hasSpectrum: this.#spectrum !== null,
      timestamp: performance.now()
    });
  }
  
  /**
   * Get current metrics
   * @returns {Object}
   */
  getMetrics() {
    return { ...this.#metrics };
  }
  
  /**
   * Get current spectrum data (frequency magnitudes in dB)
   * @returns {Float32Array|null}
   */
  getSpectrum() {
    return this.#spectrum ? new Float32Array(this.#spectrum) : null;
  }
  
  /**
   * Get spectrum as array of { frequency, magnitude } objects
   * @returns {Array<{frequency: number, magnitude: number}>}
   */
  getSpectrumBins() {
    if (!this.#spectrum || !this.#audioContext) return [];
    
    const sampleRate = this.#audioContext.sampleRate;
    const binWidth = sampleRate / AUDIO_QUALITY_CONFIG.fftSize;
    
    return Array.from(this.#spectrum).map((magnitude, i) => ({
      frequency: i * binWidth,
      magnitude
    }));
  }
  
  /**
   * Reset metrics
   */
  reset() {
    this.#metrics = {
      clippingPercent: 0,
      clippingSamples: 0,
      totalSamples: 0,
      noiseFloorDB: -Infinity,
      peakDB: -Infinity,
      rmsDB: -Infinity,
      bufferUnderruns: 0,
      bufferOverruns: 0,
      bufferHealthPercent: 100
    };
  }
  
  /**
   * Enable analysis
   */
  enable() {
    this.#enabled = true;
  }
  
  /**
   * Disable analysis
   */
  disable() {
    this.#enabled = false;
  }
  
  /**
   * Analyze a raw audio buffer (for external/worker use)
   * @param {Float32Array} buffer - Audio samples
   * @returns {Object} Analysis results
   */
  analyzeBuffer(buffer) {
    if (!buffer || buffer.length === 0) {
      return { clippingSamples: 0, totalSamples: 0, peakDB: -Infinity, rmsDB: -Infinity };
    }
    
    let clippingSamples = 0;
    let sumSquares = 0;
    let peak = 0;
    
    for (let i = 0; i < buffer.length; i++) {
      const sample = Math.abs(buffer[i]);
      
      if (sample >= AUDIO_QUALITY_CONFIG.clippingThreshold) {
        clippingSamples++;
      }
      
      if (sample > peak) {
        peak = sample;
      }
      
      sumSquares += sample * sample;
    }
    
    const rms = Math.sqrt(sumSquares / buffer.length);
    
    return {
      clippingSamples,
      totalSamples: buffer.length,
      clippingPercent: (clippingSamples / buffer.length) * 100,
      peakDB: this.#linearToDb(peak),
      rmsDB: this.#linearToDb(rms)
    };
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    this.#enabled = false;
    
    if (this.#analysisInterval) {
      clearInterval(this.#analysisInterval);
      this.#analysisInterval = null;
    }
    
    if (this.#emitInterval) {
      clearInterval(this.#emitInterval);
      this.#emitInterval = null;
    }
    
    // Disconnect analyser
    if (this.#analyser) {
      try {
        this.#analyser.disconnect();
      } catch {
        // Already disconnected
      }
      this.#analyser = null;
    }
    
    this.#audioContext = null;
    this.#timeDomainData = null;
    this.#frequencyData = null;
    this.#spectrum = null;
    this.#engine = null;
  }
}

// ============================================================================
// FACTORY & EXPORTS
// ============================================================================

/**
 * Create an audio signal quality analyzer instance
 * @param {import('../core/engine.js').Engine} engine
 * @param {Object} [options]
 * @returns {AudioSignalQualityAnalyzer}
 */
export function createAudioSignalQualityAnalyzer(engine, options = {}) {
  return new AudioSignalQualityAnalyzer(engine, options);
}

/**
 * Export configuration for reference
 */
export { AUDIO_QUALITY_CONFIG };
