// web/utils/logging.js
// Centralized logging utilities for structured, level-based outputs with async emission and sampling.
// Supports async to avoid blocking high-throughput paths (e.g., frame processing).
// Sampling reduces log volume for DEBUG level in performance-critical scenarios.

import { addIdbLog } from './idb-logger.js';
import { output } from './core-logger.js';
import { DEFAULT_LOG_LEVEL, LOG_LEVELS } from '../core/constants.js';
// DO NOT import from utils.js here - creates circular dependency!
// Instead, lazily import getText, announceMessage, speakText when needed
// Avoid importing `isMobile` from ./performance.js here because that module
// imports `state.js` which in turn imports this logger. That circular import
// can cause a temporal-dead-zone (TDZ) where logger internals aren't
// initialized yet and calls like `structuredLog` throw. Detect mobile
// synchronously here without pulling in the other module.

function detectIsMobile() {
  try {
    const ua = (typeof navigator !== 'undefined' && navigator.userAgent) ? navigator.userAgent : '';
    return /Mobile|Android|iPhone|iPad/.test(ua);
  } catch (e) {
    return false;
  }
}

// Safely stringify objects, handling circular refs and Error instances
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, (key, val) => {
    if (typeof val === 'object' && val !== null) {
      if (seen.has(val)) return '[Circular]';
      seen.add(val);
    }
    if (val instanceof Error) {
      return { message: val.message, stack: val.stack };
    }
    return val;
  });
}

// LOG_LEVELS now imported from constants.js

let currentLogLevel = LOG_LEVELS[DEFAULT_LOG_LEVEL];
let sampleRate = detectIsMobile() ? 0.1 : 1.0;  // 10% DEBUG logs on mobile.

// Config for logging behavior, including throttling
const loggingConfig = {
  includeMetadata: true, // Enable/disable metadata
  includeUserAgent: false, // Privacy: excluded by default
  includeStack: false, // Only include for WARN/ERROR by default
  includeUrl: false, // Only include for WARN/ERROR by default
  maxLogsPerMessage: 15, // Max identical messages per THROTTLE_WINDOW_MS
  throttleWindowMs: 1000, // Throttle window duration in milliseconds
  enableThrottling: true, // Global throttling enable/disable
};

// Phase 3.1b-Hotfix: Sampling rates for different event types (configurable from dev-panel)
// Use these instead of hardcoded Math.random() < 0.1 values scattered throughout code
const SAMPLING_RATES = {
  frameProcessing: 0.01,      // 1% of frames (very high frequency)
  workerProcessing: 0.05,     // 5% of worker events
  audioSynthesis: 0.1,        // 10% of audio synthesis events
  modeChanges: 0.5,           // 50% of mode changes (less frequent)
  cueGeneration: 0.1,         // 10% of cue generation
};

// Export configs for runtime control (e.g., from dev-panel)
export { loggingConfig, SAMPLING_RATES };

// Auto-generate metadata from stack trace (conditional based on log level)
function generateMetadata(level = 'INFO', callStack = '') {
  if (!loggingConfig.includeMetadata) return {};
  
  const normalizedLevel = level.toUpperCase();
  const isHighPriority = normalizedLevel === 'WARN' || normalizedLevel === 'ERROR';
  const isError = normalizedLevel === 'ERROR';
  
  // Start with empty metadata object
  const metadata = {};
  
  // Extract caller location using the callStack captured at structuredLog entry
  const stack = callStack || '';
  const lines = stack.split('\n');
  
  // Find the first line that's NOT from logging.js or core-logger.js
  // (skip the Error constructor and internal logging frames)
  let callerLine = '';
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Skip frames from logging.js or core-logger.js
    if (!line.includes('logging.js') && !line.includes('core-logger.js')) {
      callerLine = line;
      break;
    }
  }
  
  // Parse filename, lineno, colno from stack
  // Handle multiple formats: "at fn (file:line:col)" or "at file:line:col"
  let match = callerLine.match(/\((.+?):(\d+):(\d+)\)/);
  if (!match) {
    match = callerLine.match(/at (.+):(\d+):(\d+)/);
  }
  
  if (match) {
    // Extract just the filename from the path
    let fullPath = match[1];
    const filename = fullPath.split('/').pop() || fullPath;
    metadata.filename = filename;
    metadata.lineno = parseInt(match[2], 10);
    metadata.colno = parseInt(match[3], 10);
  }
  
  // Only include full stack for WARN/ERROR when includeStack is enabled
  if (loggingConfig.includeStack && isHighPriority) {
    metadata.stack = stack;
  }
  
  // UserAgent ONLY for ERROR logs (not WARN) - reduces noise on mobile
  if (loggingConfig.includeUserAgent && isError) {
    metadata.userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  }
  
  // URL only for high-priority logs
  if (loggingConfig.includeUrl && isHighPriority) {
    metadata.url = typeof location !== 'undefined' ? location.href : '';
  }
  
  return metadata;
}

export function setLogLevel(level) {
  const upperLevel = level.toUpperCase();
  if (Object.keys(LOG_LEVELS).includes(upperLevel)) {
    currentLogLevel = LOG_LEVELS[upperLevel];
  } else {
    structuredLog('WARN', 'Invalid log level attempted', { level });
  }
}

// Helper to set sampling rate (0.0 to 1.0; from settings or dynamically).
export function setSampleRate(rate) {
  if (rate >= 0 && rate <= 1) {
    sampleRate = rate;
  } else {
    structuredLog('WARN', 'Invalid sample rate attempted', { rate });
  }
}

// Phase 3.1b-Hotfix: Helper to check if an event should be sampled (replaces hardcoded Math.random() < 0.1)
// Usage: if (shouldSample('cueGeneration')) { log(...) }
export function shouldSample(eventType = 'frameProcessing') {
  const rate = SAMPLING_RATES[eventType] ?? 0.1; // Default to 10% if unknown event type
  return Math.random() < rate;
}

// Helper to set a specific sampling rate for an event type (callable from dev-panel)
export function setSamplingRate(eventType, rate) {
  if (typeof rate !== 'number' || rate < 0 || rate > 1) {
    structuredLog('WARN', 'Invalid sampling rate for event type', { eventType, rate });
    return;
  }
  SAMPLING_RATES[eventType] = rate;
  structuredLog('INFO', 'Sampling rate updated', { eventType, rate });
}

/**
 * Logs a structured message with level, timestamp, and data payload.
 * Dispatches asynchronously to prevent blocking high-throughput paths (frame processing).
 * @param {string} level - One of 'DEBUG', 'INFO', 'WARN', 'ERROR'.
 * @param {string} message - Descriptive message (e.g., 'setAudioInterval').
 * @param {Object} [data={}] - Additional context (e.g., { timerId: 42, ms: 50 }).
 * @param {boolean|Object} [persist=true] - If true, persist to IDB. If object, use as options.
 * @param {boolean} [applyRateLimitingAndSampling=true] - If false, bypass throttling and sampling.
 * @param {Object} [options] - Enhanced logging options
 * @param {string} [options.traceId] - Trace ID for correlating related logs
 * @param {Object} [options.state] - App state (for i18n translation, if enabled elsewhere) // R171025 elsewhere like where?
 * @param {boolean} [options.unthrottled=false] - If true, skip throttling (takes precedence)
 * @param {boolean} [options.announce=false] - Announce to screen reader
 * @param {boolean} [options.speak=false] - Speak via TTS
 * @param {boolean} [options.toast=false] - Show in dev panel
 * @param {string} [options.persistAs] - Explicit ingestion key (e.g., 'telemetry', 'error')
 */

let inStructuredLog = false;
let globalTraceId = null; // Global trace context for correlation

export function setGlobalTraceId(traceId) {
  globalTraceId = traceId;
}

export function getGlobalTraceId() {
  return globalTraceId;
}

// Rate limiting for log flooding prevention
const logThrottleMap = new Map();

function shouldThrottle(level, message) {
  // Skip if throttling is disabled globally
  if (!loggingConfig.enableThrottling) return false;
  
  // Don't throttle ERROR level logs
  if (level.toUpperCase() === 'ERROR') return false;
  
  const key = `${level}:${message}`;
  const now = Date.now();
  
  if (!logThrottleMap.has(key)) {
    logThrottleMap.set(key, { count: 1, firstTime: now, lastTime: now });
    return false;
  }
  
  const entry = logThrottleMap.get(key);
  
  // If outside the throttle window, reset
  if (now - entry.firstTime > loggingConfig.throttleWindowMs) {
    entry.count = 1;
    entry.firstTime = now;
    entry.lastTime = now;
    return false;
  }
  
  // If we've hit the limit, throttle
  if (entry.count >= loggingConfig.maxLogsPerMessage) {
    entry.lastTime = now;
    return true;
  }
  
  // Still within limits
  entry.count++;
  entry.lastTime = now;
  return false;
}

// warn-once helper: log the same warning only once per key
const _warnOnceSet = new Set();
export function warnOnce(key, level = 'WARN', message, data = {}) {
  if (_warnOnceSet.has(key)) return;
  _warnOnceSet.add(key);
  structuredLog(level, message, data, true, false);
}

// Error throttler: aggregate repeated errors and optionally return whether to log full stack
const _errorCounts = new Map();
export function throttleError(err, options = {}) {
  try {
    const message = err && err.message ? err.message : String(err || 'Error');
    const key = options.key || (err && err.name ? `${err.name}:${message}` : message);
    const prev = _errorCounts.get(key) || 0;
    _errorCounts.set(key, prev + 1);

    // If first occurrence, return { log: true }
    if (prev === 0) return { log: true, occurrences: 1 };

    // Otherwise, only log every N occurrences
    const sampleEvery = options.sampleEvery || 50;
    if ((prev + 1) % sampleEvery === 0) return { log: true, occurrences: prev + 1 };
    return { log: false, occurrences: prev + 1 };
  } catch (e) {
    return { log: true, occurrences: 1 };
  }
}

export function structuredLog(level, message, data = {}, persist = true, sample = true, options = {}) {
  // Capture call stack IMMEDIATELY at function entry (before any processing)
  // This is critical for accurate source location extraction
  const callStack = new Error().stack || '';
  
  // Handle legacy API: if persist is an object, it's the options parameter
  if (typeof persist === 'object' && persist !== null && !Array.isArray(persist)) {
    options = persist;
    persist = true;
  }
  
  const { 
    traceId = globalTraceId,
    unthrottled = false,
    announce = false, 
    speak = false, 
    toast = false,
    persistAs = null,
    announceMessageFn,
    speakTextFn
  } = options;
  
  const numericLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
  if (numericLevel < currentLogLevel) return;
  
  // Apply sampling only for DEBUG level if sample is true (corrected semantics)
  if (sample && level.toUpperCase() === 'DEBUG' && Math.random() > sampleRate) return;
  
  // Rate limiting check (unless unthrottled flag is set)
  if (!unthrottled && shouldThrottle(level, message)) {
    return;
  }

  if (inStructuredLog) return;
  inStructuredLog = true;
  try {
    const timestamp = new Date().toISOString();
    
    // NOTE: Translation removed from hot path. Move i18n logic to UI/presentation layer post-hoc.
    const finalMessage = message;
    
    // Auto-generate metadata and merge with provided data (pass level and callStack for accurate source location)
    const metadata = generateMetadata(level, callStack);
    
    // Add rich telemetry data for D1 ingestion, including traceId for correlation // R171025 the correlation is only for D1 ingestion? it might be usefull to have it at "Live logs"
    const telemetryData = {
      ...metadata,
      ...data, // Allow overrides or additions
    };
    
    // Add traceId if available for log correlation
    if (traceId) {
      telemetryData.traceId = traceId;
    }
    
    // Extract error info if available
    if (data.error && data.error instanceof Error) {
      telemetryData.filename = data.error.fileName || '';
      telemetryData.lineno = data.error.lineNumber || 0;
      telemetryData.colno = data.error.columnNumber || 0;
      telemetryData.stack = data.error.stack || '';
    }
    
    const logEntry = { timestamp, level: level.toUpperCase(), message: finalMessage, data: telemetryData };
    
    // Add explicit ingestion category if provided
    if (persistAs) {
      logEntry.ingestionKey = persistAs;
    }
    
    // Use core-logger to output formatted message
    // Extract caller location if available for display
    const callerInfo = telemetryData.filename && telemetryData.lineno 
      ? ` ${telemetryData.filename}:${telemetryData.lineno}:${telemetryData.colno || 0}`
      : '';
    
    let payload = '';
    if (Object.keys(telemetryData).length) {
      try {
        payload = ' ' + safeStringify(telemetryData);
      } catch (e) {
        payload = ' [Unserializable data]';
      }
    }
    // Pass structured data to core-logger so it's stored in ring buffer
    output(level.toLowerCase(), `[${timestamp}] ${logEntry.level}: ${finalMessage}${callerInfo}${payload}`, {
      timestamp,
      message: finalMessage,
      callerInfo,
      ...telemetryData
    });
    
    // Accessibility features (opt-in)
    if (announce && announceMessageFn) {
      try {
        announceMessageFn(finalMessage);
      } catch (err) {
        console.warn('Failed to announce message:', err);
      }
    }
    
    if (speak && speakTextFn) {
      try {
        speakTextFn(finalMessage, 'polite');
      } catch (err) {
        console.warn('Failed to speak message:', err);
      }
    }
    
    // Dev panel toast (opt-in)
    if (toast) {
      try {
        showDevToast(finalMessage, { level: level.toUpperCase() });
      } catch (err) {
        console.warn('Failed to show dev toast:', err);
      }
    }
    
    // Send to analytics endpoint if configured
    if (typeof window !== 'undefined' && window.ANALYTICS_ENDPOINT) {
      sendToAnalytics(logEntry).catch(err => {
        console.warn('Failed to send to analytics:', err);
      });
    }
    
    // Enhanced IndexedDB persistence for important logs
    if (persist) {
      // Determine persistence based on explicit key or log level
      let shouldPersist = false;
      
      if (persistAs) {
        // If explicit ingestion key provided, always persist
        shouldPersist = true;
      } else {
        // Otherwise, persist WARN+ level logs by default
        shouldPersist = numericLevel >= LOG_LEVELS.WARN;
      }
      
      if (shouldPersist) {
        addIdbLog(logEntry).catch(err => {
          console.warn('Failed to persist log to IndexedDB:', err.message);
        });
      }
    }
  } finally {
    inStructuredLog = false;
  }
}

const defaultAdapter = {
  async log(level, payload = {}) {
    try {
      // If payload is a string, map to message; if object, extract message
      const message = typeof payload === 'string' ? payload : (payload && payload.message) || String(payload || '');
      const data = (payload && payload.data) || (typeof payload === 'object' ? payload : {});
      
      // Ensure we have complete telemetry data (conditionally added based on log level)
      const telemetryData = {
        filename: payload?.filename || '',
        lineno: payload?.lineno || 0,
        colno: payload?.colno || 0,
        stack: payload?.stack || null,
        ...data
      };
      
      // structuredLog is synchronous; do not await a non-Promise to avoid misleading callers
      structuredLog(level, message, telemetryData, true, true);
    } catch (err) {
      // Best-effort: avoid throwing from logger
      try { console.warn('logging.defaultAdapter.log failed', err); } catch (e) {}
    }
  },
  async logError(err) {
    try {
      const message = err && err.message ? err.message : String(err || 'Error');
      const data = { 
        stack: err && err.stack,
        filename: '',
        lineno: 0,
        colno: 0
      };
      // structuredLog is synchronous; do not await a non-Promise to avoid misleading callers
      structuredLog('ERROR', message, data, true, false);
    } catch (e) {
      try { console.warn('logging.defaultAdapter.logError failed', e); } catch (er) {}
    }
  }
};

/**
 * Send log entry to analytics endpoint for D1 ingestion
 */
async function sendToAnalytics(logEntry) {
  if (typeof window === 'undefined' || !window.ANALYTICS_ENDPOINT) return;
  
  try {
    await fetch(window.ANALYTICS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        event_type: 'client_error',
        level: logEntry.level,
        message: logEntry.message,
        timestamp: logEntry.timestamp,
        source: 'client',
        filename: logEntry.data?.filename || '',
        lineno: logEntry.data?.lineno || 0,
        colno: logEntry.data?.colno || 0,
        stack: logEntry.data?.stack || '',
        user_agent: logEntry.data?.user_agent || '',
        url: logEntry.data?.url || '',
        app_version: logEntry.data?.app_version || null,
        env: logEntry.data?.env || null,
        payload_json: JSON.stringify(logEntry.data),
        ingestion_id: logEntry.data?.ingestion_id || null,
      }),
    });
  } catch (err) {
    // Don't throw - analytics failure shouldn't break app
    console.warn('Analytics send failed:', err);
  }
}

/**
 * Show toast notification in dev panel
 */
function showDevToast(message, { level }) {
  if (typeof document === 'undefined') return;
  
  const panel = document.getElementById('acoustsee-dev-panel');
  if (!panel) return; // Dev panel not active
  
  // Find or create toast container
  let toastContainer = panel.querySelector('.dev-toasts');
  if (!toastContainer) {
    toastContainer = document.createElement('div');
    toastContainer.className = 'dev-toasts';
    toastContainer.style.cssText = 'position: fixed; top: 60px; right: 10px; z-index: 10000; max-width: 300px;';
    panel.appendChild(toastContainer);
  }
  
  // Create toast element
  const toast = document.createElement('div');
  toast.className = `dev-toast dev-toast--${level.toLowerCase()}`;
  toast.textContent = message;
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');
  
  // Style based on level
  const levelColors = {
    ERROR: '#fee',
    WARN: '#ffa',
    INFO: '#eff',
    DEBUG: '#eee',
  };
  toast.style.cssText = `
    background: ${levelColors[level] || '#fff'};
    border-left: 4px solid ${level === 'ERROR' ? '#f00' : level === 'WARN' ? '#fa0' : '#0af'};
    padding: 10px;
    margin-bottom: 8px;
    border-radius: 4px;
    box-shadow: 0 2px 4px rgba(0,0,0,0.2);
    font-size: 12px;
    animation: slideIn 0.3s ease-out;
  `;
  
  toastContainer.appendChild(toast);
  
  // Auto-remove after 3 seconds
  setTimeout(() => {
    toast.style.animation = 'slideOut 0.3s ease-in';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

/**
 * Cleanup function to dispose logging resources.
 * Clears all in-memory throttle state, warn-once keys, error counts, and trace context.
 * Should be called during app shutdown or module cleanup.
 * @returns {void}
 */
export function dispose() {
  // Clear all rate-limiting state
  logThrottleMap.clear();
  
  // Clear warn-once tracking
  _warnOnceSet.clear();
  
  // Clear error count deduplication
  _errorCounts.clear();
  
  // Reset global trace context
  globalTraceId = null;
  
  // Note: inStructuredLog and _invalidListenerSeen are internal guards; cleared for safety
  inStructuredLog = false;
}

export default defaultAdapter;