// web/utils/idb-logger.js
// IndexedDB wrapper for persistent logging: Append JSON logs, retrieve all, cap size, export.
// Asynchronous, transaction-based for non-blocking ops in high-throughput scenarios.

let dbPromise = null;
const DB_NAME = 'AcoustSeeLogsDB';
const DB_VERSION = 1;
const STORE_NAME = 'logs';
const MAX_ENTRIES = 1000;  // Cap to prevent unbounded growth.

// Open (or create) DB asynchronously.
function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      db.createObjectStore(STORE_NAME, { autoIncrement: true });
    };
  });
}

// Lazy-init DB promise.
async function getDB() {
  if (!dbPromise) {
    dbPromise = openDB();
  }
  return dbPromise;
}

// Append a log entry (JSON object).
export async function addIdbLog(logEntry) {
  const db = await getDB();
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
      const excess = countRequest.result - MAX_ENTRIES;
      const cursorRequest = store.openCursor();

      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && excess > 0) {
          cursor.delete();
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

// Retrieve all logs for export.
export async function getAllIdbLogs() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readonly');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

// Clear all logs (optional, e.g., after send).
export async function clearIdbLogs() {
  const db = await getDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], 'readwrite');
    const store = transaction.objectStore(STORE_NAME);
    const request = store.clear();

    request.onsuccess = resolve;
    request.onerror = () => reject(request.error);
  });
}