// Behavior and layout helpers for the debug UI (responsive layout, video z-index,
// and stylesheet loader). Kept separate to reduce `debug-ui.js` size.
export function initializeDebugUIBehavior({ panel, DOM, settings, engine } = {}) {
  // Responsive layout: landscape => panel right and video left; portrait => bottom sheet
  (function responsivePanelLayout() {
    const candidates = ['#video-container','#video-preview','.video-preview','#preview','video','#frameCanvas','canvas'];

    function findVideoElement() {
      for (const sel of candidates) {
        try {
          const el = document.querySelector(sel);
          if (!el || !document.body.contains(el)) continue;
          // skip any element that is inside the debug panel itself
          if (el.closest && el.closest('#acoustsee-debug-panel')) continue;
          return el;
        } catch (e) { /* ignore selector errors */ }
      }
      // fallback: any visible video or canvas not inside the debug panel
      const vid = Array.from(document.querySelectorAll('video, canvas')).find(v => v && document.body.contains(v) && !(v.closest && v.closest('#acoustsee-debug-panel')));
      return vid || null;
    }

    function applyLandscape(el, panelEl) {
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const preferred = panelEl.getBoundingClientRect().width || 400;
      const calcWidth = Math.min(preferred, Math.max(280, Math.round(vw * 0.36)));
      panelEl.style.position = 'fixed';
      panelEl.style.right = '0';
      panelEl.style.left = 'auto';
      panelEl.style.top = '0';
      panelEl.style.bottom = 'auto';
      panelEl.style.width = calcWidth + 'px';
      panelEl.style.height = '100vh';
      panelEl.style.borderLeft = '2px solid #34495e';
      panelEl.style.borderTop = '';
      if (el) {
        const container = el.parentElement || el;
        container.style.boxSizing = 'border-box';
        container.style.marginRight = (calcWidth + 12) + 'px';
        container.style.marginBottom = '';
      }
    }

    function applyPortrait(el, panelEl) {
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      const sheetHeight = Math.max(220, Math.round(vh * 0.42));
      panelEl.style.position = 'fixed';
      panelEl.style.left = '8px';
      panelEl.style.right = '8px';
      panelEl.style.top = 'auto';
      panelEl.style.bottom = '8px';
      panelEl.style.width = `calc(100% - 16px)`;
      panelEl.style.height = sheetHeight + 'px';
      panelEl.style.borderLeft = 'none';
      panelEl.style.borderTop = '2px solid #34495e';
      panelEl.style.borderRadius = '8px';
      if (el) {
        const container = el.parentElement || el;
        container.style.boxSizing = 'border-box';
        container.style.marginBottom = (sheetHeight + 12) + 'px';
        container.style.marginRight = '';
      }
    }

    function applyResponsiveLayout() {
      try {
        const panelEl = document.getElementById('acoustsee-debug-panel') || panel;
        if (!panelEl) return;
        const el = findVideoElement();
        const isLandscape = window.innerWidth > window.innerHeight;
        if (isLandscape) {
          applyLandscape(el, panelEl);
        } else {
          applyPortrait(el, panelEl);
        }
      } catch (e) { /* fail silently */ }
    }

    applyResponsiveLayout();
    window.addEventListener('resize', applyResponsiveLayout, { passive: true });
    window.addEventListener('orientationchange', applyResponsiveLayout, { passive: true });
    setTimeout(applyResponsiveLayout, 600);
  })();

  // Try to locate the video preview element and ensure it is above the debug panel.
  (function ensureVideoOnTop() {
    try {
      const tried = new Set();
      const candidates = [
        () => DOM?.videoFeed,
        () => document.getElementById('video-preview'),
        () => document.getElementById('preview'),
        () => document.querySelector('.video-preview'),
        () => document.querySelector('video#preview'),
        () => document.querySelector('#videoFeed'),
        () => document.querySelector('video'),
        () => document.querySelector('#frameCanvas'),
        () => document.querySelector('canvas')
      ];

      for (const getter of candidates) {
        let el;
        try { el = getter(); } catch (e) { el = null; }
        if (!el || tried.has(el)) continue;
        tried.add(el);
        // ensure element is in document and visible
        if (!document.body.contains(el)) continue;
        // skip elements that were inserted into the debug panel itself
        if (el.closest && el.closest('#acoustsee-debug-panel')) continue;
        const style = window.getComputedStyle(el);
        // ignore if invisible
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) continue;
        // parse current z-index
        const z = parseInt(style.zIndex, 10);
        if (isNaN(z) || z <= 5) {
          // elevate element safely
          if (!el.style.position) el.style.position = style.position === 'static' ? 'relative' : style.position || 'relative';
          el.style.zIndex = '50';
        }
        // done with first visible candidate
        return;
      }
    } catch (e) {
      // don't block UI on errors
    }
  })();

  // Load debug UI stylesheet (extracted to keep JS small and separate concerns)
  (function ensureDebugCss() {
    try {
      if (document.getElementById('acoustsee-debug-ui-css')) return;
      const candidates = [
        './ui/debug-ui.css',
        'ui/debug-ui.css',
        '/ui/debug-ui.css',
        '/future/web/ui/debug-ui.css',
        'future/web/ui/debug-ui.css'
      ];
      for (const href of candidates) {
        const link = document.createElement('link');
        link.id = 'acoustsee-debug-ui-css';
        link.rel = 'stylesheet';
        link.href = href;
        // when a candidate fails to load, remove it so the next can try
        link.onerror = () => { try { if (link.parentNode) link.parentNode.removeChild(link); } catch (e) {} };
        document.head.appendChild(link);
      }
      // force a layout recalculation shortly after insertion so sizes adjust
      setTimeout(() => { try { window.dispatchEvent(new Event('resize')); } catch (e) {} }, 250);
    } catch (e) {
      // silent
    }
  })();

  // show version badge (meta tag -> global constant -> fallback)
  (function setVersionBadge() {
    try {
      const meta = document.querySelector('meta[name="acoustsee-version"]')?.getAttribute('content');
      const ver = meta || window.ACOUSTSEE_VERSION || window.ACOUSTSEE_APP_VERSION || null;
      const badge = document.getElementById('audio-version-badge');
      if (badge) {
        badge.textContent = ver || 'unknown';
        badge.style.background = '#111';
        badge.style.color = '#9ad';
        badge.style.border = '1px solid rgba(255,255,255,0.04)';
      }
    } catch (e) {}
  })();

  // Poll for engine context and set the small inline context badge (don't overwrite state inspector)
  (function waitForContextBadge() {
    const ctxBadge = document.getElementById('audio-context-badge');
    if (!ctxBadge) return;
    const setBadge = (txt, color) => {
      ctxBadge.textContent = txt;
      ctxBadge.style.color = color || '';
    };

    const getContext = () => {
      try {
        // Prefer injected engine instance when available (deterministic and testable)
        if (engine) {
          if (engine.context) return engine.context;
          if (typeof engine.getContext === 'function') return engine.getContext();
          if (typeof engine.get === 'function') return engine.get('context');
          return engine;
        }
        if (typeof window !== 'undefined' && typeof window.engine !== 'undefined') {
          const we = window.engine;
          if (we.context) return we.context;
          if (typeof we.getContext === 'function') return we.getContext();
          if (typeof we.get === 'function') return we.get('context');
          return we;
        }
      } catch (e) { /* ignore */ }
      return null;
    };

    // initial
    setBadge('Loading...', '#9ad');

    const start = Date.now();
    const timeoutMs = 7000;
    const iv = setInterval(() => {
      const ctx = getContext();
      if (ctx) {
        clearInterval(iv);
        try {
          const stateText = typeof ctx === 'object' ? (ctx.state || ctx.status || 'ready') : String(ctx);
          setBadge(String(stateText), '#2ecc71');
        } catch (e) {
          setBadge('Context', '#2ecc71');
        }
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        setBadge('No context (not initialized)', '#c46');
      }
    }, 250);
  })();
}

export default initializeDebugUIBehavior;
