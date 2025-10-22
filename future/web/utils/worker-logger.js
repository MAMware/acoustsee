/**
 * worker-logger.js - Worker-Safe Logging
 * 
 * Purpose: Minimal logging for Web Workers that can't use IndexedDB or window APIs.
 * Workers must be able to log without crashing on import.
 * 
 * This module should be imported by workers instead of logging.js.
 * It provides the same structuredLog() API but without IDB/window dependencies.
 * 
 * Key differences from logging.js:
 * - No IndexedDB persistence (not available in workers)
 * - No window/navigator access (not available in workers)
 * - Logs via console.log for debugging (visible in DevTools)
 * - Logs via self.postMessage() to send to main thread
 * 
 * v1.0 Created: October 22, 2025
 * Autor: Claude Haiku 4.5 via GitHub Copilot Agent
 */

// Detect if we're in a worker context
const IS_WORKER = typeof window === 'undefined' && typeof self !== 'undefined';

// Import core logger ring buffer (should work in workers)
import { output } from './core-logger.js';

// Worker-safe log level mapping (same as main thread)
const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Get current log level from message sent by main thread, or default to INFO
let currentLogLevel = LOG_LEVELS.INFO;

// Message handler: main thread can set log level in workers
if (IS_WORKER) {
  self.addEventListener('message', (e) => {
    if (e.data?.type === 'setLogLevel') {
      const level = e.data.level;
      if (LOG_LEVELS[level] !== undefined) {
        currentLogLevel = LOG_LEVELS[level];
      }
    }
  });
}

/**
 * Safely stringify objects without crashing on circular refs
 */
function safeStringify(obj) {
  if (typeof obj !== 'object' || obj === null) return obj;
  
  const seen = new WeakSet();
  try {
    return JSON.stringify(obj, (key, val) => {
      if (typeof val === 'object' && val !== null) {
        if (seen.has(val)) return '[Circular]';
        seen.add(val);
      }
      if (val instanceof Error) {
        return { message: val.message, stack: val.stack };
      }
      return val;
    });
  } catch (e) {
    return '[Unstringifiable]';
  }
}

/**
 * Structured logging function - worker-safe version
 * 
 * @param {string} level - 'DEBUG', 'INFO', 'WARN', 'ERROR'
 * @param {string} message - Log message
 * @param {object} metadata - Optional metadata object
 * @param {boolean} addStack - Whether to include stack trace
 * @param {number} samplingRate - Probability (0-1) to actually log this item
 */
export function structuredLog(level, message, metadata = {}, addStack = false, samplingRate = 1.0) {
  // Skip if below current log level
  if (LOG_LEVELS[level] < currentLogLevel) {
    return;
  }

  // Apply sampling
  if (samplingRate < 1.0 && Math.random() >= samplingRate) {
    return;
  }

  // Build log entry
  const timestamp = new Date().toISOString();
  const logEntry = {
    timestamp,
    level,
    message,
    metadata: safeStringify(metadata) || {}
  };

  // Add stack if requested
  if (addStack && (level === 'WARN' || level === 'ERROR')) {
    try {
      logEntry.stack = new Error().stack;
    } catch (e) {
      // Silently ignore if stack unavailable
    }
  }

  // In workers: send to main thread via postMessage
  if (IS_WORKER && typeof self.postMessage === 'function') {
    try {
      self.postMessage({
        type: 'workerLog',
        log: logEntry
      });
    } catch (e) {
      // Fallback: at least log to console
      console.log(`[${level}] ${message}`, metadata);
    }
  }

  // Also send to ring buffer via core-logger (if available)
  try {
    output(timestamp, level, message, metadata, addStack);
  } catch (e) {
    // Silently ignore if core-logger unavailable
  }

  // Development: always console.log for visibility
  if (typeof console !== 'undefined') {
    const logStr = `[${timestamp}] ${level}: ${message}`;
    if (metadata && Object.keys(metadata).length > 0) {
      console.log(logStr, metadata);
    } else {
      console.log(logStr);
    }
  }
}

/**
 * Alternative structured log function for compatibility
 */
export function log(level, message, metadata = {}) {
  structuredLog(level, message, metadata, false, 1.0);
}

export default {
  structuredLog,
  log
};
