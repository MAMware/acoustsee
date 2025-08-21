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

// Use the core reporting wrapper as the default logger adapter (synchronous)
import * as reporting from './core/reporting.js';
try {
  const reportingAdapter = {
    log(level, payload) {
      try { reporting.reportInfo(payload && payload.message ? payload.message : String(payload || level), payload || {}); } catch (e) {}
    },
    logError(err) {
      try { reporting.reportError(err); } catch (e) {}
    }
  };
  setLogger(reportingAdapter);
} catch (e) {
  // best-effort: if import fails, continue without a local logger
}

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

// Global error reporting using window.onerror and window.onunhandledrejection
// These capture errors thrown after boot (including module runtime failures).
window.onerror = function (message, source, lineno, colno, error) {
  try {
    const msg = message || (error && error.message) || String(error || 'Unknown error');
    const stack = (error && error.stack) || '';
    const payload = makeEventPayload({
      level: 'error',
      message: msg,
      stack,
      filename: source || '',
      lineno: lineno || 0,
      colno: colno || 0,
      source: 'boot',
      meta: {},
    });
    debugStatus(msg + (source ? ` — ${source}:${lineno}` : ''));
    reportErrorToRemote(payload);
    console.error(error || message);
  } catch (err) {
    console.error('Error in window.onerror handler', err);
  }
  // Allow default handler to run as well
  return false;
};

window.onunhandledrejection = function (e) {
  try {
    const reason = e && (e.reason || e.detail || e) ;
    const msg = reason && reason.message ? reason.message : String(reason || 'Unhandled rejection');
    const stack = reason && reason.stack ? reason.stack : '';
    const payload = makeEventPayload({
      level: 'error',
      message: msg,
      stack,
      source: 'boot',
      meta: {},
    });
    debugStatus('UnhandledRejection: ' + msg);
    reportErrorToRemote(payload);
    console.error(reason);
  } catch (err) {
    console.error('Error in onunhandledrejection handler', err);
  }
};

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

  // Import app entry and call exported init() so boot can catch startup errors.
  import('./main.js').then(async (mod) => {
    try {
      if (mod && typeof mod.init === 'function') {
        await mod.init();
      } else if (mod && typeof mod.default === 'function') {
        // fallback to default export if present
        await mod.default();
      }
    } catch (err) {
      const msg = 'App initialization failed: ' + (err && err.message ? err.message : String(err));
      debugStatus(msg);
      reportErrorToRemote(makeEventPayload({ level: 'error', message: msg, stack: err?.stack || '' }));
      console.error(err);
    }
  }).catch(err => {
    const msg = 'Failed to load application module: ' + (err && err.message ? err.message : String(err));
    debugStatus(msg);
    reportErrorToRemote(makeEventPayload({ level: 'error', message: msg, stack: err?.stack || '' }));
    console.error(err);
  });
}

// Export for tests or plumbing

