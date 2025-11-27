// web/utils/idb-logger.js
// IndexedDB wrapper for persistent logging: Append JSON logs, retrieve all, cap size, export.
// Asynchronous, transaction-based for non-blocking ops in high-throughput scenarios.
// Fallback if IndexedDB not supported (e.g., logs to console only).

import { output } from './core-logger.js';

const DB_NAME = 'AcoustSeeLogsDB';
const DB_VERSION = 1;
const STORE_NAME = 'logs';
const MAX_ENTRIES = 1000;
let dbPromise = null;

// Circuit breaker state for error loops
let recentErrorCount = 0;
let lastErrorResetTime = Date.now();
const ERROR_THRESHOLD = 100;
const ERROR_WINDOW_MS = 10000;

// Check IndexedDB support (feature-detect safely so Node imports don't throw).
const isIndexedDBSupported = (typeof window !== 'undefined') && ('indexedDB' in window);

// Safe stringify that:
//  - drops functions,
//  - converts Error to plain objects,
//  - marks circular refs with "[Circular]"
function safeStringify(obj) {
  const seen = new WeakSet();
  return JSON.stringify(obj, function (_k, v) {
    if (typeof v === 'function') return undefined;
    if (v instanceof Error) return { message: v.message, stack: v.stack };
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
    }
    return v;
  });
}

// Sanitize into a plain cloneable object suitable for IndexedDB (and network)
function sanitizeForIdb(obj) {
  try {
    return JSON.parse(safeStringify(obj));
  } catch (e) {
    return { _unserializable: true, repr: String(obj) };
  }
}
// Open (or create) DB asynchronously with retry on transient errors.
function openDB(retries = 3) {
  if (!isIndexedDBSupported) {
    return Promise.reject(new Error('IndexedDB not supported in this environment'));
  }
  return new Promise((resolve, reject) => {
    const attempt = (count) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onerror = () => {
        if (count > 0) {
          setTimeout(() => attempt(count - 1), 500);
        } else {
          reject(request.error);
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onupgradeneeded = (event) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { autoIncrement: true });
        }
      };
    };
    attempt(retries);
  });
}

// Lazy-init DB promise with error handling.
let hasLoggedIdbFailure = false; // Track if we've already warned about IDB failure

async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB().catch(err => {
      // Log ONCE with WARN level to avoid spam
      if (!hasLoggedIdbFailure) {
        console.warn('[IDB] Falling back to console-only logging:', err.message);
        hasLoggedIdbFailure = true;
      }
      return null;  // Null signals fallback.
    });
  }
  return dbPromise;
}

// Append a log entry (JSON object). Fallback to console if DB unavailable.
export async function addIdbLog(logEntry) {
  // Circuit breaker: Stop logging if too many errors occur rapidly
  const now = Date.now();
  if (now - lastErrorResetTime > ERROR_WINDOW_MS) {
    recentErrorCount = 0;
    lastErrorResetTime = now;
  }
  
  if (recentErrorCount > ERROR_THRESHOLD) {
    return; // Circuit breaker open - prevent DB thrashing
  }

  const db = await getDB();
  if (!db) {
    // DB unavailable - normal logging path will handle console output
    // No need to log here as it creates duplicates
    return;  
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
  const sanitized = sanitizeForIdb(logEntry);
  const addRequest = store.add(sanitized);

    addRequest.onsuccess = () => {
      // Cap size: If over max, delete oldest (cursor for efficiency).
      capLogSize(store).then(resolve).catch(reject);
    };
    addRequest.onerror = () => {
      recentErrorCount++;
      reject(addRequest.error);
    };

    transaction.onerror = () => {
      recentErrorCount++;
      reject(transaction.error);
    };
  });
}

// Helper to cap entries: Delete oldest if > MAX_ENTRIES.
async function capLogSize(store) {
  return new Promise((resolve, reject) => {
    const countRequest = store.count();
    countRequest.onsuccess = () => {
      if (countRequest.result <= MAX_ENTRIES) return resolve();

      // Delete excess oldest entries via cursor.
      let deleted = 0;
      const excess = countRequest.result - MAX_ENTRIES;
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && deleted < excess) {
          cursor.delete();
          deleted++;
          cursor.continue();
        } else {
          resolve();
        }
      };
      cursorRequest.onerror = () => reject(cursorRequest.error);
    };
    countRequest.onerror = () => reject(countRequest.error);
  });
}

// Retrieve all logs for export. Fallback to empty if DB unavailable.
export async function getAllIdbLogs() {
  const db = await getDB();
  if (!db) return [];  // Fallback: Empty array.
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Clear all logs (optional, e.g., after send). Fallback no-op if DB unavailable.
export async function clearIdbLogs() {
  const db = await getDB();
  if (!db) return;
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}