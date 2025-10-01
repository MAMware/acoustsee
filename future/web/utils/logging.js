// web/utils/logging.js
// Centralized logging utilities for structured, level-based outputs with async emission and sampling.
// Supports async to avoid blocking high-throughput paths (e.g., frame processing).
// Sampling reduces log volume for DEBUG level in performance-critical scenarios.

import { addIdbLog } from './idb-logger.js';
import { output } from './core-logger.js';
import { DEFAULT_LOG_LEVEL, LOG_LEVELS } from '../core/constants.js';
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
 * @param {boolean} [persist=true] - If true, also calls addLog with serialized form.
 * @param {boolean} [sample=true] - If false, bypass sampling (for critical logs).
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
export function structuredLog(level, message, data = {}, persist = true, sample = true) {
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
    
    // Ensure data is always a proper object with default telemetry fields
    const safeData = data && typeof data === 'object' ? data : {};
    const telemetryData = {
      source: 'client',
      filename: '',
      lineno: 0,
      colno: 0,
      stack: null,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      url: typeof location !== 'undefined' ? location.href : '',
      ...safeData // Merge in provided data, allowing overrides
    };
    
    const logEntry = { timestamp, level: level.toUpperCase(), message, data: telemetryData };
  // Use core-logger to output formatted message
    let payload = '';
    if (Object.keys(telemetryData).length) {
      try {
        payload = ' ' + safeStringify(telemetryData);
      } catch (e) {
        payload = ' [Unserializable data]';
      }
    }
  output(level.toLowerCase(), `[${timestamp}] ${logEntry.level}: ${message}${payload}`);
    if (persist) {
      addIdbLog(logEntry).catch(err => {
        console.warn('Failed to persist log to IndexedDB:', err.message);
      });
    }
  } finally {
    inStructuredLog = false;
  }
}

// Default adapter export for runtime consumers (boot.js expects a .log(level, payload) API)
const defaultAdapter = {
  async log(level, payload = {}) {
    try {
      // If payload is a string, map to message; if object, extract message
      const message = typeof payload === 'string' ? payload : (payload && payload.message) || String(payload || '');
      const data = (payload && payload.data) || (typeof payload === 'object' ? payload : {});
      
      // Ensure we have complete telemetry data
      const telemetryData = {
        source: 'client',
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
        source: 'client',
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

export default defaultAdapter;