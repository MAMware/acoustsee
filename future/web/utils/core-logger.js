// web/utils/core-logger.js
// Consolidated logging core: Ring buffer stores ALL logs in real-time.
// Single source of truth regardless of platform (mobile, desktop, etc).
// All structuredLog() calls route through this buffer for:
//   - Browser console output
//   - Dev panel Live Logs display
//   - Early logs export
//   - Analytics ingestion
//   - IDB persistence (WARN+ only)

import { DEFAULT_LOG_LEVEL, LOG_LEVELS } from '../core/constants.js';

// ============================================================================
// RING BUFFER: Single source of truth for all logs
// ============================================================================

const DEFAULT_BUFFER_SIZE = 1000; // Same as log-viewer.js default
let ringBuffer = [];
let bufferIndex = 0;
let bufferFull = false;

/**
 * Ring buffer entry: {timestamp, level, text, data}
 * Stores the complete formatted log + metadata for all consumers.
 */
function addToRingBuffer(level, text, data = {}) {
  const entry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    text: text,
    data: data
  };

  if (ringBuffer.length < DEFAULT_BUFFER_SIZE) {
    ringBuffer.push(entry);
  } else {
    // Ring behavior: overwrite oldest entries
    ringBuffer[bufferIndex] = entry;
    bufferIndex = (bufferIndex + 1) % DEFAULT_BUFFER_SIZE;
    bufferFull = true;
  }

  return entry;
}

/**
 * Retrieve all logs from ring buffer in chronological order.
 * Used by early-logs.js, exports, and dev panel initialization.
 * @returns {Array} Array of {timestamp, level, text, data}
 */
export function getRingBufferLogs() {
  if (!bufferFull) {
    // Buffer not yet full, return in order
    return ringBuffer.map(e => ({ ...e }));
  }
  // Buffer full: start from oldest (bufferIndex) and wrap around
  const result = [];
  for (let i = 0; i < ringBuffer.length; i++) {
    result.push({ ...ringBuffer[(bufferIndex + i) % ringBuffer.length] });
  }
  return result;
}

/**
 * Clear all logs from ring buffer.
 * Called on app reset or explicit user action.
 */
export function clearRingBuffer() {
  ringBuffer = [];
  bufferIndex = 0;
  bufferFull = false;
}

/**
 * Get count of logs in ring buffer.
 */
export function getRingBufferCount() {
  return ringBuffer.length;
}

// ============================================================================
// OUTPUT CALLBACKS & LOG LEVEL FILTERING
// ============================================================================

let outputCallback = null;
let currentLogLevel = LOG_LEVELS[DEFAULT_LOG_LEVEL] || LOG_LEVELS.INFO;

/**
 * Sets a callback function to be invoked for every log output.
 * Used by the dev panel to display logs in real-time.
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
 * Get the current log level threshold.
 * @returns {number} Numeric log level
 */
export function getCurrentLogLevel() {
  return currentLogLevel;
}

// ============================================================================
// MAIN OUTPUT FUNCTION: Routes to buffer + console + callbacks
// ============================================================================

/**
 * Output a structured log entry.
 * Routes through ring buffer to ensure single source of truth for all consumers.
 * @param {string} level - one of 'debug', 'info', 'warn', 'error'.
 * @param {Object|string} entry - structured log entry {timestamp, level, message, metadata, data} OR legacy formatted string
 * @param {Object} [legacyData] - (deprecated) only used if entry is a string for backward compat
 */
export function output(level, entry, legacyData = {}) {
  // Convert level to uppercase for comparison
  const upperLevel = level.toUpperCase();
  const numericLevel = LOG_LEVELS[upperLevel] || LOG_LEVELS.INFO;
  
  // Respect log level filtering for ALL outputs
  if (numericLevel < currentLogLevel) return;
  
  // Handle both new structured format and legacy string format
  let logEntry, consoleText;
  
  if (typeof entry === 'object' && entry !== null && !Array.isArray(entry)) {
    // New structured format from logging.js
    const { timestamp, message, metadata = {}, data = {}, ingestionKey } = entry;
    
    logEntry = {
      timestamp,
      level: upperLevel,
      message,
      metadata,
      data,
      ingestionKey
    };
    
    // Format for console output: compact but readable
    // Don't embed filename:lineno here - browser console will add its own prefix anyway
    consoleText = `[${timestamp}] ${upperLevel}: ${message}`;
    
    // Add metadata summary only if available (to minimize console clutter)
    if (metadata.filename && metadata.lineno) {
      consoleText += ` (${metadata.filename}:${metadata.lineno})`;
    }
  } else {
    // Legacy string format (for backward compatibility)
    consoleText = entry;
    logEntry = {
      timestamp: new Date().toISOString(),
      level: upperLevel,
      message: entry,
      metadata: {},
      data: legacyData
    };
  }
  
  // ===== Add to ring buffer (single source of truth) =====
  // Store the STRUCTURED entry, not the formatted string
  addToRingBuffer(upperLevel, consoleText, logEntry);
  
  // ===== Output to browser console =====
  const method = console[level] || console.log;
  
  // Extract meaningful data (exclude metadata to avoid duplication with consoleText)
  // Also exclude empty objects to reduce console noise
  const meaningfulData = logEntry.data && typeof logEntry.data === 'object'
    ? Object.keys(logEntry.data)
        .filter(key => key !== 'filename' && key !== 'lineno' && key !== 'colno')
        .reduce((acc, key) => {
          acc[key] = logEntry.data[key];
          return acc;
        }, {})
    : null;
  
  const hasData = meaningfulData && Object.keys(meaningfulData).length > 0;
  
  if (hasData) {
    // Output message with cleaned data object (browser will pretty-print it)
    // Freeze the object to prevent console from showing prototype chain
    method(consoleText, Object.freeze({ ...meaningfulData }));
  } else {
    // Just the message
    method(consoleText);
  }

  // ===== Notify dev panel callback (log-viewer.js) =====
  if (outputCallback) {
    try {
      // Pass formatted text for display, but callback could also use logEntry if needed
      outputCallback(level, consoleText);
    } catch (e) {
      // Prevent callback errors from crashing the logger
      console.warn('Log output callback failed', e);
    }
  }
}
