import { structuredLog } from '../../utils/logging.js';

export function initializePreview(panel, DOM, engine) {
  try {
    const pickProcessingCanvas = () =>
      (DOM && (DOM.frameCanvas || DOM.videoCanvas)) ||
      document.querySelector('canvas#frameCanvas, canvas#frame-canvas, canvas[data-role="frame-canvas"]');

    const previewCanvas = panel.querySelector('#devpanel-preview-canvas');
    const previewToggle = panel.querySelector('#devpanel-preview-toggle');

    if (!previewCanvas || !previewToggle) {
      return { dispose: () => {} };
    }

    let previewInterval = null;
    let previewRO = null;
    const previewCtx = previewCanvas.getContext('2d', { alpha: false });
    
    // Store context on panel for potential external debugging access
    panel.__previewCtx = previewCtx;
    previewCanvas.style.display = 'none';

    let activeSource = null;
    let loggedMissingSource = false;
    const MAX_WIDTH = 360;
    const MAX_HEIGHT = 270;

    const getSourceDimensions = (src) => {
      if (!src) return { width: 0, height: 0 };
      const width = src.videoWidth || src.width || src.clientWidth || 0;
      const height = src.videoHeight || src.height || src.clientHeight || 0;
      return { width, height };
    };

    const resizePreview = (src) => {
      try {
        if (!src || !previewCanvas) return;
        const { width: sw, height: sh } = getSourceDimensions(src);
        if (!sw || !sh) return;
        const parent = previewCanvas.parentElement;
        const widthLimit = Math.max(1, Math.min(MAX_WIDTH, parent?.clientWidth || MAX_WIDTH));
        const heightLimitSource = parent?.clientHeight || MAX_HEIGHT;
        const heightLimit = Math.max(1, Math.min(MAX_HEIGHT, heightLimitSource || MAX_HEIGHT));
        const ratio = Math.min(widthLimit / sw, heightLimit / sh, 1);
        const w = Math.max(1, Math.round(sw * ratio));
        const h = Math.max(1, Math.round(sh * ratio));
        
        // Only resize if dimensions actually changed to avoid layout thrashing
        if (previewCanvas.width !== w || previewCanvas.height !== h) {
          previewCanvas.width = w;
          previewCanvas.height = h;
          previewCanvas.style.width = `${w}px`;
          previewCanvas.style.height = `${h}px`;
        }
      } catch (_) {}
    };

    const detachSource = () => {
      if (previewRO) {
        try { previewRO.disconnect(); } catch (_) {}
      }
      previewRO = null;
      activeSource = null;
    };

    const resolvePreviewSource = () => {
      // R221125vp: Prioritize processing canvas (the "truth") over raw video feed
      // This avoids showing raw camera feed when we want to see what the engine sees
      const processingCanvas = pickProcessingCanvas();
      if (processingCanvas) {
        const { width, height } = getSourceDimensions(processingCanvas);
        if (width > 0 && height > 0) return processingCanvas;
      }

      // Fallback to video feed only if canvas is not available
      const candidates = [];
      if (DOM?.videoFeed) candidates.push(DOM.videoFeed);
      const docVideoFeed = document.querySelector('video#videoFeed');
      if (docVideoFeed && docVideoFeed !== DOM?.videoFeed) candidates.push(docVideoFeed);

      for (const candidate of candidates) {
        const { width, height } = getSourceDimensions(candidate);
        const ready = typeof candidate.readyState === 'number' ? candidate.readyState >= 2 : true;
        if (ready && width > 0 && height > 0) {
          return candidate;
        }
      }
      return null;
    };

    const ensureSource = () => {
      const src = resolvePreviewSource();
      if (!src) {
        if (!loggedMissingSource) {
          structuredLog('DEBUG', 'dev-panel', { message: 'Preview source not ready yet' });
          loggedMissingSource = true;
        }
        return null;
      }

      loggedMissingSource = false;

      if (src !== activeSource) {
        detachSource();
        activeSource = src;
        resizePreview(src);
        try {
          previewRO = new ResizeObserver(() => resizePreview(src));
          previewRO.observe(src);
        } catch (_) {}
      }
      return src;
    };

    const drawFrame = () => {
      const src = ensureSource();
      if (!src || !previewCtx) return;
      const { width, height } = getSourceDimensions(src);
      if (!width || !height) return;
      if (previewCanvas.width === 0 || previewCanvas.height === 0) {
        resizePreview(src);
      }
      try {
        // OPTIMIZATION: Removed redundant clearRect. drawImage covers the entire canvas with opaque video frame.
        // This saves one paint operation per preview frame.
        previewCtx.drawImage(src, 0, 0, previewCanvas.width, previewCanvas.height);
      } catch (_) {}
    };

    let rafId = null;
    let lastFrameTime = 0;
    const frameIntervalMs = Math.max(1000 / 4, 200); // Default 4 FPS with 200ms minimum

    const drawFrameRAF = (timestamp) => {
      if (!previewInterval) return; // Stop if stopPreview() was called
      
      // Throttle frame draws to configured FPS
      if (timestamp - lastFrameTime >= frameIntervalMs) {
        lastFrameTime = timestamp;
        drawFrame();
      }
      
      // Schedule next frame (syncs with screen refresh)
      rafId = requestAnimationFrame(drawFrameRAF);
    };

    const startPreview = (fps = 4) => {
      if (previewInterval) return;
      previewCanvas.style.display = 'block';
      ensureSource();
      // RAF-based loop syncs with screen refresh, reducing battery/CPU waste
      previewInterval = true; // Flag to indicate preview is active
      lastFrameTime = 0;
      rafId = requestAnimationFrame(drawFrameRAF);
    };

    const stopPreview = () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
      previewInterval = null;
      detachSource();
      loggedMissingSource = false;
      if (previewCanvas && previewCtx) {
        previewCtx.clearRect(0, 0, previewCanvas.width || 0, previewCanvas.height || 0);
      }
      if (previewCanvas) {
        previewCanvas.style.display = 'none';
      }
    };

    // Attach API to panel for layout logic (collapsible sections use this)
    panel.__startPreview = startPreview;
    panel.__stopPreview = stopPreview;

    const handleVideoReady = () => {
      if (!DOM?.videoFeed) return;
      if (previewToggle.checked) {
        resizePreview(DOM.videoFeed);
        if (!previewInterval) startPreview(4);
      }
    };

    const detachEvents = () => {
       if (DOM?.videoFeed) {
          try { DOM.videoFeed.removeEventListener('loadedmetadata', handleVideoReady); } catch (_) {}
          try { DOM.videoFeed.removeEventListener('playing', handleVideoReady); } catch (_) {}
       }
       // Clean up legacy attachment point if it exists
       panel.__detachPreviewVideoEvents = null;
    };

    if (DOM?.videoFeed) {
      try {
        DOM.videoFeed.addEventListener('loadedmetadata', handleVideoReady, { passive: true });
        DOM.videoFeed.addEventListener('playing', handleVideoReady, { passive: true });
      } catch (_) {}
    }

    const toggleHandler = (e) => {
      if (e.target.checked) startPreview(4);
      else stopPreview();
    };
    previewToggle.addEventListener('change', toggleHandler, { passive: true });

    // Initial check
    setTimeout(() => {
      if (previewToggle.checked) startPreview(4);
    }, 600);

    let unsubscribeState = null;
    if (engine.onStateChange) {
      unsubscribeState = engine.onStateChange((state) => {
        if (!state) return;
        if (state.isProcessing && previewToggle.checked && !previewInterval) {
          startPreview(4);
        }
      });
    }

    return {
      dispose() {
        stopPreview();
        detachEvents();
        previewToggle.removeEventListener('change', toggleHandler);
        if (unsubscribeState) unsubscribeState();
        panel.__startPreview = null;
        panel.__stopPreview = null;
        panel.__previewCtx = null;
        panel.__previewRO = null; // ensure reference cleared
      }
    };

  } catch (e) {
    structuredLog('ERROR', 'Failed to initialize preview', { error: e.message });
    return { dispose: () => {} };
  }
}