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

    // If user has saved bounds (now stored as normalized percentages), apply them and skip auto responsive layout.
    const saved = (function readSavedBounds() {
      try {
        const raw = JSON.parse(localStorage.getItem('acoustsee.debug.panel.bounds'));
        if (!raw) return null;
        // New format stores normalized fractions (0..1)
        if (typeof raw.leftPct === 'number' || typeof raw.topPct === 'number') return raw;
        // Backwards-compat: legacy px values -> convert to normalized
        return {
          leftPct: typeof raw.left === 'number' ? raw.left / (window.innerWidth || 1) : null,
          topPct: typeof raw.top === 'number' ? raw.top / (window.innerHeight || 1) : null,
          widthPct: typeof raw.width === 'number' ? raw.width / (window.innerWidth || 1) : null,
          heightPct: typeof raw.height === 'number' ? raw.height / (window.innerHeight || 1) : null
        };
      } catch (e) { return null; }
    })();

    if (saved && typeof saved === 'object') {
      try {
        const panelEl = document.getElementById('acoustsee-debug-panel') || panel;
        function pctToPx(v, dim) { return (typeof v === 'number' ? Math.round(v * dim) : null); }

        function reapplySavedBounds() {
          try {
            const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0) || 1;
            const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0) || 1;
            const left = pctToPx(saved.leftPct, vw);
            const top = pctToPx(saved.topPct, vh);
            const width = pctToPx(saved.widthPct, vw);
            const height = pctToPx(saved.heightPct, vh);
            // clamp so panel remains on-screen
            const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
            if (width !== null) {
              const w = clamp(width, 240, Math.max(240, vw - 40));
              panelEl.style.width = w + 'px';
            }
            if (height !== null) {
              const h = clamp(height, 160, Math.max(160, vh - 40));
              panelEl.style.height = h + 'px';
            }
            if (left !== null) {
              const maxLeft = vw - (panelEl.getBoundingClientRect().width || 240) - 8;
              const l = clamp(left, 8, Math.max(8, maxLeft));
              panelEl.style.left = l + 'px';
            }
            if (top !== null) {
              const maxTop = vh - (panelEl.getBoundingClientRect().height || 160) - 8;
              const t = clamp(top, 8, Math.max(8, maxTop));
              panelEl.style.top = t + 'px';
            }
            panelEl.style.position = 'fixed';
            panelEl.style.right = 'auto';
            panelEl.style.bottom = 'auto';
          } catch (e) {
            /* ignore */
          }
        }

        // apply once and reapply on resize/orientationchange
        reapplySavedBounds();
        let resizeTimer = null;
        const onResize = () => {
          try { clearTimeout(resizeTimer); } catch (e) {}
          resizeTimer = setTimeout(() => reapplySavedBounds(), 120);
        };
        window.addEventListener('resize', onResize, { passive: true });
        window.addEventListener('orientationchange', onResize, { passive: true });
      } catch (e) { /* apply responsive fallback below */ }
    } else {
      applyResponsiveLayout();
      window.addEventListener('resize', applyResponsiveLayout, { passive: true });
      window.addEventListener('orientationchange', applyResponsiveLayout, { passive: true });
      setTimeout(applyResponsiveLayout, 600);
    }
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
  // Styles are consolidated into `future/web/styles.css` under the `body.debug-mode` namespace.
  // The app should include that stylesheet; no dynamic loader necessary here.
  // If a consumer needs to load the CSS dynamically, they can add a link tag with id 'acoustsee-debug-ui-css'.

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

  // Make panel draggable/resizable and persist bounds
  (function makeDraggableResizable() {
    try {
      const panelEl = document.getElementById('acoustsee-debug-panel') || panel;
      if (!panelEl) return;

      // create drag handle
      let dragHandle = panelEl.querySelector('#debug-drag-handle');
      if (!dragHandle) {
        dragHandle = document.createElement('div');
        dragHandle.id = 'debug-drag-handle';
        dragHandle.setAttribute('title', 'Drag to move');
        dragHandle.style.position = 'absolute';
        dragHandle.style.top = '6px';
        dragHandle.style.right = '6px';
        dragHandle.style.width = '18px';
        dragHandle.style.height = '18px';
        dragHandle.style.borderRadius = '4px';
        dragHandle.style.background = 'rgba(255,255,255,0.06)';
        dragHandle.style.cursor = 'move';
        dragHandle.style.zIndex = '20';
        panelEl.appendChild(dragHandle);
      }

      // create resizer
      let resizer = panelEl.querySelector('.debug-resizer');
      if (!resizer) {
        resizer = document.createElement('div');
        resizer.className = 'debug-resizer';
        resizer.style.position = 'absolute';
        resizer.style.width = '14px';
        resizer.style.height = '14px';
        resizer.style.right = '6px';
        resizer.style.bottom = '6px';
        resizer.style.cursor = 'se-resize';
        resizer.style.zIndex = '20';
        panelEl.appendChild(resizer);
      }

      function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

      function saveBounds() {
        try {
          const r = panelEl.getBoundingClientRect();
          const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0) || 1;
          const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0) || 1;
          const bounds = {
            leftPct: +(r.left / vw).toFixed(4),
            topPct: +(r.top / vh).toFixed(4),
            widthPct: +(r.width / vw).toFixed(4),
            heightPct: +(r.height / vh).toFixed(4)
          };
          localStorage.setItem('acoustsee.debug.panel.bounds', JSON.stringify(bounds));
        } catch (e) {}
      }

      // drag handlers
      dragHandle.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        dragHandle.setPointerCapture(ev.pointerId);
        const startX = ev.clientX;
        const startY = ev.clientY;
        const rect = panelEl.getBoundingClientRect();
        const startLeft = rect.left;
        const startTop = rect.top;

        function onMove(e) {
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          const left = clamp(startLeft + dx, 0, window.innerWidth - 120);
          const top = clamp(startTop + dy, 0, window.innerHeight - 80);
          panelEl.style.left = left + 'px';
          panelEl.style.top = top + 'px';
          panelEl.style.right = 'auto';
          panelEl.style.bottom = 'auto';
          panelEl.style.position = 'fixed';
        }

        function onUp(e) {
          try { dragHandle.releasePointerCapture(ev.pointerId); } catch (e) {}
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          saveBounds();
        }

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });

      // resize handlers
      resizer.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        resizer.setPointerCapture(ev.pointerId);
        const startX = ev.clientX;
        const startY = ev.clientY;
        const rect = panelEl.getBoundingClientRect();
        const startW = rect.width;
        const startH = rect.height;

        function onMove(e) {
          const dx = e.clientX - startX;
          const dy = e.clientY - startY;
          const newW = clamp(startW + dx, 240, window.innerWidth - 40);
          const newH = clamp(startH + dy, 160, window.innerHeight - 40);
          panelEl.style.width = newW + 'px';
          panelEl.style.height = newH + 'px';
          panelEl.style.position = 'fixed';
        }

        function onUp(e) {
          try { resizer.releasePointerCapture(ev.pointerId); } catch (e) {}
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
          saveBounds();
        }

        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      });
    } catch (e) {
      // non-fatal
    }
  })();
}

export default initializeDebugUIBehavior;
