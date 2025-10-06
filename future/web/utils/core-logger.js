// web/utils/core-logger.js
// Simple console-based output for logs, used to decouple logging concerns from persistence.
// Now includes log level filtering to respect DEFAULT_LOG_LEVEL for dev panel output.

import { DEFAULT_LOG_LEVEL, LOG_LEVELS } from '../core/constants.js';

let outputCallback = null;
let currentLogLevel = LOG_LEVELS[DEFAULT_LOG_LEVEL] || LOG_LEVELS.INFO;

/**
 * Sets a callback function to be invoked for every log output.
 * Used by the debug UI to display logs in its own panel.
 * @param {Function|null} cb - The callback function `(level, text) => {}` or null to clear.
 */
export function setOutputCallback(cb) {
  outputCallback = cb;
}

/**
 * Sets the minimum log level to output.
 * @param {string} level - one of 'DEBUG', 'INFO', 'WARN', 'ERROR'.
 */
export function setLogLevel(level) {
  const upperLevel = level.toUpperCase();
  if (LOG_LEVELS[upperLevel] !== undefined) {
    currentLogLevel = LOG_LEVELS[upperLevel];
  }
}

/**
 * Output a text message using the appropriate console method.
 * Now respects log level filtering for both console and dev panel output.
 * @param {string} level - one of 'debug', 'info', 'warn', 'error'.
 * @param {string} text - the fully formatted log string.
 */
export function output(level, text) {
  // Convert level to uppercase for comparison
  const upperLevel = level.toUpperCase();
  const numericLevel = LOG_LEVELS[upperLevel] || LOG_LEVELS.INFO;
  
  // Respect log level filtering for ALL outputs (console AND dev panel)
  if (numericLevel < currentLogLevel) return;
  
  const method = console[level] || console.log;
  method(text);

  if (outputCallback) {
    try {
      outputCallback(level, text);
    } catch (e) {
      // Prevent callback errors from crashing the logger
      console.warn('Log output callback failed', e);
    }
  }
}
