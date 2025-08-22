// Simple console + error ingestion shim that forwards to the debugLog core.
// This module is safe to import in tests; it no-ops if window is undefined or if disabled via settings.
export default function installConsoleIngest({ debugLog, settings } = {}) {
  try {
    if (typeof window === 'undefined' || !debugLog) return () => {};
    // respect settings flag
    try { if (settings && settings.ingestEnabled === false) return () => {}; } catch (e) {}

    const methods = ['log', 'info', 'warn', 'error', 'debug'];
    const original = {};
    methods.forEach(m => {
      try {
        original[m] = console[m] ? console[m].bind(console) : () => {};
        console[m] = function(...args) {
          try {
            const text = args.map(a => {
              if (typeof a === 'string') return a;
              try { return JSON.stringify(a); } catch (e) { return String(a); }
            }).join(' ');
            const level = (m === 'log' || m === 'info') ? 'INFO' : m.toUpperCase();
            // include a short marker so these entries are identifiable as console-ingest
            debugLog(level, `[console:${m}] ${text}`);
          } catch (e) {}
          try { original[m](...args); } catch (e) {}
        };
      } catch (e) {}
    });

    // window.onerror
    function onErrorHandler(msg, url, line, col, error) {
      try {
        const details = `${msg} ${url || ''}:${line || ''}:${col || ''}`;
        debugLog('ERROR', `[window.onerror] ${details} ${error && error.stack ? '\n' + error.stack : ''}`);
      } catch (e) {}
    }
    // handle unhandledrejection
    function onRejectionHandler(ev) {
      try {
        const reason = ev && ev.reason ? (ev.reason.message || JSON.stringify(ev.reason)) : String(ev);
        debugLog('ERROR', `[unhandledrejection] ${reason}`);
      } catch (e) {}
    }

    window.addEventListener('error', function(e) {
      try { onErrorHandler(e.message, e.filename, e.lineno, e.colno, e.error); } catch (err) {}
    }, { passive: true });
    window.addEventListener('unhandledrejection', function(e) {
      try { onRejectionHandler(e); } catch (err) {}
    }, { passive: true });

    // return a dispose function to restore originals
    return function dispose() {
      try {
        methods.forEach(m => { if (original[m]) console[m] = original[m]; });
        try { window.removeEventListener('error', onErrorHandler); } catch (e) {}
        try { window.removeEventListener('unhandledrejection', onRejectionHandler); } catch (e) {}
      } catch (e) {}
    };
  } catch (e) {
    return () => {};
  }
}
