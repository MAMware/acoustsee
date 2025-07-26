// web/utils/logging.js
// Centralized logging utilities for structured, level-based outputs with async emission and sampling.
// Supports async to avoid blocking high-throughput paths (e.g., frame processing).
// Sampling reduces log volume for DEBUG level in performance-critical scenarios.

import { addLog } from '../state.js';  // Import for persist=true; calls addLog with serialized entry.

const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3,
};

let currentLogLevel = LOG_LEVELS.DEBUG;  // Default; can be set from settings.debugLogging.
let sampleRate = 1.0;  // Default: log all; e.g., 0.1 for 10% sampling on DEBUG.

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
export function structuredLog(level, message, data = {}, persist = true, sample = true) {
  const numericLevel = LOG_LEVELS[level.toUpperCase()] || LOG_LEVELS.INFO;
  if (numericLevel < currentLogLevel) return;  // Skip if below threshold.

  // Sampling: For DEBUG, randomly skip based on sampleRate.
  if (sample && level.toUpperCase() === 'DEBUG' && Math.random() > sampleRate) return;

  const timestamp = new Date().toISOString();
  const logEntry = { timestamp, level: level.toUpperCase(), message, data };

  // Async emission: Use setTimeout(0) for browser (non-blocking queue).
  setTimeout(() => {
    // Human-readable console output.
    const consoleMethod = console[level.toLowerCase()] || console.log;
    consoleMethod(`[${timestamp}] ${logEntry.level}: ${message}`, data);

    if (persist) {
      // Serialize and persist via addLog.
      const serialized = JSON.stringify(logEntry);  // Full JSON for parseability.
      addLog(serialized);
    }
  }, 0);
}