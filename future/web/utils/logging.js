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

// Config for logging behavior
const loggingConfig = {
  includeMetadata: true, // Enable/disable metadata
  includeUserAgent: false, // Privacy: excluded by default
  includeStack: false, // Only include for WARN/ERROR by default
  includeUrl: false, // Only include for WARN/ERROR by default
};

// Export config for runtime control
export { loggingConfig };

// Auto-generate metadata from stack trace (conditional based on log level)
function generateMetadata(level = 'INFO') {
  if (!loggingConfig.includeMetadata) return {};
  
  const normalizedLevel = level.toUpperCase();
  const isHighPriority = normalizedLevel === 'WARN' || normalizedLevel === 'ERROR';
  const isError = normalizedLevel === 'ERROR';
  
  // Start with empty metadata object
  const metadata = {};
  
  // Stack traces only for WARN/ERROR
  if (loggingConfig.includeStack && isHighPriority) {
    const error = new Error();
    const stack = error.stack || '';
    const lines = stack.split('\n');
    const callerLine = lines[2] || ''; // Approximate caller info
    
    // Parse filename, lineno, colno from stack (basic parsing)
    const match = callerLine.match(/at (.+):(\d+):(\d+)/);
    metadata.filename = match ? match[1] : '';
    metadata.lineno = match ? parseInt(match[2], 10) : 0;
    metadata.colno = match ? parseInt(match[3], 10) : 0;
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

/**
 * Logs a structured message with level, timestamp, and data payload.
 * Emits asynchronously to prevent blocking.
 * @param {string} level - One of 'DEBUG', 'INFO', 'WARN', 'ERROR'.
 * @param {string} message - Descriptive message (e.g., 'setAudioInterval').
 * @param {Object} [data={}] - Additional context (e.g., { timerId: 42, ms: 50 }).
 * @param {boolean|Object} [persist=true] - If true, persist to IDB. If object, use as options.
 * @param {boolean} [sample=true] - If false, bypass sampling (for critical logs).
 * @param {Object} [options] - Enhanced logging options
 * @param {Object} [options.state] - App state (for i18n translation)
 * @param {Function} [options.getTextFn] - getText function (to avoid circular import)
 * @param {Function} [options.announceMessageFn] - announceMessage function
 * @param {Function} [options.speakTextFn] - speakText function
 * @param {boolean} [options.translate=false] - Treat message as i18n key
 * @param {boolean} [options.announce=false] - Announce to screen reader
 * @param {boolean} [options.speak=false] - Speak via TTS
 * @param {boolean} [options.toast=false] - Show in dev panel
 */

let inStructuredLog = false;

// Rate limiting for log flooding prevention
const logThrottleMap = new Map();
const THROTTLE_WINDOW_MS = 1000; // 1 second window
const MAX_LOGS_PER_MESSAGE = 5; // Max 5 identical messages per second

function shouldThrottle(level, message) {
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
  if (now - entry.firstTime > THROTTLE_WINDOW_MS) {
    entry.count = 1;
    entry.firstTime = now;
    entry.lastTime = now;
    return false;
  }
  
  // If we've hit the limit, throttle
  if (entry.count >= MAX_LOGS_PER_MESSAGE) {
    entry.lastTime = now;
    return true;
  }
  
  // Still within limits
  entry.count++;
  entry.lastTime = now;
  return false;
}

/**
 * Logs a structured message synchronously with recursion guard and rate limiting.
 */
export function structuredLog(level, message, data = {}, persist = true, sample = true, options = {}) {
  // Handle legacy API: if persist is an object, it's the options parameter
  if (typeof persist === 'object' && persist !== null && !Array.isArray(persist)) {
    options = persist;
    persist = true;
  }
  
  const { 
    state, 
    getTextFn, 
    announceMessageFn, 
    speakTextFn,
    translate = false, 
    announce = false, 
    speak = false, 
    toast = false 
  } = options;
  
  const numericLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
  if (numericLevel < currentLogLevel) return;
  if (sample && level.toUpperCase() === 'DEBUG' && Math.random() > sampleRate) return;
  
  // Rate limiting check
  if (shouldThrottle(level, message)) {
    return;
  }

  if (inStructuredLog) return;
  inStructuredLog = true;
  try {
    const timestamp = new Date().toISOString();
    
    // Translate message if requested and state available
    let finalMessage = message;
    if (translate && state && getTextFn) {
      try {
        // Use provided getText function to avoid circular import
        finalMessage = getTextFn(message, data, state);
        // getText is async, but we can't await in sync function
        // So we handle the promise inline
        if (finalMessage && typeof finalMessage.then === 'function') {
          finalMessage.then(translatedMsg => {
            // Re-log with translated message (deferred)
            structuredLog(level, translatedMsg, data, persist, sample, { ...options, translate: false });
          }).catch(() => {
            // Translation failed, use original
          });
          // Use original message for now
          finalMessage = message;
        }
      } catch (err) {
        // If translation fails, use original message
        finalMessage = message;
      }
    }
    
    // Auto-generate metadata and merge with provided data (pass level for conditional metadata)
    const metadata = generateMetadata(level);
    
    // Add rich telemetry data for D1 ingestion
    const telemetryData = {
      ...metadata,
      ...data, // Allow overrides or additions
    //  ingestion_id: crypto && crypto.randomUUID ? crypto.randomUUID() : null,
    //  user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
    //  url: typeof location !== 'undefined' ? location.href : '',
    };
    
    // Extract error info if available
    if (data.error && data.error instanceof Error) {
      telemetryData.filename = data.error.fileName || '';
      telemetryData.lineno = data.error.lineNumber || 0;
      telemetryData.colno = data.error.columnNumber || 0;
      telemetryData.stack = data.error.stack || '';
    }
    
    const logEntry = { timestamp, level: level.toUpperCase(), message: finalMessage, data: telemetryData };
    
    // Use core-logger to output formatted message
    let payload = '';
    if (Object.keys(telemetryData).length) {
      try {
        payload = ' ' + safeStringify(telemetryData);
      } catch (e) {
        payload = ' [Unserializable data]';
      }
    }
    output(level.toLowerCase(), `[${timestamp}] ${logEntry.level}: ${finalMessage}${payload}`);
    
    // Accessibility features (opt-in)
    if (announce && announceMessageFn) {
      try {
        announceMessageFn(finalMessage);
      } catch (err) {
        console.warn('Failed to announce message:', err);
      }
    }
    
    if (speak && state && speakTextFn) {
      try {
        speakTextFn(finalMessage, 'polite', state);
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
      // Always persist WARN+ level logs and performance_ingest data
      const shouldPersist = numericLevel >= LOG_LEVELS.WARN || 
                           message === 'performance_ingest' || 
                           message.includes('error_ingest');
      
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

export default defaultAdapter;