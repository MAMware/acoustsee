// Synchronous reporting wrapper for core modules.
// Provides safe, no-op tolerant functions that call the default logging adapter if available.

import logger from '../utils/logging.js';

export function reportError(err, meta = {}) {
  try {
    if (logger && typeof logger.logError === 'function') {
      try { logger.logError(err, meta); } catch (e) { /* best effort */ }
    } else if (logger && typeof logger.log === 'function') {
      try { logger.log('ERROR', { message: err && err.message ? err.message : String(err), stack: err && err.stack, meta }); } catch (e) {}
    } else {
      // fallback to console
      try { console.error(err); } catch (e) {}
    }
  } catch (e) {
    try { console.error('reportError wrapper failed', e); } catch (er) {}
  }
}

export function reportInfo(message, data = {}) {
  try {
    if (logger && typeof logger.log === 'function') {
      try { logger.log('INFO', { message, data }); } catch (e) {}
    } else {
      try { console.info(message, data); } catch (e) {}
    }
  } catch (e) {
    try { console.error('reportInfo wrapper failed', e); } catch (er) {}
  }
}
