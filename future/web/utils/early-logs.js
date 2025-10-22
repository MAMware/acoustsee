/**
 * early-logs.js
 *
 * Utility for capturing and exporting logs that occur before dev panel initialization.
 * NOW: Queries from the consolidated ring buffer (core-logger.js) instead of IDB.
 * This ensures fresh, up-to-date logs without stale data pollution.
 *
 * Purpose:
 * - Capture logs generated during boot and main.js execution
 * - Export logs as JSON for manual download at splash screen
 * - Inject logs into dev panel Live Logs section on init
 * - Ensure no early logs are lost due to timing issues
 *
 * Design:
 * - Non-blocking: Uses async/await
 * - Fallback-safe: Returns empty array on errors
 * - Memory-efficient: Filters by timestamp to avoid duplication
 * - Single source of truth: Queries ring buffer (not IDB)
 */

import { getRingBufferLogs } from './core-logger.js';
import { structuredLog } from './logging.js';

/**
 * Timestamp of when the early logs collection period ends (in ms).
 * Set when dev panel is about to initialize.
 * Logs before this timestamp are considered "early".
 */
let devPanelInitTime = null;

/**
 * Mark the point in time when dev panel is initializing.
 * Any logs with timestamp < this value are considered "early logs".
 *
 * @returns {number} Timestamp in milliseconds
 */
export function markDevPanelInitTime() {
  devPanelInitTime = Date.now();
  structuredLog('DEBUG', 'early-logs', {
    message: 'Dev panel init marker set',
    timestamp: devPanelInitTime
  });
  return devPanelInitTime;
}

/**
 * Retrieve all early logs from the ring buffer.
 * Early logs are those created before dev panel initialization.
 * Fresh data, no stale IDB pollution.
 *
 * @returns {Promise<Array>} Array of log entry objects {timestamp, level, text, data}
 * @example
 * const earlyLogs = await captureEarlyLogs();
 * // Returns: [
 * //   { level: 'INFO', timestamp: '2025-10-22T...', text: '...', data: {...} },
 * //   { level: 'DEBUG', timestamp: '2025-10-22T...', text: '...', data: {...} },
 * //   ...
 * // ]
 */
export async function captureEarlyLogs() {
  try {
    // Get all logs from ring buffer (single source of truth)
    const allLogs = getRingBufferLogs();

    // If dev panel init time not set, return all logs
    if (!devPanelInitTime) {
      structuredLog('WARN', 'early-logs', {
        message: 'Dev panel init time not set; returning all logs',
        count: allLogs.length
      });
      return allLogs;
    }

    // Filter logs that occurred before dev panel initialization
    const earlyLogs = allLogs.filter(log => {
      // Ring buffer stores ISO timestamp strings
      const logTime = log.timestamp
        ? (typeof log.timestamp === 'string'
          ? new Date(log.timestamp).getTime()
          : log.timestamp)
        : 0;

      return logTime < devPanelInitTime;
    });

    structuredLog('DEBUG', 'early-logs', {
      message: 'Early logs captured',
      earlyCount: earlyLogs.length,
      totalCount: allLogs.length
    });

    return earlyLogs;
  } catch (error) {
    structuredLog('ERROR', 'early-logs', {
      message: 'Failed to capture early logs',
      error: error?.message || String(error)
    });
    return []; // Fallback to empty array
  }
}

/**
 * Export early logs as a JSON object suitable for download.
 * Includes metadata (timestamp, count, version).
 *
 * @returns {Promise<Object>} JSON object with logs and metadata
 * @example
 * const exportData = await exportEarlyLogsAsJson();
 * // Returns: {
 * //   exported_at: '2025-10-22T14:30:00.000Z',
 * //   log_count: 42,
 * //   app_version: '0.9.4',
 * //   early_logs: [ ... ]
 * // }
 */
export async function exportEarlyLogsAsJson() {
  try {
    const earlyLogs = await captureEarlyLogs();

    const exportData = {
      exported_at: new Date().toISOString(),
      log_count: earlyLogs.length,
      app_version: window.APP_VERSION || 'unknown',
      app_env: window.APP_ENV || 'development',
      user_agent: navigator.userAgent,
      url: window.location.href,
      early_logs: earlyLogs
    };

    structuredLog('INFO', 'early-logs', {
      message: 'Early logs exported',
      count: earlyLogs.length
    });

    return exportData;
  } catch (error) {
    structuredLog('ERROR', 'early-logs', {
      message: 'Failed to export early logs as JSON',
      error: error?.message || String(error)
    });

    // Return minimal export structure on error
    return {
      exported_at: new Date().toISOString(),
      log_count: 0,
      error: 'Failed to retrieve logs',
      early_logs: []
    };
  }
}

/**
 * Download early logs as a JSON file to user's device.
 * Triggers browser download dialog.
 *
 * @param {string} filename - Optional filename (default: acoustsee-early-logs-{timestamp}.json)
 * @returns {Promise<void>}
 * @example
 * await downloadEarlyLogsAsJson();
 * // User sees download dialog for: acoustsee-early-logs-1729610400000.json
 */
export async function downloadEarlyLogsAsJson(filename = null) {
  try {
    const exportData = await exportEarlyLogsAsJson();
    const json = JSON.stringify(exportData, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);

    // Generate filename with timestamp
    const ts = new Date().toISOString().replace(/[:\-]/g, '').slice(0, 15);
    const fname = filename || `acoustsee-early-logs-${ts}.json`;

    // Create download link and trigger click
    const link = document.createElement('a');
    link.href = url;
    link.download = fname;
    link.click();

    // Cleanup
    URL.revokeObjectURL(url);

    structuredLog('INFO', 'early-logs', {
      message: 'Early logs downloaded',
      filename: fname,
      size: blob.size
    });
  } catch (error) {
    structuredLog('ERROR', 'early-logs', {
      message: 'Failed to download early logs',
      error: error?.message || String(error)
    });
    throw error;
  }
}

/**
 * Format early logs for display in dev panel Live Logs section.
 * Converts log objects to displayable strings with consistent formatting.
 *
 * @param {Array} logs - Array of log entry objects
 * @returns {Array} Array of formatted log strings
 * @example
 * const formatted = formatEarlyLogsForDisplay(earlyLogs);
 * // Returns: [
 * //   "[INFO] 14:30:00 Boot started",
 * //   "[DEBUG] 14:30:01 Engine created",
 * //   ...
 * // ]
 */
export function formatEarlyLogsForDisplay(logs) {
  // Ring buffer stores pre-formatted text: "[timestamp] LEVEL: message data"
  // Just extract and return it as-is
  return logs.map(log => {
    // Ring buffer entry has: {timestamp, level, text, data}
    // The text field is already formatted by logging.js
    return log.text || JSON.stringify(log);
  });
}

/**
 * Inject early logs into dev panel Live Logs container.
 * Called from dev-panel.js setupUI() after Live Logs section is created.
 *
 * @param {HTMLElement} logsContainer - Container element (dev-panel-log-view)
 * @returns {Promise<number>} Count of logs injected
 * @example
 * const count = await injectEarlyLogsToDevPanel(document.getElementById('devpanel-log-view'));
 * console.log(`Injected ${count} early logs`);
 */
export async function injectEarlyLogsToDevPanel(logsContainer) {
  try {
    if (!logsContainer) {
      structuredLog('WARN', 'early-logs', {
        message: 'Dev panel logs container not found'
      });
      return 0;
    }

    const earlyLogs = await captureEarlyLogs();
    if (earlyLogs.length === 0) {
      structuredLog('DEBUG', 'early-logs', {
        message: 'No early logs to inject'
      });
      return 0;
    }

    // Format logs for display
    const formattedLogs = formatEarlyLogsForDisplay(earlyLogs);

    // Create container for early logs section if needed
    let earlyLogsSection = logsContainer.querySelector('.early-logs-section');
    if (!earlyLogsSection) {
      earlyLogsSection = document.createElement('div');
      earlyLogsSection.className = 'early-logs-section';
      earlyLogsSection.style.cssText = `
        padding: 8px;
        border-bottom: 2px solid #ddd;
        background-color: #fffacd;
        font-weight: bold;
        color: #666;
        font-size: 11px;
      `;
      earlyLogsSection.textContent = `📋 ${earlyLogs.length} early logs (before dev panel init):`;
      logsContainer.insertBefore(earlyLogsSection, logsContainer.firstChild);
    }

    // Inject each formatted log as a line
    formattedLogs.forEach(formattedLog => {
      const logLine = document.createElement('div');
      logLine.style.cssText = `
        padding: 4px 8px;
        border-bottom: 1px solid #eee;
        font-family: 'Monaco', 'Courier New', monospace;
        font-size: 12px;
        color: #333;
        background-color: #f9f9f9;
        white-space: pre-wrap;
        word-break: break-word;
      `;
      logLine.textContent = formattedLog;
      logsContainer.insertBefore(logLine, earlyLogsSection.nextSibling);
    });

    structuredLog('INFO', 'early-logs', {
      message: 'Early logs injected into dev panel',
      count: earlyLogs.length
    });

    return earlyLogs.length;
  } catch (error) {
    structuredLog('ERROR', 'early-logs', {
      message: 'Failed to inject early logs to dev panel',
      error: error?.message || String(error)
    });
    return 0;
  }
}

/**
 * Get summary statistics of early logs by level.
 * Useful for quick overview in splash screen or dev panel.
 *
 * @returns {Promise<Object>} Summary with counts by level
 * @example
 * const summary = await getEarlyLogsSummary();
 * // Returns: {
 * //   total: 42,
 * //   INFO: 15,
 * //   DEBUG: 20,
 * //   WARN: 5,
 * //   ERROR: 2
 * // }
 */
export async function getEarlyLogsSummary() {
  try {
    const earlyLogs = await captureEarlyLogs();

    const summary = {
      total: earlyLogs.length
    };

    // Count by level
    earlyLogs.forEach(log => {
      const level = (log.level || 'LOG').toUpperCase();
      summary[level] = (summary[level] || 0) + 1;
    });

    return summary;
  } catch (error) {
    structuredLog('ERROR', 'early-logs', {
      message: 'Failed to get early logs summary',
      error: error?.message || String(error)
    });
    return { total: 0, error: 'Failed to retrieve summary' };
  }
}
