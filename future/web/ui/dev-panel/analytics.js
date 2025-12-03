/**
 * Analytics Event Emitter for Developer Workflows
 * 
 * Implements event tracking for dev panel user interactions and automatic triggers.
 * Events are batched and transmitted via sendBeacon() for reliability.
 * 
 * Reference: docs/design/DEV_PANEL_ANALYTICS.md
 * Phase: 3 (Telemetry Integration & Analytics)
 * 
 * @module ui/dev-panel/analytics
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

const ANALYTICS_CONFIG = {
  endpoint: 'https://acoustsee-analytics.mamware.workers.dev/',
  batchSize: 20,
  flushInterval: 10000, // 10 seconds
  maxLocalStorageEvents: 50,
  respectDoNotTrack: true,
  debug: false
};

// ============================================================================
// SESSION MANAGEMENT
// ============================================================================

let sessionId = null;
let sessionStartTime = null;

/**
 * Generate a unique session ID
 * @returns {string} Session ID in format 'sess_timestamp_random'
 */
function generateSessionId() {
  return `sess_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get or create session ID
 * @returns {string} Current session ID
 */
export function getSessionId() {
  if (!sessionId) {
    sessionId = generateSessionId();
    sessionStartTime = performance.now();
  }
  return sessionId;
}

// ============================================================================
// EVENT TRACKING
// ============================================================================

let eventBuffer = [];
let flushIntervalId = null;
let analyticsEnabled = true;

/**
 * Check if analytics is enabled (respects Do Not Track)
 * @returns {boolean} Whether analytics is enabled
 */
function isAnalyticsEnabled() {
  if (!analyticsEnabled) return false;
  
  if (ANALYTICS_CONFIG.respectDoNotTrack) {
    if (navigator.doNotTrack === '1' || 
        navigator.doNotTrack === 'yes' ||
        window.doNotTrack === '1') {
      return false;
    }
  }
  
  return true;
}

/**
 * Emit an analytics event
 * 
 * @param {string} eventName - Name of the event (e.g., 'click_start_camera')
 * @param {Object} payload - Event-specific data
 * @param {Object} options - Optional configuration
 * @returns {void}
 * 
 * @example
 * emit('click_start_camera', { sourceType: 'GPU' });
 * emit('worker_parameter_updated', { workerId: 'fast-motion', param: 'threshold', value: 25 });
 */
export function emit(eventName, payload = {}, options = {}) {
  if (!isAnalyticsEnabled()) return;
  
  const event = {
    eventName,
    timestamp: payload.timestamp || performance.now(),
    session_id: getSessionId(),
    sessionUptime: performance.now() - (sessionStartTime || 0),
    mode: payload.mode || getEngineState('mode') || 'unknown',
    preset: payload.preset || getEngineState('preset') || 'unknown',
    context: {
      ...payload,
      // Remove internal fields from context
      timestamp: undefined,
      mode: undefined,
      preset: undefined
    }
  };
  
  // Clean undefined values from context
  Object.keys(event.context).forEach(key => {
    if (event.context[key] === undefined) {
      delete event.context[key];
    }
  });
  
  eventBuffer.push(event);
  
  if (ANALYTICS_CONFIG.debug) {
    console.debug('[Analytics]', eventName, event);
  }
  
  // Auto-flush if buffer is full
  if (eventBuffer.length >= ANALYTICS_CONFIG.batchSize) {
    flush();
  }
  
  // Immediate flush for critical events
  if (options.immediate) {
    flush();
  }
}

/**
 * Emit a user interaction event (click, change, toggle)
 * @param {string} action - Action type ('click', 'change', 'toggle')
 * @param {string} target - Target element identifier
 * @param {Object} data - Additional event data
 */
export function emitInteraction(action, target, data = {}) {
  emit(`${action}_${target}`, {
    interactionType: action,
    targetElement: target,
    ...data
  });
}

/**
 * Emit a workflow step event
 * @param {string} workflow - Workflow name ('camera', 'worker_test', 'telemetry')
 * @param {string} step - Step name ('started', 'completed', 'failed')
 * @param {Object} data - Step-specific data
 */
export function emitWorkflowStep(workflow, step, data = {}) {
  emit(`workflow_${workflow}_${step}`, {
    workflow,
    step,
    ...data
  });
}

// ============================================================================
// PREDEFINED ANALYTICS EVENTS
// ============================================================================

/**
 * Track camera start interaction
 * @param {Object} data - Camera start data
 */
export function trackCameraStart(data = {}) {
  emit('click_start_camera', {
    sourceType: data.sourceType || 'auto',
    negotiationTime: data.negotiationTime,
    ...data
  });
}

/**
 * Track camera stop interaction
 * @param {Object} data - Camera stop data
 */
export function trackCameraStop(data = {}) {
  emit('click_stop_camera', {
    duration: data.duration,
    totalFrames: data.totalFrames,
    ...data
  });
}

/**
 * Track worker isolation toggle
 * @param {Object} data - Worker isolation data
 */
export function trackWorkerIsolation(data = {}) {
  emit('click_worker_isolation', {
    workerId: data.workerId,
    enabled: data.enabled,
    chainPreset: data.chainPreset,
    ...data
  });
}

/**
 * Track worker parameter change
 * @param {Object} data - Parameter change data
 */
export function trackWorkerParameterChange(data = {}) {
  emit('change_worker_parameter', {
    workerId: data.workerId,
    paramName: data.paramName,
    oldValue: data.oldValue,
    newValue: data.newValue,
    ...data
  });
}

/**
 * Track telemetry export action
 * @param {Object} data - Export data
 */
export function trackTelemetryExport(data = {}) {
  emit('export_telemetry_session', {
    format: data.format || 'JSON',
    eventCount: data.eventCount,
    fileSize: data.fileSize,
    ...data
  });
}

/**
 * Track dev panel open/close
 * @param {boolean} isOpen - Whether panel is opened or closed
 */
export function trackDevPanelToggle(isOpen) {
  emit(isOpen ? 'dev_panel_opened' : 'dev_panel_closed', {
    timestamp: performance.now()
  });
}

/**
 * Track tab switch in dev panel
 * @param {string} tabName - Name of the tab switched to
 */
export function trackTabSwitch(tabName) {
  emit('dev_panel_tab_switched', {
    tabName,
    timestamp: performance.now()
  });
}

/**
 * Track preset change
 * @param {string} presetName - Name of the new preset
 */
export function trackPresetChange(presetName) {
  emit('change_preset', {
    preset: presetName,
    timestamp: performance.now()
  });
}

/**
 * Track mode change
 * @param {string} modeName - Name of the new mode
 */
export function trackModeChange(modeName) {
  emit('change_mode', {
    mode: modeName,
    timestamp: performance.now()
  });
}

// ============================================================================
// AUTOMATIC TRIGGERS
// ============================================================================

/**
 * Track telemetry baseline establishment
 * @param {Object} data - Baseline data
 */
export function trackBaselineEstablished(data = {}) {
  emit('telemetry_baseline_established', {
    duration: data.duration,
    eventCount: data.eventCount,
    metricsCollected: data.metricsCollected,
    ...data
  }, { immediate: true });
}

/**
 * Track telemetry anomaly detection
 * @param {Object} data - Anomaly data
 */
export function trackAnomalyDetected(data = {}) {
  emit('telemetry_anomaly_detected', {
    metricName: data.metricName,
    value: data.value,
    threshold: data.threshold,
    zone: data.zone,
    ...data
  }, { immediate: true });
}

/**
 * Track telemetry export completion
 * @param {Object} data - Export completion data
 */
export function trackExportComplete(data = {}) {
  emit('telemetry_session_export_complete', {
    format: data.format,
    fileSize: data.fileSize,
    duration: data.duration,
    downloadTriggered: data.downloadTriggered,
    ...data
  }, { immediate: true });
}

// ============================================================================
// TRANSMISSION
// ============================================================================

/**
 * Flush event buffer to server
 * @returns {Promise<boolean>} Success indicator
 */
export async function flush() {
  if (eventBuffer.length === 0) return true;
  
  const batch = eventBuffer.splice(0, ANALYTICS_CONFIG.batchSize);
  
  try {
    // Try sendBeacon first (non-blocking, survives page unload)
    if (navigator.sendBeacon) {
      const sent = navigator.sendBeacon(
        ANALYTICS_CONFIG.endpoint,
        JSON.stringify(batch)
      );
      
      if (sent) {
        if (ANALYTICS_CONFIG.debug) {
          console.debug('[Analytics] Flushed via sendBeacon:', batch.length, 'events');
        }
        return true;
      }
    }
    
    // Fallback to fetch
    const response = await fetch(ANALYTICS_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
      keepalive: true
    });
    
    if (response.ok) {
      if (ANALYTICS_CONFIG.debug) {
        console.debug('[Analytics] Flushed via fetch:', batch.length, 'events');
      }
      return true;
    }
    
    throw new Error(`HTTP ${response.status}`);
  } catch (err) {
    // Store in localStorage as fallback
    storeInLocalStorage(batch);
    
    if (ANALYTICS_CONFIG.debug) {
      console.warn('[Analytics] Flush failed, stored locally:', err.message);
    }
    
    return false;
  }
}

/**
 * Store events in localStorage as fallback
 * @param {Array} events - Events to store
 */
function storeInLocalStorage(events) {
  try {
    const stored = JSON.parse(localStorage.getItem('acoustsee_analytics') || '[]');
    const combined = [...stored, ...events].slice(-ANALYTICS_CONFIG.maxLocalStorageEvents);
    localStorage.setItem('acoustsee_analytics', JSON.stringify(combined));
  } catch {
    // Ignore localStorage errors
  }
}

/**
 * Retry sending stored events
 * @returns {Promise<boolean>} Success indicator
 */
export async function retryStoredEvents() {
  try {
    const stored = JSON.parse(localStorage.getItem('acoustsee_analytics') || '[]');
    if (stored.length === 0) return true;
    
    const response = await fetch(ANALYTICS_CONFIG.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(stored),
      keepalive: true
    });
    
    if (response.ok) {
      localStorage.removeItem('acoustsee_analytics');
      return true;
    }
    
    return false;
  } catch {
    return false;
  }
}

// ============================================================================
// ENGINE STATE ACCESS
// ============================================================================

let engineRef = null;

/**
 * Set engine reference for state access
 * @param {Object} engine - Application engine
 */
export function setEngineRef(engine) {
  engineRef = engine;
}

/**
 * Get state value from engine
 * @param {string} key - State key
 * @returns {*} State value
 */
function getEngineState(key) {
  if (!engineRef?.getState) return undefined;
  
  const state = engineRef.getState();
  return state?.[key];
}

// ============================================================================
// LIFECYCLE
// ============================================================================

/**
 * Initialize analytics module
 * @param {Object} options - Configuration options
 * @param {Object} engine - Application engine (optional)
 */
export function initializeAnalytics(options = {}, engine = null) {
  // Apply configuration
  Object.assign(ANALYTICS_CONFIG, options);
  
  // Set engine reference
  if (engine) {
    setEngineRef(engine);
  }
  
  // Initialize session
  getSessionId();
  
  // Start periodic flush
  if (!flushIntervalId) {
    flushIntervalId = setInterval(flush, ANALYTICS_CONFIG.flushInterval);
  }
  
  // Retry stored events on init
  retryStoredEvents();
  
  // Flush on page unload
  if (typeof window !== 'undefined') {
    window.addEventListener('beforeunload', () => flush());
    window.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    });
  }
  
  if (ANALYTICS_CONFIG.debug) {
    console.log('[Analytics] Initialized with session:', sessionId);
  }
}

/**
 * Enable/disable analytics
 * @param {boolean} enabled - Whether to enable analytics
 */
export function setAnalyticsEnabled(enabled) {
  analyticsEnabled = enabled;
  
  if (!enabled && flushIntervalId) {
    clearInterval(flushIntervalId);
    flushIntervalId = null;
  } else if (enabled && !flushIntervalId) {
    flushIntervalId = setInterval(flush, ANALYTICS_CONFIG.flushInterval);
  }
}

/**
 * Dispose analytics module
 */
export function disposeAnalytics() {
  // Final flush
  flush();
  
  // Clear interval
  if (flushIntervalId) {
    clearInterval(flushIntervalId);
    flushIntervalId = null;
  }
  
  // Clear buffer
  eventBuffer = [];
  
  if (ANALYTICS_CONFIG.debug) {
    console.log('[Analytics] Disposed');
  }
}

/**
 * Get analytics metrics
 * @returns {Object} Analytics metrics
 */
export function getAnalyticsMetrics() {
  return {
    session_id: sessionId,
    sessionUptime: performance.now() - (sessionStartTime || 0),
    pendingEvents: eventBuffer.length,
    analyticsEnabled,
    doNotTrack: navigator.doNotTrack === '1'
  };
}

// ============================================================================
// EXPORTS
// ============================================================================

/**
 * DevPanelAnalytics class wrapper for analytics module
 * Provides OOP interface for dev-panel.js initialization
 */
export class DevPanelAnalytics {
  constructor(engine, options = {}) {
    this.engine = engine;
    this.options = options;
    initializeAnalytics(options, engine);
    setEngineRef(engine);
  }

  emit(eventName, payload = {}, options = {}) {
    return emit(eventName, payload, options);
  }

  emitInteraction(action, target, data = {}) {
    return emitInteraction(action, target, data);
  }

  emitWorkflowStep(workflow, step, data = {}) {
    return emitWorkflowStep(workflow, step, data);
  }

  trackCameraStart(data = {}) {
    return trackCameraStart(data);
  }

  trackCameraStop(data = {}) {
    return trackCameraStop(data);
  }

  trackWorkerIsolation(data = {}) {
    return trackWorkerIsolation(data);
  }

  trackWorkerParameterChange(data = {}) {
    return trackWorkerParameterChange(data);
  }

  trackTelemetryExport(data = {}) {
    return trackTelemetryExport(data);
  }

  trackDevPanelToggle(isOpen) {
    return trackDevPanelToggle(isOpen);
  }

  trackTabSwitch(tabName) {
    return trackTabSwitch(tabName);
  }

  trackPresetChange(presetName) {
    return trackPresetChange(presetName);
  }

  trackModeChange(modeName) {
    return trackModeChange(modeName);
  }

  trackBaselineEstablished(data = {}) {
    return trackBaselineEstablished(data);
  }

  trackAnomalyDetected(data = {}) {
    return trackAnomalyDetected(data);
  }

  trackExportComplete(data = {}) {
    return trackExportComplete(data);
  }

  async flush() {
    return flush();
  }

  setEnabled(enabled) {
    return setAnalyticsEnabled(enabled);
  }

  async dispose() {
    return disposeAnalytics();
  }

  getMetrics() {
    return getAnalyticsMetrics();
  }

  getSessionId() {
    return getSessionId();
  }
}

export default {
  emit,
  emitInteraction,
  emitWorkflowStep,
  trackCameraStart,
  trackCameraStop,
  trackWorkerIsolation,
  trackWorkerParameterChange,
  trackTelemetryExport,
  trackDevPanelToggle,
  trackTabSwitch,
  trackPresetChange,
  trackModeChange,
  trackBaselineEstablished,
  trackAnomalyDetected,
  trackExportComplete,
  flush,
  initializeAnalytics,
  setAnalyticsEnabled,
  disposeAnalytics,
  getAnalyticsMetrics,
  getSessionId,
  setEngineRef,
  DevPanelAnalytics
};
