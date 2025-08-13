// File: web/core/handlers/debug-handlers.js

import { structuredLog } from '../../utils/logging.js';
import { getLogs } from '../state.js';
import { getText, speakText } from '../../utils/utils.js';
import { getDOM } from '../context.js';

/**
 * Toggles the visibility of a debug overlay.
 */
export async function toggleDebug({ show }) {
  try {
    const DOM = getDOM();
    if (DOM.debugPanel) { // Check if the debug panel exists in the DOM
      DOM.debugPanel.style.display = show ? 'block' : 'none';
    }
    const msg = await getText('button6.tts.settingsToggle', { state: show ? 'on' : 'off' });
    speakText(msg);
  } catch (err) {
    structuredLog('ERROR', 'toggleDebug error', { message: err.message, stack: err.stack });
  }
}

/**
 * Compiles logs from IndexedDB and initiates a download for the user.
 */
export async function emailDebug() {
  try {
    const logsText = await getLogs(); // getLogs now returns a formatted string
    if (!logsText || logsText.trim() === '') {
      structuredLog('WARN', 'emailDebug: No logs to download.');
      alert('No logs available to download.');
      const msg = await getText('button5.tts.emailDebug', { state: 'error' });
      speakText(msg);
      return;
    }

    const blob = new Blob([logsText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'acoustsee-debug-log.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    const msg = await getText('button5.tts.emailDebug');
    speakText(msg);

  } catch (err) {
    structuredLog('ERROR', 'emailDebug error', { message: err.message, stack: err.stack });
    alert('Failed to download logs: ' + err.message);
    const errorMsg = await getText('button5.tts.emailDebug', { state: 'error' });
    speakText(errorMsg);
  }
}

/**
 * Asynchronously inspects and returns state logs for debugging panels.
 * @returns {Promise<Array<Object>>} A promise that resolves to the array of log objects.
 */
export async function inspectState() {
  try {
    // Note: getLogs() in state.js returns a formatted string. 
    // To keep the debug panel working, we'd ideally need a function that
    // returns the raw log objects. Let's assume getAllIdbLogs is what we need.
    const { getAllIdbLogs } = await import('../../utils/idb-logger.js');
    const logs = await getAllIdbLogs();
    structuredLog('INFO', 'debugHandlers.inspectState: Retrieved raw state logs', { logCount: logs.length });
    return logs;
  } catch (err) {
    structuredLog('ERROR', 'debugHandlers.inspectState: Failed to get logs', { error: err.message });
    throw err;
  }
}