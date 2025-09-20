// File: web/ui/dev-panel/dev-panel.actions.js
// Robust createAndWireActions which wires controls and returns a dispose handle.
// R16925: we seem not to use the import 

// worker-monitor.js now lives alongside the dev-panel UI and provides worker stats
import { getWorkerStats } from './worker-monitor.js';
import { RingBuffer, makeThrottledRenderer, scaleCanvasForDPR, drawMultiSparkline } from './worker-charts.js';

export function createAndWireActions(panel, engine, DOM, skipDiagnostics) {
  const actionsContainer = panel.querySelector('.devpanel-actions-grid');
  if (!actionsContainer) {
    console.error('createAndWireActions: Could not find .devpanel-actions-grid container in the provided panel.');
    return { dispose() {} };
  }

  const attachedHandlers = [];
  const createdNodes = [];
  let explorerInterval = null;
  // Cache worker explorer DOM nodes
  const workerExplorerContainer = panel.querySelector('#worker-explorer-container');
  const workerExplorerCanvas = panel.querySelector('#worker-explorer-canvas');
  const workerExplorerLegend = panel.querySelector('#worker-explorer-legend');
  let isExplorerVisible = false;

  const delegatedClick = (ev) => {
    const btn = ev.target.closest && ev.target.closest('button[data-action]');
    if (!btn || !actionsContainer.contains(btn)) return;
    const action = btn.getAttribute('data-action');
    switch (action) {
      case 'toggleProcessing':
        engine.dispatch && engine.dispatch('toggleProcessing', { videoEl: DOM.videoFeed, canvasEl: DOM.frameCanvas });
        break;
      case 'setMode':
        try {
          const mode = btn.getAttribute('data-mode');
          engine.dispatch && engine.dispatch('setMode', { mode });
        } catch (e) { console.warn('setMode dispatch failed', e); }
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
        try {
          isExplorerVisible = !isExplorerVisible;
          if (workerExplorerContainer) {
            workerExplorerContainer.style.display = isExplorerVisible ? 'block' : 'none';
          }

          if (isExplorerVisible && workerExplorerCanvas) {
            // Start the monitoring interval
            if (explorerInterval) clearInterval(explorerInterval);

            const workerDataBuffers = new Map(); // Map<workerId, RingBuffer>
            scaleCanvasForDPR(workerExplorerCanvas);

            const renderCharts = makeThrottledRenderer(() => {
              const stats = getWorkerStats();
              const seriesMap = new Map();
              let legendHTML = '';

              stats.forEach((workerStat, i) => {
                if (!workerDataBuffers.has(workerStat.id)) {
                  workerDataBuffers.set(workerStat.id, new RingBuffer(64));
                }
                const buffer = workerDataBuffers.get(workerStat.id);
                buffer.push(workerStat.last ? workerStat.last.util : 0);
                seriesMap.set(workerStat.id, buffer.toArray());

                const color = `hsl(${(i * 137) % 360}, 72%, 58%)`;
                legendHTML += `<span style="color: ${color}; margin-right: 10px;">■ ${workerStat.name || workerStat.id}</span>`;
              });

              if (workerExplorerLegend) workerExplorerLegend.innerHTML = legendHTML;
              drawMultiSparkline(workerExplorerCanvas, seriesMap);
            }, 10); // Render at 10 FPS

            explorerInterval = setInterval(renderCharts, 100); // Poll for stats every 100ms
          } else {
            // Stop the monitoring interval
            if (explorerInterval) {
              clearInterval(explorerInterval);
              explorerInterval = null;
            }
          }
        } catch (e) { /* ignore */ }
        break;
      default:
        break;
    }
  };
  actionsContainer.addEventListener('click', delegatedClick);
  attachedHandlers.push({ el: actionsContainer, type: 'click', fn: delegatedClick });

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

  // Update mode button active state on engine state changes
  try {
    engine.onStateChange && engine.onStateChange(state => {
      try {
        const flowBtn = panel.querySelector('button[data-action="setMode"][data-mode="flow"]');
        const focusBtn = panel.querySelector('button[data-action="setMode"][data-mode="focus"]');
        if (flowBtn && focusBtn) {
          if (state && state.currentMode === 'focus') {
            flowBtn.classList.remove('active'); focusBtn.classList.add('active');
          } else {
            focusBtn.classList.remove('active'); flowBtn.classList.add('active');
          }
        }
      } catch (e) { /* ignore */ }
    });
  } catch (e) { /* ignore */ }

  // Video preview and worker explorer wiring omitted for brevity (copied behavior exists in original file)

  function dispose() {
    try {
      attachedHandlers.forEach(h => { try { h.el.removeEventListener(h.type, h.fn); } catch (_) {} });
      attachedHandlers.length = 0;
      if (explorerInterval) { clearInterval(explorerInterval); explorerInterval = null; }
      createdNodes.forEach(n => { try { n.remove(); } catch (_) {} });
      createdNodes.length = 0;
    } catch (e) {
      console.error('createAndWireActions.dispose error', e);
    }
  }

  return { dispose };
}
