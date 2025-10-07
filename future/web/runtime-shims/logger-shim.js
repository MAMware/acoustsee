/**
 * Simplified Structured Logging Shim
 * 
 * Provides a basic structuredLog() function compatible with the real logging system.
 * 
 * LIMITATIONS:
 * - Does NOT persist to IndexedDB
 * - Does NOT support log level filtering (all levels output)
 * - Does NOT include stack traces, userAgent, or URL metadata
 * - Does NOT support sampling or throttling
 * 
 * USE FOR:
 * - Testing modules that use structuredLog()
 * - Verifying log message formats
 * - Smoke testing logging integration
 * 
 * For real logging behavior, use browser integration tests.
 */

export function structuredLog(level, text, data) {
  const out = { level, text, data };
  if (level === 'ERROR') console.error('[LOG]', JSON.stringify(out));
  else if (level === 'WARN') console.warn('[LOG]', JSON.stringify(out));
  else console.info('[LOG]', JSON.stringify(out));
}
