// web/utils/core-logger.js
// Simple console-based output for logs, used to decouple logging concerns from persistence.

let outputCallback = null;

/**
 * Sets a callback function to be invoked for every log output.
 * Used by the debug UI to display logs in its own panel.
 * @param {Function|null} cb - The callback function `(level, text) => {}` or null to clear.
 */
export function setOutputCallback(cb) {
  outputCallback = cb;
}

/**
 * Output a text message using the appropriate console method.
 * @param {string} level - one of 'debug', 'info', 'warn', 'error'.
 * @param {string} text - the fully formatted log string.
 */
export function output(level, text) {
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
