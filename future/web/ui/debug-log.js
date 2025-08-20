// Centralized debug logging core: buffering, view-binding, export/clear, pause, and compatibility shim
const DEFAULT_MAX = 1000;
let maxEntries = DEFAULT_MAX;
const buffer = [];
let logView = null;
let paused = false;

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

export function debugLog(level, text) {
  const lvl = String(level || 'INFO').toUpperCase();
  const entry = { t: Date.now(), level: lvl, text: typeof text === 'string' ? text : JSON.stringify(text) };
  buffer.push(entry);
  if (buffer.length > maxEntries) buffer.shift();
  if (paused) return;
  if (!logView) return;
  const row = createRow(entry);
  logView.appendChild(row);
  while (logView.children.length > maxEntries) logView.removeChild(logView.firstChild);
  const autoscroll = document.getElementById('autoscroll-checkbox')?.checked ?? document.getElementById('debugPanelAutoscroll')?.checked ?? true;
  if (autoscroll) logView.scrollTop = logView.scrollHeight;
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

  // flush buffer
  buffer.forEach(entry => logView.appendChild(createRow(entry)));
  while (logView.children.length > maxEntries) logView.removeChild(logView.firstChild);
  const autoscroll = document.getElementById('autoscroll-checkbox')?.checked ?? document.getElementById('debugPanelAutoscroll')?.checked ?? true;
  if (autoscroll) logView.scrollTop = logView.scrollHeight;
}

export function clearLogs() { buffer.length = 0; if (logView) logView.innerHTML = ''; }
export function exportLogs() { return JSON.stringify(buffer, null, 2); }
export function setPaused(v) { paused = !!v; }

// compatibility shim for non-module callers
if (typeof window !== 'undefined' && !window.acoustseeDebugLog) window.acoustseeDebugLog = debugLog;

export default {
  debugLog, setLogView, clearLogs, exportLogs, setPaused
};
