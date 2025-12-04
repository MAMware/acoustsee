// web/utils/logging.js
// Centralized logging utilities for structured, level-based outputs with async emission and sampling.
// Supports async to avoid blocking high-throughput paths (e.g., frame processing).
// Sampling reduces log volume for DEBUG level in performance-critical scenarios.

import { addIdbLog } from './idb-logger.js';  // Updated to use IndexedDB.

// Capture original console methods before any overrides
const originalConsoleRef = {
  log: console.log,
  warn: console.warn,
  error: console.error,
};

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

let currentLogLevel = LOG_LEVELS.DEBUG;  // Default; can be set from settings.debugLogging.
const isMobile = /Mobile|Android|iPhone|iPad/.test(navigator.userAgent);
let sampleRate = isMobile ? 0.1 : 1.0;  // 10% DEBUG logs on mobile.

// Helper to set global log level (e.g., from settings.isSettingsMode or debugLogging).
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
/**
 * Logs a structured message synchronously with recursion guard.
 */
export async function structuredLog(level, message, data = {}, persist = true, sample = true) {
  const numericLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
  if (numericLevel < currentLogLevel) return;
  if (sample && level.toUpperCase() === 'DEBUG' && Math.random() > sampleRate) return;

  if (inStructuredLog) return;
  inStructuredLog = true;
  try {
    const timestamp = new Date().toISOString();
    const logEntry = { timestamp, level: level.toUpperCase(), message, data };
    // Use global console to avoid circular import
    const fn = (console[level.toLowerCase()] || console.log).bind(console);
    fn(`[${timestamp}] ${logEntry.level}: ${message}`, data);
    if (persist) {
      addIdbLog(logEntry).catch(err => {
        originalConsole.warn('Failed to persist log to IndexedDB:', err.message);
      });
    }
  } finally {
    inStructuredLog = false;
  }
}