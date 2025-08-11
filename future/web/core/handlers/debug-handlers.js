// debug-handlers.js
// Handles debug logging and async state inspection

import { structuredLog } from '../../utils/logging.js';
import { getLogs } from '../state.js';

/**
 * Logs an event with structured logging for debugging purposes.
 */
export function logEvent(event, context) {
  structuredLog('DEBUG', 'debugHandlers.logEvent', { event, context });
}

/**
 * Asynchronously inspects and returns state logs for debugging.
 * Returns a promise that resolves to the logs array.
 */
export async function inspectState(context) {
  try {
    const logs = await getLogs();
    structuredLog('INFO', 'debugHandlers.inspectState: State logs', { logs });
    return logs;
  } catch (err) {
    structuredLog('ERROR', 'debugHandlers.inspectState: Failed to get logs', { error: err.message });
    throw err;
  }
}
