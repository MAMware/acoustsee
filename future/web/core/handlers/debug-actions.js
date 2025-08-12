import { inspectState } from './core/handlers/debug-handlers.js';

/**
 * Downloads the current logs as a text file for the user.
 * Can be called from a UI button or menu item.
 */
export async function downloadLogs() {
  try {
    const logs = await inspectState();
    if (!logs || logs.length === 0) {
      alert('No logs to download.');
      return;
    }

    const formattedText = logs.map(log =>
      `[${log.timestamp}] [${log.level}]\n${log.message}\nData: ${JSON.stringify(log.data, null, 2)}\n---`
    ).join('\n');

    const blob = new Blob([formattedText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);

    const a = document.createElement('a');
    a.href = url;
    a.download = 'acoustsee-logs.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  } catch (error) {
    alert('Failed to prepare logs for download.');
  }
}
