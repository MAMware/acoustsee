// File: web/ui/debug/debug-ui.actions.js

import { createButton } from './debug-ui.controls.js';
import { getWorkerStats } from '../../debug/worker-monitor.js';
import { RingBuffer, makeThrottledRenderer, scaleCanvasForDPR, drawMultiSparkline } from './worker-charts.js';

// The function signature is now updated to accept the `panel` element.
export function createAndWireActions(panel, engine, DOM, skipDiagnostics) {
  const actionsContainer = panel.querySelector('.debug-actions-grid');
  if (!actionsContainer) {
    console.error('createAndWireActions: Could not find .debug-actions-grid container in the provided panel.');
    return { dispose() {} };
  }

  // Keep references so we can clean up on dispose
  const attachedHandlers = [];
  const createdNodes = [];
  let explorerInterval = null;

  // Delegated click handler for data-action buttons (uses existing buttons in the panel)
  const delegatedClick = (ev) => {
    const btn = ev.target.closest && ev.target.closest('button[data-action]');
    if (!btn || !actionsContainer.contains(btn)) return;
    const action = btn.getAttribute('data-action');
    switch (action) {
      case 'toggleProcessing':
        engine.dispatch && engine.dispatch('toggleProcessing', { videoEl: DOM.videoFeed, canvasEl: DOM.frameCanvas });
        break;
      case 'playTestNote':
        engine.dispatch && engine.dispatch('playTestNote', { pitch: 440 });
        break;
      case 'resumeAudio':
        engine.dispatch && engine.dispatch('resumeAudio');
        break;
      case 'saveSettings':
        engine.dispatch && engine.dispatch('saveSettings');
        break;
      case 'loadSettings':
        engine.dispatch && engine.dispatch('loadSettings');
        break;
      case 'toggleWorkerExplorer':
        // Handled by explicit listener below if present; keep as fallback
        toggleExplorer();
        break;
      default:
        break;
    }
  };
  actionsContainer.addEventListener('click', delegatedClick);
  attachedHandlers.push({ el: actionsContainer, type: 'click', fn: delegatedClick });

  // Wire simple controls (guard selectors)
  try {
    const gridTypeEl = panel.querySelector('#grid-type-select');
    if (gridTypeEl && engine && engine.dispatch && Array.isArray(window?.settings?.availableGrids)) {
      window.settings.availableGrids.forEach(g => { const opt = document.createElement('option'); opt.value = g.id; opt.textContent = g.id; gridTypeEl.appendChild(opt); });
      const gridChange = (e) => engine.dispatch('setGridType', { gridType: e.target.value });
      gridTypeEl.addEventListener('change', gridChange);
      attachedHandlers.push({ el: gridTypeEl, type: 'change', fn: gridChange });
    }

    const synthEngineEl = panel.querySelector('#synth-engine-select');
    if (synthEngineEl && engine && engine.dispatch && Array.isArray(window?.settings?.availableEngines)) {
      window.settings.availableEngines.forEach(en => { const opt = document.createElement('option'); opt.value = en.id; opt.textContent = en.id; synthEngineEl.appendChild(opt); });
      const synthChange = (e) => engine.dispatch('setSynthEngine', { synthEngine: e.target.value });
      synthEngineEl.addEventListener('change', synthChange);
      attachedHandlers.push({ el: synthEngineEl, type: 'change', fn: synthChange });
    }

    const maxNotesEl = panel.querySelector('#max-notes-slider');
    const maxNotesValueEl = panel.querySelector('#max-notes-value');
    if (maxNotesEl) {
      const onMaxNotes = (e) => { engine.dispatch && engine.dispatch('setMaxNotes', { maxNotes: e.target.value }); if (maxNotesValueEl) maxNotesValueEl.textContent = e.target.value; };
      maxNotesEl.addEventListener('input', onMaxNotes);
      attachedHandlers.push({ el: maxNotesEl, type: 'input', fn: onMaxNotes });
    }

    const motionEl = panel.querySelector('#motion-threshold-slider');
    const motionValueEl = panel.querySelector('#motion-threshold-value');
    if (motionEl) {
      const onMotion = (e) => { engine.dispatch && engine.dispatch('setMotionThreshold', { motionThreshold: e.target.value }); if (motionValueEl) motionValueEl.textContent = e.target.value; };
      motionEl.addEventListener('input', onMotion);
      attachedHandlers.push({ el: motionEl, type: 'input', fn: onMotion });
    }

    const autoFps = panel.querySelector('#auto-fps-checkbox');
    if (autoFps) {
      const onAutoFps = (e) => engine.dispatch && engine.dispatch('setAutoFPS', { enabled: e.target.checked });
      autoFps.addEventListener('change', onAutoFps);
      attachedHandlers.push({ el: autoFps, type: 'change', fn: onAutoFps });
    }

    const enableFrameWorker = panel.querySelector('#enable-frame-worker-checkbox');
    if (enableFrameWorker) {
      const onFW = (e) => { if (typeof window.enableFrameWorker === 'function') window.enableFrameWorker(e.target.checked); else engine.dispatch && engine.dispatch('setFrameWorkerEnabled', { enabled: e.target.checked }); };
      enableFrameWorker.addEventListener('change', onFW);
      attachedHandlers.push({ el: enableFrameWorker, type: 'change', fn: onFW });
    }
  } catch (e) {
    console.error('createAndWireActions: error wiring controls', e);
  }

  // Video preview (append if a video preview is not already present)
  let createdPreview = null;
  try {
    const existingPreview = actionsContainer.querySelector('.debug-video-preview');
    if (!existingPreview) {
      const vp = document.createElement('div');
      vp.className = 'debug-video-preview';
      vp.style.cssText = 'border:1px solid #333;padding:8px;margin-top:10px;background:#0b0b0b;border-radius:6px;';
      vp.innerHTML = `<div style="font-size:13px;font-weight:600;margin-bottom:6px;">Video Preview</div>`;
      const videoWrap = document.createElement('div');
      videoWrap.style.position = 'relative'; videoWrap.style.height = '140px'; videoWrap.style.background = '#000';
      const preview = document.createElement('video');
      preview.autoplay = true; preview.muted = true; preview.playsInline = true;
      preview.style.cssText = 'width:100%;height:100%;object-fit:contain;';
      if (DOM && DOM.videoFeed && DOM.videoFeed.srcObject) preview.srcObject = DOM.videoFeed.srcObject;
      videoWrap.appendChild(preview);
      vp.appendChild(videoWrap);
      actionsContainer.appendChild(vp);
      createdNodes.push(vp);
      createdPreview = vp;
    }
  } catch (e) {
    console.error('createAndWireActions: error creating video preview', e);
  }

  // Worker explorer panel and toggler
  let createdExplorer = false;
  const explorerPanel = panel.querySelector('#worker-explorer-panel') || (function createExplorer() {
    const el = document.createElement('div');
    el.id = 'worker-explorer-panel';
    el.style.display = 'none';
    el.style.marginTop = '10px';
    actionsContainer.appendChild(el);
    createdNodes.push(el);
    createdExplorer = true;
    return el;
  })();

  // build canvas area inside explorer if empty
  let multiCanvas;
  try {
    const multiWrapper = document.createElement('div');
    multiWrapper.style.cssText = 'padding:8px;border:1px solid #333;background:#070707;border-radius:6px;';
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;font-size:12px;';
    multiCanvas = document.createElement('canvas');
    scaleCanvasForDPR(multiCanvas, 360, 96);
    multiWrapper.appendChild(legend);
    multiWrapper.appendChild(multiCanvas);
    explorerPanel.appendChild(multiWrapper);
    createdNodes.push(multiWrapper);

    const historyMap = new Map();
    const MAX_SAMPLES = 60;

    function ensureSeries(id, name) {
      if (!historyMap.has(id)) {
        historyMap.set(id, { ring: new RingBuffer(MAX_SAMPLES), name: name || id });
        const item = document.createElement('div');
        const color = `hsl(${(historyMap.size * 137) % 360}, 72%, 58%)`;
        item.innerHTML = `<span style="width:10px;height:10px;background:${color};display:inline-block;margin-right:4px;"></span>${name}`;
        legend.appendChild(item);
      }
      return historyMap.get(id);
    }

    function renderAll() {
      const seriesMap = new Map();
      historyMap.forEach((v, k) => seriesMap.set(k, v.ring.toArray()));
      drawMultiSparkline(multiCanvas, seriesMap, {});
    }
    const requestRender = makeThrottledRenderer(renderAll, 2);

    function syncFromRegistry() {
      try {
        const stats = getWorkerStats();
        if (!stats) return;
        stats.forEach(s => {
          const entry = ensureSeries(s.id, s.name);
          if (s.last) entry.ring.push(s.last.util ?? 0);
        });
        requestRender();
      } catch (e) { /* non-fatal */ }
    }

    // Expose sync function on panel for debugging if needed
    explorerPanel.__syncFromRegistry = syncFromRegistry;

    // local helper to toggle
    function showExplorer() {
      explorerPanel.style.display = 'block';
      syncFromRegistry();
      explorerInterval = setInterval(syncFromRegistry, 500);
    }
    function hideExplorer() {
      explorerPanel.style.display = 'none';
      if (explorerInterval) { clearInterval(explorerInterval); explorerInterval = null; }
    }

    // explicit button reference: find or create the button with data-action toggleWorkerExplorer
    let workerExplorerBtn = panel.querySelector('button[data-action="toggleWorkerExplorer"]');
    let createdBtn = false;
    if (!workerExplorerBtn) {
      // create a minimal control-group wrapper like the other controls
      const wrapper = document.createElement('div');
      wrapper.className = 'control-group';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('data-action', 'toggleWorkerExplorer');
      btn.textContent = 'Worker Explorer';
      wrapper.appendChild(btn);
      actionsContainer.appendChild(wrapper);
      workerExplorerBtn = btn;
      createdBtn = true;
      createdNodes.push(wrapper);
    }

    const explorerClick = (ev) => {
      try {
        if (explorerPanel.style.display === 'none') {
          showExplorer();
        } else {
          hideExplorer();
        }
      } catch (e) {}
    };
    workerExplorerBtn.addEventListener('click', explorerClick);
    attachedHandlers.push({ el: workerExplorerBtn, type: 'click', fn: explorerClick });

  } catch (e) {
    console.error('createAndWireActions: worker explorer setup failed', e);
  }

  // Provide a dispose method to clean up handlers, intervals and nodes we created
  function dispose() {
    try {
      attachedHandlers.forEach(h => {
        try { h.el.removeEventListener(h.type, h.fn); } catch (_) {}
      });
      attachedHandlers.length = 0;
      if (explorerInterval) { clearInterval(explorerInterval); explorerInterval = null; }
      // remove nodes we created (but don't remove nodes that were part of original HTML unless we created them)
      createdNodes.forEach(n => { try { n.remove(); } catch (_) {} });
      createdNodes.length = 0;
    } catch (e) {
      console.error('createAndWireActions.dispose error', e);
    }
  }

  return { dispose };
}