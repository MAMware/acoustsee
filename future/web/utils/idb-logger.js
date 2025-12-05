// web/utils/idb-logger.js
// IndexedDB wrapper for persistent logging: Append JSON logs, retrieve all, cap size, export.
// Asynchronous, transaction-based for non-blocking ops in high-throughput scenarios.
// Fallback if IndexedDB not supported (e.g., logs to console only).

const DB_NAME = 'AcoustSeeLogsDB';
const DB_VERSION = 1;
const STORE_NAME = 'logs';
const MAX_ENTRIES = 1000;  // Cap to prevent unbounded growth.
let dbPromise = null;

// Check IndexedDB support (technical: Feature detection to avoid errors in non-supporting envs like some iframes or old browsers).
const isIndexedDBSupported = 'indexedDB' in window;

import { structuredLog } from './logging.js';
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
async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB().catch(err => {
      console.warn('IndexedDB init failed; falling back to console-only logging:', err.message);
      return null;  // Null signals fallback.
    });
  }
  return dbPromise;
}

// Append a log entry (JSON object). Fallback to console if DB unavailable.
export async function addIdbLog(logEntry) {
  const db = await getDB();
  if (!db) {
    console.warn('DB unavailable; logging to console:', logEntry);
    structuredLog('WARN', 'IDB fallback to console', { entry: logEntry }, false, false);
    return;  // Fallback: No persistence.
  }
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const addRequest = store.add(logEntry);

    addRequest.onsuccess = () => {
      // Cap size: If over max, delete oldest (cursor for efficiency).
      capLogSize(store).then(resolve).catch(reject);
    };
    addRequest.onerror = () => reject(addRequest.error);

    transaction.onerror = () => reject(transaction.error);
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