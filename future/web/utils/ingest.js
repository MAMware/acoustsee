// Battery-optimized ingest system with dynamic categorization
// Uses requestIdleCallback and pre-computed contexts to minimize overhead
// Provides developer-friendly dynamic categorization through engine state
//
// ARCHITECTURE NOTE: This module builds ON TOP of utils/logging.js:
// - logging.js: Core infrastructure (level filtering, console output, IndexedDB persistence)
// - ingest.js: Performance analytics layer (categorization, battery optimization, analytics export)
//
// This separation ensures logging.js remains focused on core logging while
// ingest.js handles performance-specific concerns like event categorization
// and battery optimization for the analytics pipeline.

import { structuredLog } from './logging.js';
import { deviceSummary } from './performance.js';

// Module-scoped queue for analytics events to avoid ReferenceError from closures
let eventQueue = [];
let lastFlushTime = 0;

// Pre-computed device context (computed once during init)
let DEVICE_CONTEXT = null;

// Lightweight event tracking focused on pipeline optimization
// Only track events that help developers optimize the video->audio pipeline
const PIPELINE_EVENTS = {
  // Core Media Pipeline Events (essential for performance optimization)
  user_workflow: [
    'startProcessing',       // When user starts video processing
    'stopProcessing',        // When user stops video processing  
    'toggleProcessing',      // User toggle action
    'setMode'               // Switch between flow/focus modes
  ],
  
  // Performance Critical Pipeline Events (high-frequency optimization targets)
  performance_critical: [
    'audioCuesReady',       // Frame->audio conversion complete (most critical)
    'setFrameProviderThrottle', // Auto-FPS throttling adjustments
    'logFrameBenchmark'     // Performance measurement events
  ],
  
  // Auto-Optimization Events (system-driven performance adjustments)
  auto_optimization: [
    'setFrameInterval',     // Dynamic FPS adjustments
    'diagnosticTick'        // System health monitoring
  ],
  
  // Settings That Affect Pipeline Performance
  performance_settings: [
    'setMaxNotes',         // Audio polyphony affects processing load
    'setMotionThreshold',  // Video sensitivity affects computation
    'setAutoFPS'          // Performance mode changes
  ]
};

// Performance optimization settings (can be overridden via engine state)
const OPTIMIZATION_DEFAULTS = {
  useIdleCallback: true,
  maxEventsPerSecond: 10,
  enableOnLowPerformance: true,
  enableOnMobile: true
};

// Performance monitoring for automatic optimization (replaces deprecated Battery API)
let performanceProfile = null;
let performanceCheckInterval = null;

/**
 * Creates battery-optimized ingest interceptor with dynamic categorization
 */
export function createIngestInterceptor(engine) {
  // Initialize device context once
  initializeDeviceContext();
  
  // Initialize performance monitoring
  initializePerformanceMonitoring(engine);
  
  // Rate limiting state handled at module scope (single-engine runtime)
  
  const originalDispatch = engine.dispatch;
  
  engine.dispatch = function(command, ...args) {
    // Execute original command first
    const result = originalDispatch.call(this, command, ...args);
    
    // Battery-optimized event tracking
    const shouldTrack = shouldTrackEvent(command, engine);
    if (shouldTrack) {
      const eventData = createLightweightEvent(command, engine);
      try { queueEvent(eventData, engine); } catch (e) {
        // Never break app flow due to analytics; log once per type via structuredLog
        try { structuredLog('ERROR', 'ingest_queue_error', { error: e?.message || String(e), message: 'Failed to queue analytics event' }); } catch(_) {}
      }
    }
    
    return result;
  };
  
  return engine;
}

/**
 * Initialize performance monitoring for automatic optimization
 * Uses practical indicators instead of deprecated Battery API
 */
function initializePerformanceMonitoring(engine) {
  // Get configurable thresholds from state
  const state = engine.getState();
  const thresholds = state.ingestPreferences?.performanceThresholds || {};
  
  // Detect performance profile with configurable thresholds
  performanceProfile = detectPerformanceProfile(thresholds);
  
  // Update optimization preferences based on performance profile
  updateOptimizationPreferences(engine);
  
  // Monitor for performance changes (connection speed, memory pressure)
  if (performanceCheckInterval) clearInterval(performanceCheckInterval);
  performanceCheckInterval = setInterval(() => {
    const currentProfile = detectPerformanceProfile(thresholds);
    if (hasPerformanceChanged(currentProfile, performanceProfile)) {
      performanceProfile = currentProfile;
      updateOptimizationPreferences(engine);
    }
  }, 60000); // Check every minute (less aggressive than battery monitoring)
}

/**
 * Detect device performance profile using available APIs and configurable thresholds
 */
function detectPerformanceProfile(thresholds = {}) {
  const profile = {
    // Hardware indicators
    cores: navigator.hardwareConcurrency || 1,
    memory: navigator.deviceMemory || 0,
    
    // Device type detection
    isMobile: /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent),
    
    // Network performance (if available)
    connectionType: navigator.connection?.effectiveType || 'unknown',
    isSlowConnection: (thresholds.slowConnectionTypes || ['slow-2g', '2g']).includes(navigator.connection?.effectiveType),
    
    // Performance hints
    isLowPerformance: false, // Will be computed below
    optimizationReason: []
  };
  
  // Use configurable thresholds for optimization decisions
  if (profile.cores <= (thresholds.lowCpuCores || 2)) {
    profile.optimizationReason.push('low_cpu');
  }
  if (profile.memory > 0 && profile.memory <= (thresholds.lowMemoryGB || 2)) {
    profile.optimizationReason.push('low_memory');
  }
  if (profile.isMobile && (thresholds.mobileOptimization !== false)) {
    profile.optimizationReason.push('mobile_device');
  }
  if (profile.isSlowConnection) {
    profile.optimizationReason.push('slow_connection');
  }
  
  profile.isLowPerformance = profile.optimizationReason.length > 0;
  
  return profile;
}

/**
 * Lightweight object comparison without JSON.stringify overhead
 */
function preferencesChanged(oldPrefs, newPrefs) {
  // Compare only the properties that matter for optimization
  return (
    oldPrefs.maxEventsPerSecond !== newPrefs.maxEventsPerSecond ||
    oldPrefs.useIdleCallback !== newPrefs.useIdleCallback ||
    oldPrefs.enableOnLowPerformance !== newPrefs.enableOnLowPerformance ||
    oldPrefs.enableOnMobile !== newPrefs.enableOnMobile
  );
}
function hasPerformanceChanged(current, previous) {
  if (!previous) return true;
  
  return (
    current.connectionType !== previous.connectionType ||
    current.isSlowConnection !== previous.isSlowConnection ||
    current.isLowPerformance !== previous.isLowPerformance
  );
}

/**
 * Update optimization preferences based on current performance profile
 */
function updateOptimizationPreferences(engine) {
  if (!performanceProfile) return;
  
  const state = engine.getState();
  if (!state.ingestPreferences) return;
  
  const oldPreferences = { ...state.ingestPreferences };
  let newPreferences = { ...state.ingestPreferences };
  
  // Automatic performance-based optimization
  if (performanceProfile.isLowPerformance) {
    // Low performance - aggressive optimization
    if (performanceProfile.cores <= 1) {
      newPreferences.maxEventsPerSecond = 1; // Very aggressive for single-core
    } else if (performanceProfile.isMobile && performanceProfile.isSlowConnection) {
      newPreferences.maxEventsPerSecond = 2; // Mobile + slow connection
    } else {
      newPreferences.maxEventsPerSecond = 5; // General low performance
    }
    newPreferences.useIdleCallback = true;
  } else {
    // Good performance - normal operation
    newPreferences.maxEventsPerSecond = 10;
    newPreferences.useIdleCallback = false;
  }
  
  // Only update if preferences changed (no JSON.stringify overhead)
  if (preferencesChanged(oldPreferences, newPreferences)) {
    state.ingestPreferences = newPreferences;
    structuredLog('INFO', 'performance_optimization_applied', {
      message: 'Auto-adjusted ingest preferences',
      cores: performanceProfile.cores,
      memory: performanceProfile.memory,
      isMobile: performanceProfile.isMobile,
      connectionType: performanceProfile.connectionType,
      optimizationReasons: performanceProfile.optimizationReason,
      oldMaxEvents: oldPreferences.maxEventsPerSecond,
      newMaxEvents: newPreferences.maxEventsPerSecond
    });
  }
}

/**
 * Initialize device context once to avoid repeated computations
 */
function initializeDeviceContext() {
  if (DEVICE_CONTEXT) return;
  
  try {
    const device = deviceSummary();
    DEVICE_CONTEXT = {
      cores: device.hardwareConcurrency,
      memory: device.deviceMemory,
      platform: device.platform,
      isMobile: device.isMobile,
      userAgent: device.userAgent
    };
  } catch (error) {
    DEVICE_CONTEXT = { error: 'Failed to gather device summary' };
  }
}

/**
 * Dynamic event categorization based on engine state
 */
function shouldTrackEvent(command, engine) {
  const state = engine.getState();
  
  // Check performance optimization settings
  const optimizationSettings = state.ingestPreferences || OPTIMIZATION_DEFAULTS;
  
  // Skip if ingest disabled
  if (!state.ingestEnabled) return false;
  
  // Performance-based optimization (replaces battery detection)
  if (optimizationSettings.enableOnLowPerformance && performanceProfile?.isLowPerformance) {
    // Reduced tracking on low-performance devices
    return getDynamicCategory(command, state) === 'user_workflow';
  }
  
  // Mobile optimization
  if (optimizationSettings.enableOnMobile && performanceProfile?.isMobile) {
    // Reduced tracking on mobile
    return getDynamicCategory(command, state) === 'user_workflow';
  }
  
  // Developer mode - track everything
  if (state.debugLogging) return true;
  
  // Production mode - selective tracking
  const category = getDynamicCategory(command, state);
  return category === 'user_workflow' || category === 'auto_optimization';
}

/**
 * Dynamic categorization based on current engine state and developer preferences
 */
function getDynamicCategory(command, state) {
  // Check for developer-defined categories in state
  if (state.ingestCategories) {
    for (const [category, commands] of Object.entries(state.ingestCategories)) {
      if (commands.includes(command)) return category;
    }
  }
  
  // Fallback to default pipeline events
  for (const [category, commands] of Object.entries(PIPELINE_EVENTS)) {
    if (commands.includes(command)) return category;
  }
  
  return 'unknown';
}

/**
 * Create lightweight event without JSON.stringify overhead
 */
function createLightweightEvent(command, engine) {
  const state = engine.getState();
  const category = getDynamicCategory(command, state);
  
  // Pre-computed base event
  const event = {
    event_type: 'performance_event',
    level: 'INFO',
    command,
    category,
    timestamp: Date.now(),
  url: window.location.href,
  app_version: state.buildInfo?.version || 'unknown',
  env: state.environment || 'production'
  };
  
  // Add context without JSON.stringify
  if (command === 'startProcessing' || command === 'stopProcessing') {
    event.device_capabilities = DEVICE_CONTEXT;
    event.performance_config = {
      update_interval: state.updateInterval,
      fps_mode: state.settings?.fpsMode,
      auto_fps_enabled: state.settings?.autoFPS,
      current_mode: state.currentMode
    };
  }
  
  if (command === 'setFrameProviderThrottle') {
    event.auto_optimization = {
      throttle_level: state.frameProviderThrottle,
      benchmark_interval: state.autoFpsBenchmark?.intervalMs,
      performance_health: state.sessionHealth
    };
  }
  
  return event;
}

function queueEvent(eventData, engine) {
  const state = engine.getState();
  const optimizationSettings = state.ingestPreferences || OPTIMIZATION_DEFAULTS;
  
  eventQueue.push(eventData);
  
  // Rate limiting
  const now = Date.now();
  const timeSinceLastFlush = now - lastFlushTime;
  const minInterval = 1000 / optimizationSettings.maxEventsPerSecond;
  
  if (timeSinceLastFlush < minInterval) return;
  
  // Use requestIdleCallback for performance optimization
  if (optimizationSettings.useIdleCallback && 'requestIdleCallback' in window) {
    requestIdleCallback(() => flushEventQueue(), { timeout: 5000 });
  } else {
    // Fallback to immediate processing
    setTimeout(() => flushEventQueue(), 0);
  }
  
  lastFlushTime = now;
}

/**
 * Flush queued events efficiently
 */
function flushEventQueue() {
  if (eventQueue.length === 0) return;
  
  const events = eventQueue.splice(0); // Clear queue
  
  // Batch process events - create event summary to reduce log noise
  const eventSummary = events.reduce((acc, event) => {
    const key = event.command || 'unknown';
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
  
  // Log batch summary instead of individual events
  structuredLog('DEBUG', 'Performance events flushed', { 
    batchSize: events.length,
    events: eventSummary,
    source: 'ingest-system'
  });
}

/**
 * Battery-optimized error tracking without JSON.stringify overhead
 */
export function setupIngestErrorTracking() {
  window.addEventListener('error', (event) => {
    const errorPayload = {
      event_type: 'client_error',
      level: 'ERROR',
      message: event.message || 'JavaScript error',
      source: 'javascript',
      filename: event.filename || '',
      lineno: event.lineno || 0,
      colno: event.colno || 0,
      stack: event.error?.stack || '',
  url: window.location.href,
  user_agent: navigator.userAgent,
  app_version: state.buildInfo?.version || 'unknown',
  env: 'production',
      timestamp: Date.now(),
      
      // Direct object instead of JSON.stringify
      error_context: {
        error_type: 'uncaught_exception',
        device_context: DEVICE_CONTEXT
      }
    };
    
    // Use existing logging system (includes IndexedDB via idb-logger.js)
    structuredLog('ERROR', 'error_ingest', errorPayload);
  });
  
  window.addEventListener('unhandledrejection', (event) => {
    const errorPayload = {
      event_type: 'client_error',
      level: 'ERROR',
      message: event.reason?.toString() || 'Promise rejection',
      source: 'promise',
      filename: '',
      lineno: 0,
      colno: 0,
      stack: event.reason?.stack || '',
  url: window.location.href,
  user_agent: navigator.userAgent,
  app_version: state.buildInfo?.version || 'unknown',
  env: 'production',
      timestamp: Date.now(),
      
      // Direct object instead of JSON.stringify
      error_context: {
        error_type: 'unhandled_promise_rejection',
        device_context: DEVICE_CONTEXT
      }
    };
    
    structuredLog('ERROR', 'error_ingest', errorPayload);
  });
}

/**
 * Developer-friendly API for dynamic categorization
 */
export function updateIngestCategories(engine, categories) {
  const state = engine.getState();
  state.ingestCategories = { ...state.ingestCategories, ...categories };
  structuredLog('INFO', 'ingest_categories_updated', {
    message: 'Dynamic categorization updated',
    newCategories: Object.keys(categories),
    totalCategories: Object.keys(state.ingestCategories || {}).length
  });
}

/**
 * Developer-friendly API for performance optimization settings
 */
export function updateOptimizationSettings(engine, settings) {
  const state = engine.getState();
  state.ingestPreferences = { ...OPTIMIZATION_DEFAULTS, ...state.ingestPreferences, ...settings };
  structuredLog('INFO', 'optimization_settings_updated', {
    settings: state.ingestPreferences
  });
}

/**
 * Get current performance profile for diagnostics
 */
export function getPerformanceProfile() {
  return performanceProfile;
}

/**
 * Cleanup performance monitoring (for testing or module cleanup)
 */
export function cleanupPerformanceMonitoring() {
  if (performanceCheckInterval) {
    clearInterval(performanceCheckInterval);
    performanceCheckInterval = null;
  }
  performanceProfile = null;
}