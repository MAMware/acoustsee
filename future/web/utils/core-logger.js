// web/utils/core-logger.js
// Simple console-based output for logs, used to decouple logging concerns from persistence.

/**
 * Output a text message using the appropriate console method.
 * @param {string} level - one of 'debug', 'info', 'warn', 'error'.
 * @param {string} text - the fully formatted log string.
 */
export function output(level, text) {
  const method = console[level] || console.log;
  method(text);
}
