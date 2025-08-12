// web/core/handlers/debug-handlers.js
import { structuredLog } from '../../utils/logging.js';
import { getLogs } from '../state.js';

// The logEvent function has been removed.

/**
 * Asynchronously inspects and returns state logs for debugging.
 * This is a reusable data provider for UI panels or log exports.
 * @returns {Promise<Array<Object>>} A promise that resolves to the array of log objects.
 */
export async function inspectState() { // <-- The 'context' parameter is gone.
  try {
    const logs = await getLogs();
    structuredLog('INFO', 'debugHandlers.inspectState: Retrieved state logs', { logCount: logs.length });
    return logs;
  } catch (err) {
    structuredLog('ERROR', 'debugHandlers.inspectState: Failed to get logs', { error: err.message });
    throw err;
  }
}
