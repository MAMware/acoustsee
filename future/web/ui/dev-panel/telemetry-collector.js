/**
 * TelemetryCollector - Event batching, buffering, and transmission
 * 
 * Collects telemetry events from video, audio, workers, and system resources.
 * Batches events for efficient transmission via sendBeacon or fetch.
 * Implements fallback to localStorage for offline scenarios.
 * 
 * Reference: docs/design/DEV_PANEL_TELEMETRY-INSTRUMENTATION-SPEC.md (Section 6)
 * 
 * @module ui/dev-panel/telemetry-collector
 */

export class TelemetryCollector {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.events = [];
    
    // Configuration with sensible defaults
    this.batchSize = options.batchSize || 50;
    this.batchInterval = options.batchInterval || 5000;  // 5 seconds
    this.endpoint = options.endpoint || 'https://acoustsee-analytics.mamware.workers.dev/';
    this.maxLocalStorageEvents = options.maxLocalStorageEvents || 100;
    this.enabled = options.enabled !== false;  // Default enabled
    
    // Session metadata
    this.session_id = this._generateSessionId();
    this.startTime = performance.now();
    
    // Circular buffer to prevent unbounded growth
    this.circularBuffer = [];
    this.circularBufferSize = 200;  // Store last 200 events in memory
    
    // Metrics
    this.eventsCollected = 0;
    this.eventsFlushed = 0;
    this.eventsFailed = 0;
    
    // Batch flush interval
    this.flushInterval = null;
    
    // Baseline detection (Phase 3)
    this.baselineConfig = {
      warmupDuration: options.baselineWarmupMs || 10000,  // 10 seconds
      sampleWindow: options.baselineSampleWindow || 100,   // 100 samples
      anomalyThreshold: options.anomalyThreshold || 2.5    // 2.5 standard deviations
    };
    this.baselineEstablished = false;
    this.baselines = {};        // Metric baselines: { metricName: { mean, stdDev, min, max } }
    this.baselineSamples = {};  // Samples during warmup: { metricName: [] }
    this.baselineTimer = null;
    
    // Subscribe to engine events
    this._subscribeToEvents();
    
    // Start periodic flush
    this._startPeriodicFlush();
    
    // Start baseline warmup
    this._startBaselineWarmup();
  }

  /**
   * Subscribe to all telemetry events
   * @private
   */
  _subscribeToEvents() {
    if (!this.engine || !this.engine.on) {
      console.warn('TelemetryCollector: Engine not provided or missing on() method');
      return;
    }

    // List of telemetry event prefixes to collect
    const eventPrefixes = [
      'video_',
      'audio_',
      'worker_',
      'sync_',
      'telemetry_',
      'cpu_',
      'memory_',
      'gpu_',
      'browser_task_',
      'resource_',
      'lip_sync_'
    ];

    // Subscribe to all telemetry events
    eventPrefixes.forEach(prefix => {
      // Dynamic event subscription (listen for any event starting with this prefix)
      // Note: Engine's on() method allows pattern matching or we use a wrapper approach
      // For now, we'll use the direct event subscription on known events
      this._subscribeToPrefix(prefix);
    });

    // Subscribe to specific known events
    const knownEvents = [
      'video_capture_started', 'video_capture_stopped', 'video_source_gpu_selected', 'video_source_cpu_fallback',
      'video_frame_processed', 'video_frame_dropped',
      'audio_cues_received', 'audio_synthesis_started', 'audio_clipping_detected', 'audio_buffer_underrun',
      'audio_buffer_overrun', 'audio_noise_floor_elevated', 'audio_signal_clipping_cleared', 'audio_quality_metric_updated',
      'worker_enabled', 'worker_disabled', 'worker_parameter_updated', 'worker_latency_measured',
      'worker_unresponsive', 'worker_reloaded', 'worker_stalled', 'worker_recovered',
      'sync_drift_detected', 'sync_calibrated', 'audio_video_latency_delta_measured', 'sync_event_recorded', 'lip_sync_verified',
      'telemetry_baseline_established', 'telemetry_anomaly_detected', 'telemetry_dashboard_opened',
      'telemetry_metric_drill_down', 'telemetry_session_export_started', 'telemetry_session_export_complete',
      'cpu_usage_spike_detected', 'memory_growth_detected', 'gpu_utilization_measured', 'browser_task_manager_sampled',
      'resource_constraint_warning', 'resource_constraint_cleared'
    ];

    knownEvents.forEach(eventName => {
      try {
        this.engine.on(eventName, (payload) => {
          this._recordEvent(eventName, payload);
        });
      } catch {
        // Silently fail if subscription fails (event might not exist yet)
      }
    });
  }

  /**
   * Subscribe to events with a given prefix (fallback approach)
   * @private
   */
  _subscribeToPrefix(prefix) {
    // If engine supports wildcard subscriptions, use that
    if (this.engine.onPattern) {
      this.engine.onPattern(new RegExp(`^${prefix}`), (eventName, payload) => {
        this._recordEvent(eventName, payload);
      });
    }
    // Otherwise, rely on explicit event subscriptions above
  }

  /**
   * Record a telemetry event
   * @private
   */
  _recordEvent(eventName, payload = {}) {
    if (!this.enabled) return;

    // Build complete event with metadata
    const event = {
      eventName,
      timestamp: payload.timestamp || performance.now(),
      session_id: payload.session_id || this.session_id,
      mode: payload.mode || this.engine?.getState?.()?.currentMode || 'unknown',
      preset: payload.preset || this.engine?.getState?.()?.preset || 'unknown',
      context: payload
    };

    // Add to buffer
    this.events.push(event);
    this.circularBuffer.push(event);
    
    // Maintain circular buffer size
    if (this.circularBuffer.length > this.circularBufferSize) {
      this.circularBuffer.shift();
    }

    this.eventsCollected++;

    // Track baseline metrics (Phase 3)
    this._trackBaselineMetric(eventName, payload);

    // Check if we should flush
    if (this.events.length >= this.batchSize) {
      this.flush();
    }
  }

  /**
   * Start baseline warmup period
   * @private
   */
  _startBaselineWarmup() {
    this.baselineTimer = setTimeout(() => {
      this._establishBaseline();
    }, this.baselineConfig.warmupDuration);
  }

  /**
   * Track metric for baseline calculation
   * @private
   */
  _trackBaselineMetric(eventName, payload) {
    // Extract numeric metrics from known event types
    const metricMappings = {
      'video_frame_processed': ['latencyMs', 'processingTimeMs'],
      'audio_cues_received': ['routingDurationMs', 'latencyMs'],
      'audio_video_latency_delta_measured': ['audioVideoLatencyDeltaMs'],
      'worker_latency_measured': ['latencyMs', 'processingTimeMs'],
      'cpu_usage_spike_detected': ['cpuUsagePercent'],
      'memory_growth_detected': ['memoryMB'],
      'feature_extraction_complete': ['extractionDurationMs']
    };

    const metricsToTrack = metricMappings[eventName];
    if (!metricsToTrack) return;

    for (const metricKey of metricsToTrack) {
      const value = payload?.[metricKey];
      if (typeof value !== 'number' || !isFinite(value)) continue;

      const metricName = `${eventName}.${metricKey}`;

      if (!this.baselineEstablished) {
        // During warmup: collect samples
        if (!this.baselineSamples[metricName]) {
          this.baselineSamples[metricName] = [];
        }
        this.baselineSamples[metricName].push(value);
        
        // Limit sample size during warmup
        if (this.baselineSamples[metricName].length > this.baselineConfig.sampleWindow) {
          this.baselineSamples[metricName].shift();
        }
      } else {
        // After baseline established: check for anomalies
        this._checkAnomaly(metricName, value);
      }
    }
  }

  /**
   * Establish baseline from warmup samples
   * @private
   */
  _establishBaseline() {
    for (const [metricName, samples] of Object.entries(this.baselineSamples)) {
      if (samples.length < 10) continue;  // Need minimum samples

      const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
      const variance = samples.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / samples.length;
      const stdDev = Math.sqrt(variance);

      this.baselines[metricName] = {
        mean,
        stdDev,
        min: Math.min(...samples),
        max: Math.max(...samples),
        sampleCount: samples.length
      };
    }

    this.baselineEstablished = true;

    // Emit baseline established event
    if (this.engine?.emit) {
      this.engine.emit('telemetry_baseline_established', {
        timestamp: performance.now(),
        session_id: this.session_id,
        warmupDurationMs: this.baselineConfig.warmupDuration,
        metrics: Object.keys(this.baselines),
        baselines: this.baselines
      });
    }

    // Clear warmup samples to free memory
    this.baselineSamples = {};
  }

  /**
   * Check if a metric value is anomalous
   * @private
   */
  _checkAnomaly(metricName, value) {
    const baseline = this.baselines[metricName];
    if (!baseline || baseline.stdDev === 0) return;

    const zScore = Math.abs(value - baseline.mean) / baseline.stdDev;

    if (zScore > this.baselineConfig.anomalyThreshold) {
      // Emit anomaly detected event
      if (this.engine?.emit) {
        this.engine.emit('telemetry_anomaly_detected', {
          timestamp: performance.now(),
          session_id: this.session_id,
          metricName,
          value,
          baseline: {
            mean: baseline.mean,
            stdDev: baseline.stdDev,
            min: baseline.min,
            max: baseline.max
          },
          zScore,
          severity: zScore > 4 ? 'critical' : zScore > 3 ? 'warning' : 'info',
          direction: value > baseline.mean ? 'high' : 'low'
        });
      }
    }
  }

  /**
   * Get current baselines
   * @returns {Object} Current baseline data
   */
  getBaselines() {
    return {
      established: this.baselineEstablished,
      warmupRemaining: this.baselineEstablished ? 0 : 
        Math.max(0, this.baselineConfig.warmupDuration - (performance.now() - this.startTime)),
      metrics: this.baselines
    };
  }

  /**
   * Reset baselines and restart warmup
   */
  resetBaselines() {
    this.baselineEstablished = false;
    this.baselines = {};
    this.baselineSamples = {};
    
    if (this.baselineTimer) {
      clearTimeout(this.baselineTimer);
    }
    
    this._startBaselineWarmup();
  }

  /**
   * Flush accumulated events
   * @returns {Promise<boolean>} Success indicator
   */
  async flush() {
    if (this.events.length === 0) return true;

    const batch = this.events.splice(0, this.batchSize);
    this.eventsFlushed += batch.length;

    try {
      // Try sendBeacon first (non-blocking, survives page close)
      if (navigator.sendBeacon) {
        const sent = navigator.sendBeacon(this.endpoint, JSON.stringify(batch));
        if (sent) {
          // Successfully sent
          return true;
        }
      }

      // Fallback to fetch
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(batch),
        keepalive: true  // Survive page unload
      });

      if (response.ok) {
        return true;
      } else {
        throw new Error(`HTTP ${response.status}`);
      }
    } catch (err) {
      this.eventsFailed += batch.length;
      console.warn('TelemetryCollector: Flush failed, storing in localStorage', err.message);
      
      // Store in localStorage as fallback
      this._storeInLocalStorage(batch);
      
      // Put events back (optional: retry later)
      this.events.unshift(...batch);
      
      return false;
    }
  }

  /**
   * Store events in localStorage as fallback
   * @private
   */
  _storeInLocalStorage(events) {
    try {
      const stored = JSON.parse(localStorage.getItem('acoustsee_telemetry') || '[]');
      const combined = [...stored, ...events].slice(-this.maxLocalStorageEvents);
      localStorage.setItem('acoustsee_telemetry', JSON.stringify(combined));
    } catch (err) {
      console.warn('TelemetryCollector: localStorage failed', err.message);
    }
  }

  /**
   * Start periodic flush interval
   * @private
   */
  _startPeriodicFlush() {
    this.flushInterval = setInterval(() => {
      this.flush().catch(err => console.warn('Periodic flush error:', err));
    }, this.batchInterval);
  }

  /**
   * Stop collecting telemetry
   */
  stop() {
    this.enabled = false;
    
    if (this.flushInterval) {
      clearInterval(this.flushInterval);
      this.flushInterval = null;
    }

    if (this.baselineTimer) {
      clearTimeout(this.baselineTimer);
      this.baselineTimer = null;
    }

    // Final flush
    return this.flush();
  }

  /**
   * Get current session ID
   */
  getSessionId() {
    return this.session_id;
  }

  /**
   * Get metrics about telemetry collection
   */
  getMetrics() {
    return {
      session_id: this.session_id,
      uptime: performance.now() - this.startTime,
      eventsCollected: this.eventsCollected,
      eventsFlushed: this.eventsFlushed,
      eventsFailed: this.eventsFailed,
      pendingEvents: this.events.length,
      successRate: this.eventsFlushed / Math.max(this.eventsCollected, 1),
      // Baseline metrics (Phase 3)
      baselineEstablished: this.baselineEstablished,
      baselineMetricCount: Object.keys(this.baselines).length
    };
  }

  /**
   * Get recent events from circular buffer (for debugging)
   */
  getRecentEvents(count = 10) {
    return this.circularBuffer.slice(-count);
  }

  /**
   * Generate a unique session ID
   * @private
   */
  _generateSessionId() {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Export current session data as JSON
   */
  exportSession() {
    return {
      session_id: this.session_id,
      startTime: new Date(this.startTime).toISOString(),
      endTime: new Date(performance.now()).toISOString(),
      metrics: this.getMetrics(),
      events: this.circularBuffer
    };
  }

  /**
   * Trigger session export (for user download)
   */
  downloadSessionExport() {
    const data = this.exportSession();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `acoustsee-telemetry-${data.session_id}.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    // Emit event
    if (this.engine && this.engine.emit) {
      this.engine.emit('telemetry_session_export_complete', {
        format: 'JSON',
        fileSize: blob.size,
        timestamp: performance.now(),
        session_id: this.session_id
      });
    }
  }
}

/**
 * Factory function to create and initialize a TelemetryCollector
 */
export function createTelemetryCollector(engine, options = {}) {
  const collector = new TelemetryCollector(engine, options);
  
  // Optionally inject into engine for easy access
  if (engine && typeof engine === 'object') {
    engine.telemetryCollector = collector;
  }

  return collector;
}

/**
 * Global telemetry instance (singleton pattern for app-wide access)
 */
let globalTelemetryCollector = null;

export function initializeTelemetry(engine, options = {}) {
  if (!globalTelemetryCollector) {
    globalTelemetryCollector = createTelemetryCollector(engine, options);
  }
  return globalTelemetryCollector;
}

export function getTelemetryCollector() {
  return globalTelemetryCollector;
}
