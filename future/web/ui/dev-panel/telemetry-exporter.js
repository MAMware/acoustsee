/**
 * @fileoverview Telemetry Session Exporter
 * 
 * Exports telemetry sessions to JSON/CSV formats for offline analysis.
 * Provides complete session snapshots including events, metrics, and metadata.
 * 
 * @module telemetry-exporter
 * @see DEV_PANEL_ANALYTICS.md - Event taxonomy and export requirements
 */

/**
 * @typedef {Object} ExportOptions
 * @property {'json'|'csv'} format - Export format
 * @property {boolean} includeMetrics - Include performance metrics
 * @property {boolean} includeEvents - Include event log
 * @property {boolean} includeConfig - Include system configuration
 * @property {boolean} compressed - Apply compression (JSON only)
 */

/**
 * @typedef {Object} SessionExport
 * @property {Object} metadata - Session metadata
 * @property {Array} events - Event log
 * @property {Object} metrics - Performance metrics
 * @property {Object} config - System configuration snapshot
 */

const EXPORT_VERSION = '1.0.0';

/**
 * TelemetryExporter - Session export and download functionality
 * 
 * Generates comprehensive session exports for debugging and analysis.
 */
export class TelemetryExporter {
  /** @type {import('../core/engine.js').Engine|null} */
  #engine = null;
  
  /** @type {import('./telemetry-collector.js').TelemetryCollector|null} */
  #collector = null;
  
  /** @type {import('./analytics.js').DevPanelAnalytics|null} */
  #analytics = null;
  
  /**
   * @param {Object} dependencies
   * @param {import('../core/engine.js').Engine} dependencies.engine - Application engine
   * @param {import('./telemetry-collector.js').TelemetryCollector} [dependencies.collector] - Telemetry collector
   * @param {import('./analytics.js').DevPanelAnalytics} [dependencies.analytics] - Analytics instance
   */
  constructor({ engine, collector = null, analytics = null }) {
    this.#engine = engine;
    this.#collector = collector;
    this.#analytics = analytics;
  }
  
  /**
   * Export current session data
   * 
   * @param {string} [filename] - Optional filename (auto-generated if omitted)
   * @param {Partial<ExportOptions>} [options] - Export options
   * @returns {Promise<Blob>} Export blob
   */
  async exportSession(filename, options = {}) {
    const opts = {
      format: 'json',
      includeMetrics: true,
      includeEvents: true,
      includeConfig: true,
      compressed: false,
      ...options
    };
    
    const sessionData = this.#buildSessionExport(opts);
    
    const blob = opts.format === 'csv'
      ? this.#toCSV(sessionData)
      : this.#toJSON(sessionData, opts.compressed);
    
    const exportFilename = filename || this.#generateFilename(opts.format);
    
    // Trigger download
    this.#triggerDownload(blob, exportFilename);
    
    // Emit export event
    this.#engine?.emit?.('telemetry_session_exported', {
      filename: exportFilename,
      format: opts.format,
      size: blob.size,
      eventCount: sessionData.events?.length ?? 0
    });
    
    return blob;
  }
  
  /**
   * Build comprehensive session export object
   * @private
   */
  #buildSessionExport(options) {
    const state = this.#engine?.getState?.() ?? {};
    const collectorStats = this.#collector?.getStats?.() ?? {};
    
    /** @type {SessionExport} */
    const sessionExport = {
      metadata: this.#buildMetadata(collectorStats),
    };
    
    if (options.includeEvents) {
      sessionExport.events = this.#collectEvents();
    }
    
    if (options.includeMetrics) {
      sessionExport.metrics = this.#collectMetrics(state);
    }
    
    if (options.includeConfig) {
      sessionExport.config = this.#collectConfig(state);
    }
    
    return sessionExport;
  }
  
  /**
   * Build session metadata
   * @private
   */
  #buildMetadata(collectorStats) {
    return {
      exportVersion: EXPORT_VERSION,
      exportedAt: new Date().toISOString(),
      sessionId: this.#analytics?.sessionId ?? crypto.randomUUID(),
      sessionStart: collectorStats.startTime ?? new Date().toISOString(),
      sessionDuration: collectorStats.duration ?? 0,
      userAgent: navigator.userAgent,
      platform: navigator.platform,
      screen: {
        width: screen.width,
        height: screen.height,
        devicePixelRatio: window.devicePixelRatio
      },
      viewport: {
        width: window.innerWidth,
        height: window.innerHeight
      }
    };
  }
  
  /**
   * Collect all events from collector buffer
   * @private
   */
  #collectEvents() {
    // Get events from collector if available
    const collectorEvents = this.#collector?.getBuffer?.() ?? [];
    
    // Transform to export format
    return collectorEvents.map(event => ({
      timestamp: event.timestamp,
      name: event.name,
      category: event.category ?? this.#categorizeEvent(event.name),
      data: event.data ?? event.context ?? {},
      duration: event.duration
    }));
  }
  
  /**
   * Categorize event by name prefix
   * @private
   */
  #categorizeEvent(eventName) {
    const prefixMap = {
      'video_': 'video',
      'worker_': 'worker',
      'audio_': 'audio',
      'sync_': 'sync',
      'telemetry_': 'telemetry',
      'resource_': 'resources',
      'perf_': 'performance'
    };
    
    for (const [prefix, category] of Object.entries(prefixMap)) {
      if (eventName.startsWith(prefix)) {
        return category;
      }
    }
    
    return 'other';
  }
  
  /**
   * Collect performance metrics snapshot
   * @private
   */
  #collectMetrics(state) {
    const metrics = {
      video: {},
      audio: {},
      worker: {},
      memory: {},
      timing: {}
    };
    
    // Video metrics
    if (state.video) {
      metrics.video = {
        fps: state.video.fps ?? 0,
        frameCount: state.video.frameCount ?? 0,
        droppedFrames: state.video.droppedFrames ?? 0,
        resolution: state.video.resolution ?? null,
        source: state.video.source ?? 'unknown'
      };
    }
    
    // Audio metrics
    if (state.audio) {
      metrics.audio = {
        sampleRate: state.audio.sampleRate ?? 0,
        latency: state.audio.latency ?? 0,
        bufferSize: state.audio.bufferSize ?? 0,
        synthCount: state.audio.synthCount ?? 0
      };
    }
    
    // Worker metrics
    if (state.workers) {
      metrics.worker = {
        activeCount: state.workers.activeCount ?? 0,
        messageCount: state.workers.messageCount ?? 0,
        avgProcessingTime: state.workers.avgProcessingTime ?? 0
      };
    }
    
    // Memory metrics (if available)
    if (performance.memory) {
      metrics.memory = {
        usedJSHeapSize: performance.memory.usedJSHeapSize,
        totalJSHeapSize: performance.memory.totalJSHeapSize,
        jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
      };
    }
    
    // Navigation timing
    if (performance.timing) {
      const timing = performance.timing;
      metrics.timing = {
        domContentLoaded: timing.domContentLoadedEventEnd - timing.navigationStart,
        loadComplete: timing.loadEventEnd - timing.navigationStart
      };
    }
    
    // Collector-specific metrics
    const collectorStats = this.#collector?.getStats?.() ?? {};
    if (collectorStats) {
      metrics.collector = {
        totalEvents: collectorStats.totalEvents ?? 0,
        bufferedEvents: collectorStats.bufferedEvents ?? 0,
        transmittedEvents: collectorStats.transmittedEvents ?? 0,
        failedTransmissions: collectorStats.failedTransmissions ?? 0
      };
    }
    
    return metrics;
  }
  
  /**
   * Collect system configuration snapshot
   * @private
   */
  #collectConfig(state) {
    return {
      grid: {
        rows: state.grid?.rows ?? 0,
        cols: state.grid?.cols ?? 0,
        cellSize: state.grid?.cellSize ?? 0
      },
      synthesis: {
        method: state.synthesis?.method ?? 'unknown',
        minFreq: state.synthesis?.minFreq ?? 0,
        maxFreq: state.synthesis?.maxFreq ?? 0
      },
      workers: {
        useWebGPU: state.workers?.useWebGPU ?? false,
        workerCount: state.workers?.count ?? 0
      },
      features: {
        featureCount: state.features?.count ?? 0,
        extractionMethod: state.features?.method ?? 'unknown'
      }
    };
  }
  
  /**
   * Convert session data to JSON blob
   * @private
   */
  #toJSON(sessionData, compressed) {
    const jsonString = JSON.stringify(sessionData, null, compressed ? 0 : 2);
    
    const mimeType = compressed
      ? 'application/json'
      : 'application/json';
    
    return new Blob([jsonString], { type: mimeType });
  }
  
  /**
   * Convert session data to CSV blob
   * @private
   */
  #toCSV(sessionData) {
    const rows = [];
    
    // Header row
    rows.push(['timestamp', 'event_name', 'category', 'data', 'duration']);
    
    // Event rows
    if (sessionData.events) {
      for (const event of sessionData.events) {
        rows.push([
          event.timestamp,
          event.name,
          event.category,
          JSON.stringify(event.data),
          event.duration ?? ''
        ]);
      }
    }
    
    // Convert to CSV string
    const csvContent = rows.map(row =>
      row.map(cell => {
        const str = String(cell);
        // Escape quotes and wrap in quotes if contains comma or quote
        if (str.includes(',') || str.includes('"') || str.includes('\n')) {
          return `"${str.replace(/"/g, '""')}"`;
        }
        return str;
      }).join(',')
    ).join('\n');
    
    return new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
  }
  
  /**
   * Generate timestamped filename
   * @private
   */
  #generateFilename(format) {
    const timestamp = new Date().toISOString()
      .replace(/[:.]/g, '-')
      .slice(0, 19);
    
    return `acoustsee-session-${timestamp}.${format}`;
  }
  
  /**
   * Trigger browser download
   * @private
   */
  #triggerDownload(blob, filename) {
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.style.display = 'none';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    // Cleanup URL after short delay
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  
  /**
   * Quick export - JSON with all data
   * @param {string} [filename] - Optional filename
   */
  async quickExport(filename) {
    return this.exportSession(filename, {
      format: 'json',
      includeMetrics: true,
      includeEvents: true,
      includeConfig: true,
      compressed: false
    });
  }
  
  /**
   * Export events only (CSV format)
   * @param {string} [filename] - Optional filename
   */
  async exportEventsCSV(filename) {
    return this.exportSession(filename, {
      format: 'csv',
      includeMetrics: false,
      includeEvents: true,
      includeConfig: false
    });
  }
  
  /**
   * Get export preview (without download)
   * @param {Partial<ExportOptions>} [options] - Export options
   * @returns {SessionExport} Session export object
   */
  getPreview(options = {}) {
    const opts = {
      includeMetrics: true,
      includeEvents: true,
      includeConfig: true,
      ...options
    };
    
    return this.#buildSessionExport(opts);
  }
  
  /**
   * Clean up resources
   */
  dispose() {
    this.#engine = null;
    this.#collector = null;
    this.#analytics = null;
  }
}

/**
 * Factory function for creating exporter
 * @param {Object} dependencies
 * @returns {TelemetryExporter}
 */
export function createTelemetryExporter(dependencies) {
  return new TelemetryExporter(dependencies);
}
