// Smart ingest system that leverages existing performance monitoring
// instead of duplicating metrics computation. Renamed from "telemetry" 
// to avoid browser extension conflicts.

import { structuredLog } from './logging.js';
import { deviceSummary } from './performance.js';
import { BUILD_VERSION } from '../core/constants.js';

// Only track events that provide performance optimization insights
const PERFORMANCE_EVENTS = {
  'startProcessing': { level: 'INFO', source: 'user_workflow' },
  'stopProcessing': { level: 'INFO', source: 'user_workflow' },
  'switchMode': { level: 'INFO', source: 'user_workflow' },
  'setFrameProviderThrottle': { level: 'INFO', source: 'auto_optimization' }
};

/**
 * Creates performance-focused ingest interceptor that leverages existing systems
 */
export function createIngestInterceptor(engine) {
  const originalDispatch = engine.dispatch;
  
  engine.dispatch = function(command, ...args) {
    // Check if event should be tracked BEFORE executing
    const eventConfig = PERFORMANCE_EVENTS[command];
    
    // Execute original command first
    const result = originalDispatch.call(this, command, ...args);
    
    // Track performance event AFTER successful execution
    if (eventConfig) {
      try {
        const payload = createPerformancePayload(command, eventConfig, engine);
        structuredLog(eventConfig.level, 'performance_ingest', command, payload);
      } catch (error) {
        // Don't break the original command if ingest fails
        structuredLog('WARN', 'ingest_error', 'Failed to create performance payload', { 
          command, 
          error: error.message 
        });
      }
    }
    
    return result;
  };
  
  return engine;
}

/**
 * Creates performance-focused payload using existing systems
 */
function createPerformancePayload(command, eventConfig, engine) {
  const state = engine.getState();
  
  // Base payload for Cloudflare (using existing constants)
  const payload = {
    event_type: 'performance_event',
    level: eventConfig.level,
    message: `Performance: ${command}`,
    source: eventConfig.source,
    url: window.location.href,
    user_agent: navigator.userAgent,
    app_version: BUILD_VERSION, // From constants.js
    env: state.environment || 'production',
    
    // Performance context as JSON (leverage existing performance.js)
    payload_json: JSON.stringify(createPerformanceContext(command, state))
  };
  
  return payload;
}

/**
 * Creates performance context using existing performance.js utilities
 */
function createPerformanceContext(command, state) {
  const context = { action: command };
  
  // Use existing deviceSummary() for device capabilities
  if (command === 'startProcessing') {
    try {
      const device = deviceSummary();
      context.device_capabilities = {
        cores: device.hardwareConcurrency,
        memory: device.deviceMemory,
        platform: device.platform,
        is_mobile: device.isMobile,
        user_agent_summary: device.userAgent
      };
      
      // Current performance configuration
      context.performance_config = {
        update_interval: state.updateInterval,
        fps_mode: state.settings?.fpsMode,
        auto_fps_enabled: state.settings?.autoFPS,
        current_mode: state.currentMode
      };
    } catch (error) {
      context.device_error = 'Failed to gather device summary';
    }
  }
  
  // AutoFPS decisions for optimization insights
  if (command === 'setFrameProviderThrottle') {
    context.auto_optimization = {
      throttle_level: state.frameProviderThrottle,
      benchmark_interval: state.autoFpsBenchmark?.intervalMs,
      performance_health: state.sessionHealth
    };
  }
  
  return context;
}

/**
 * Simple error tracking without filtering
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
      app_version: BUILD_VERSION,
      env: 'production',
      
      payload_json: JSON.stringify({
        error_type: 'uncaught_exception'
      })
    };
    
    // Use existing logging system (includes IndexedDB via idb-logger.js)
    structuredLog('ERROR', 'error_ingest', 'JavaScript Error', errorPayload);
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
      app_version: BUILD_VERSION,
      env: 'production',
      
      payload_json: JSON.stringify({
        error_type: 'unhandled_promise_rejection'
      })
    };
    
    structuredLog('ERROR', 'error_ingest', 'Promise Rejection', errorPayload);
  });
}