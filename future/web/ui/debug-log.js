// Centralized debug logging core: buffering, view-binding, export/clear, pause, and compatibility shim
const DEFAULT_MAX = 1000;
let maxEntries = DEFAULT_MAX;
const buffer = [];
let logView = null;
let pendingEntries = [];
let flushScheduled = false;
let paused = false;
let filterText = '';
let filterLevel = null; // null means no level filter
let onCountChange = null;

function fmtTs(d = new Date()) { return d.toISOString().replace('T', ' ').replace('Z', ''); }

function createRow(entry) {
  const row = document.createElement('div');
  row.className = 'log-entry';
  const ts = document.createElement('span'); ts.className = 'log-timestamp'; ts.textContent = fmtTs(new Date(entry.t));
  const badge = document.createElement('span'); badge.className = `log-badge ${entry.level.toLowerCase()}`; badge.textContent = entry.level;
  const txt = document.createElement('span'); txt.className = 'log-text'; txt.textContent = entry.text;
  row.appendChild(ts); row.appendChild(badge); row.appendChild(txt);
  return row;
}

function scheduleFlush() {
  if (!flushScheduled && !paused && logView) {
    flushScheduled = true;
    requestAnimationFrame(flushPendingEntries);
  }
}

function flushPendingEntries() {
  if (!logView || pendingEntries.length === 0) {
    flushScheduled = false;
    return;
  }

  const fragment = document.createDocumentFragment();
  // apply filter when appending
  pendingEntries.forEach(entry => {
    if (filterLevel && entry.level !== filterLevel) return;
    if (filterText && !String(entry.text).toLowerCase().includes(filterText.toLowerCase())) return;
    fragment.appendChild(createRow(entry));
  });
  pendingEntries.length = 0;
  logView.appendChild(fragment);

  // Prune old DOM nodes
  while (logView.children.length > maxEntries) {
    logView.removeChild(logView.firstChild);
  }

  // Handle autoscroll
  const autoscroll = document.getElementById('autoscroll-checkbox')?.checked ?? document.getElementById('debugPanelAutoscroll')?.checked ?? true;
  if (autoscroll) {
    logView.scrollTop = logView.scrollHeight;
  }

  flushScheduled = false;
  // notify any listener about count change (buffer reflects appended entries)
  try { if (typeof onCountChange === 'function') onCountChange({ filtered: getFilteredCount(), total: getTotalCount() }); } catch (e) {}
}

export function debugLog(level, text) {
  const lvl = String(level || 'INFO').toUpperCase();
  const entry = { t: Date.now(), level: lvl, text: typeof text === 'string' ? text : JSON.stringify(text) };
  buffer.push(entry);
  if (buffer.length > maxEntries) buffer.shift();
  // enqueue for batched append
  pendingEntries.push(entry);
  scheduleFlush();
}

export function setLogView(el, opts = {}) {
  logView = el || null;
  if (!logView) return;
  // optional max override
  if (opts.maxEntries) maxEntries = opts.maxEntries;
  // insert version header if available
  try {
    const metaVer = document.querySelector('meta[name="acoustsee-version"]')?.getAttribute('content');
    const ver = metaVer || window.ACOUSTSEE_VERSION || window.ACOUSTSEE_APP_VERSION || null;
    if (ver) {
      const verEl = document.createElement('div');
      verEl.style.fontSize = '12px'; verEl.style.marginBottom = '8px'; verEl.style.opacity = '0.9';
      verEl.textContent = `Version: ${ver}`;
      logView.appendChild(verEl);
    }
  } catch (e) {}

  // Clear existing content and flush the entire buffer into the view in one op
  logView.innerHTML = '';
  const fragment = document.createDocumentFragment();
  buffer.forEach(entry => {
    if (filterLevel && entry.level !== filterLevel) return;
    if (filterText && !String(entry.text).toLowerCase().includes(filterText.toLowerCase())) return;
    fragment.appendChild(createRow(entry));
  });
  logView.appendChild(fragment);
  const autoscroll = document.getElementById('autoscroll-checkbox')?.checked ?? document.getElementById('debugPanelAutoscroll')?.checked ?? true;
  if (autoscroll) logView.scrollTop = logView.scrollHeight;
  try { if (typeof onCountChange === 'function') onCountChange({ filtered: getFilteredCount(), total: getTotalCount() }); } catch (e) {}
}

export function clearLogs() {
  buffer.length = 0;
  pendingEntries.length = 0;
  if (logView) logView.innerHTML = '';
  try { if (typeof onCountChange === 'function') onCountChange({ filtered: getFilteredCount(), total: getTotalCount() }); } catch (e) {}
}
export function getTotalCount() { return Array.isArray(buffer) ? buffer.length : 0; }
export function getFilteredCount() {
  try {
    if (!buffer || buffer.length === 0) return 0;
    const ft = filterText ? String(filterText).toLowerCase() : '';
    return buffer.reduce((acc, entry) => {
      if (filterLevel && entry.level !== filterLevel) return acc;
      if (ft && !String(entry.text).toLowerCase().includes(ft)) return acc;
      return acc + 1;
    }, 0);
  } catch (e) { return 0; }
}
export function setOnCountChange(cb) { onCountChange = typeof cb === 'function' ? cb : null; }
export function setFilterText(txt) { filterText = String(txt || '').trim(); if (logView) setLogView(logView, { maxEntries }); }
export function setFilterLevel(lvl) { filterLevel = lvl ? String(lvl).toUpperCase() : null; if (logView) setLogView(logView, { maxEntries }); }
export function exportLogs() { return JSON.stringify(buffer, null, 2); }
export function setPaused(v) { paused = !!v; }

/**
 * Import an array of log-like objects into the debug buffer.
 * Each item should have { t, level, text } or compatible fields.
 * Returns the number of entries added.
 */
export function importLogs(entries, { dedupe = true } = {}) {
  try {
    if (!Array.isArray(entries)) return 0;
    let added = 0;
    let lastText = null;
    for (const e of entries) {
      try {
        const lvl = String((e && e.level) || 'INFO').toUpperCase();
        const text = e && typeof e.text === 'string' ? e.text : (e && e.text ? JSON.stringify(e.text) : '');
        if (dedupe && lastText !== null && lastText === text) continue;
        const entry = { t: e && e.t ? e.t : Date.now(), level: lvl, text };
        buffer.push(entry);
        pendingEntries.push(entry);
        if (buffer.length > maxEntries) buffer.shift();
        lastText = text;
        added++;
      } catch (err) {
        // ignore entry-level parse errors
      }
    }
    // schedule a flush to render these entries
    try { scheduleFlush(); } catch (err) {}
    try { if (typeof onCountChange === 'function') onCountChange({ filtered: getFilteredCount(), total: getTotalCount() }); } catch (e) {}
    return added;
  } catch (e) { return 0; }
}

/**
 * Parse JSON text (array) and import logs. Returns number added.
 */
export function importFromJson(jsonText, opts = {}) {
  try {
    if (!jsonText) return 0;
    const arr = typeof jsonText === 'string' ? JSON.parse(jsonText) : jsonText;
    return importLogs(arr, opts);
  } catch (e) { return 0; }
}

// compatibility shim for non-module callers
if (typeof window !== 'undefined' && !window.acoustseeDebugLog) window.acoustseeDebugLog = debugLog;

export default {
  debugLog, setLogView, clearLogs, exportLogs, setPaused, setFilterText, setFilterLevel, getFilteredCount, setOnCountChange, getTotalCount
};
