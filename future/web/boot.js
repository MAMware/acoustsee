// boot.js - small boot module that wires debug UI, global error handlers,
// optional logging integration, feature checks, then imports the main app.

const debugPanel = document.getElementById('debugPanel');
const debugStatusEl = document.getElementById('debugStatus');
const debugStatusText = document.getElementById('debugStatusText');

let logger = null;

const setLogger = (l) => {
  logger = l;
};

const debugStatus = (msg) => {
  if (debugStatusEl && debugStatusText) {
    debugStatusEl.style.display = 'block';
    debugStatusText.textContent = msg;
  }
  if (debugPanel) {
    debugPanel.style.display = 'block';
    debugPanel.textContent = msg;
  } else {
    console.warn(msg);
  }
  try {
    if (logger && typeof logger.log === 'function') {
      logger.log('error', msg);
    }
  } catch (e) {
    console.warn('Logger call failed', e);
  }
};

// Try to load an optional logger module (non-fatal)
import('./utils/logging.js').then(mod => {
  if (mod && (mod.default || mod)) {
    setLogger(mod.default || mod);
  }
}).catch(() => {
  // ignore if logging module doesn't exist
});

const getLogEndpoint = () =>
  document.querySelector('meta[name="log-endpoint"]')?.content || window.LOG_ENDPOINT || null;

async function forwardToRemote(payload) {
  const endpoint = getLogEndpoint();
  if (!endpoint) return;
  try {
    const body = JSON.stringify(payload);
    if (navigator.sendBeacon) {
      const blob = new Blob([body], { type: 'application/json' });
      navigator.sendBeacon(endpoint, blob);
      return;
    }
    await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
      keepalive: true,
    });
  } catch (e) {
    console.warn('Boot: remote logging failed', e);
  }
}

function makeEventPayload({
  event_type = 'client_error',
  level = 'error',
  message = '',
  stack = '',
  filename = '',
  lineno = 0,
  colno = 0,
  source = 'client',
  meta = {},
  ingestion_id = null,
} = {}) {
  return {
    event_type,
    level,
    message,
    stack,
    filename,
    lineno,
    colno,
    source,
    ts: new Date().toISOString(),
    userAgent: navigator.userAgent,
    url: location.href,
    appVersion: window.APP_VERSION || null,
    env: window.APP_ENV || null,
    ingestion_id: ingestion_id || (crypto && crypto.randomUUID ? crypto.randomUUID() : null),
    payload: meta,
  };
}

function reportErrorToRemote(payload) {
  try {
    // send to local logger if present
    if (logger && typeof logger.log === 'function') {
      try { logger.log('error', payload); } catch (e) { console.warn('Boot: local logger failed', e); }
    }
  } catch (e) {
    console.warn('Boot: error reporting failed', e);
  }
  // Always attempt remote forward (best-effort)
  void forwardToRemote(payload);
}

// Global error reporting
window.addEventListener('error', (e) => {
  try {
    const message = e && e.message ? e.message : String(e.error || e);
    const filename = e.filename || '';
    const lineno = e.lineno || 0;
    const colno = e.colno || 0;
    const stack = (e.error && e.error.stack) || '';
    const payload = makeEventPayload({
      level: 'error',
      message,
      stack,
      filename,
      lineno,
      colno,
      source: 'boot',
      meta: {},
    });
    debugStatus(message + (filename ? ` — ${filename}:${lineno}` : ''));
    reportErrorToRemote(payload);
    console.error(e.error || e);
  } catch (err) {
    console.error('Error in global error handler', err);
  }
});

window.addEventListener('unhandledrejection', (e) => {
  try {
    const reason = e.reason;
    const message = reason && reason.message ? reason.message : String(reason);
    const stack = reason && reason.stack ? reason.stack : '';
    const payload = makeEventPayload({
      level: 'error',
      message,
      stack,
      source: 'boot',
      meta: {},
    });
    debugStatus('UnhandledRejection: ' + message);
    reportErrorToRemote(payload);
    console.error(reason);
  } catch (err) {
    console.error('Error in unhandledrejection handler', err);
  }
});

// Feature checks (small, non-blocking)
const checkPlatform = () => {
  const problems = [];
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) problems.push('Camera access not available.');
  if (!window.AudioContext && !window.webkitAudioContext) problems.push('Web Audio not supported.');
  return problems;
};

// Bootstrap
if (location.protocol === 'file:') {
  debugStatus('Do not open index.html directly. Serve the site over HTTP (for example: `python3 -m http.server`) and open http://localhost:8000/');
} else {
  const problems = checkPlatform();
  if (problems.length) {
    debugStatus(problems.join(' '));
    // still attempt to start app — app may handle degradation
  }
  import('./main.js').catch(err => {
    const msg = 'Failed to load application module: ' + (err && err.message ? err.message : String(err));
    debugStatus(msg);
    console.error(err);
  });
}

// Export for tests or plumbing
export { debugStatus, setLogger, checkPlatform };
