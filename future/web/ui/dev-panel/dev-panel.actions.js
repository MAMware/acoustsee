// File: web/ui/dev-panel/dev-panel.actions.js
// Robust createAndWireActions which wires controls and returns a dispose handle.
// R16925: we seem not to use the import 

// worker-monitor.js now lives alongside the dev-panel UI and provides worker stats
import { getWorkerStats } from './worker-monitor.js';
import { RingBuffer, makeThrottledRenderer, scaleCanvasForDPR, drawMultiSparkline } from './worker-charts.js';
import { structuredLog } from '../../utils/logging.js';

export function createAndWireActions(panel, engine, DOM, skipDiagnostics) {
  const actionsContainer = panel.querySelector('.devpanel-actions-grid');
  const ingestActions = panel.querySelector('.ingest-actions');
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
    if (!btn) return;
    // Check if button is in either actionsContainer or ingestActions
    const isInActions = actionsContainer.contains(btn) || (ingestActions && ingestActions.contains(btn));
    if (!isInActions) return;
    
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
      case 'resetThrottling':
        engine.dispatch && engine.dispatch('setFrameProviderThrottle', { skipRate: 1, scale: 1.0 });
        // Update UI to reflect reset values
        const skipSlider = panel.querySelector('#frame-skip-slider');
        const scaleSlider = panel.querySelector('#resolution-scale-slider');
        const skipValue = panel.querySelector('#frame-skip-value');
        const scaleValue = panel.querySelector('#resolution-scale-value');
        if (skipSlider) { skipSlider.value = '1'; if (skipValue) skipValue.textContent = '1'; }
        if (scaleSlider) { scaleSlider.value = '1.0'; if (scaleValue) scaleValue.textContent = '1.0'; }
        break;
      case 'applyThrottling':
        const skipRate = panel.querySelector('#frame-skip-slider')?.value || 1;
        const scale = panel.querySelector('#resolution-scale-slider')?.value || 1.0;
        engine.dispatch && engine.dispatch('setFrameProviderThrottle', { skipRate: parseInt(skipRate), scale: parseFloat(scale) });
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
      case 'updateIngestSettings':
        try {
          console.log('=== UPDATE INGEST SETTINGS BUTTON CLICKED ===');
          
          const ingestEnabled = panel.querySelector('#ingest-enabled-checkbox')?.checked;
          const batteryOptimization = panel.querySelector('#battery-optimization-checkbox')?.checked;
          const maxEventsPerSecond = parseInt(panel.querySelector('#ingest-rate-select')?.value || '10');
          const categoryFilter = Array.from(panel.querySelectorAll('.category-toggle input[type="checkbox"]:checked'))
            .map(checkbox => checkbox.dataset.category);

          structuredLog('DEBUG', 'Ingest settings READ from UI', {
            ingestEnabled,
            batteryOptimization,
            maxEventsPerSecond,
            categoryFilter,
            categoryCount: categoryFilter.length
          });

          // Declare newCategories in outer scope so it's accessible in the import callback
          let newCategories = {};

          // Get current state for category filtering
          const state = engine.getState && engine.getState();
          if (state) {
            // Update category filter - enable only selected categories
            const allCategories = state.ingestCategories || {};
            newCategories = {}; // Reset before populating
            for (const [category, commands] of Object.entries(allCategories)) {
              if (categoryFilter.includes(category)) {
                newCategories[category] = commands;
              }
            }
            
            structuredLog('DEBUG', 'Dispatching ingest settings updates', {
              ingestEnabled,
              useIdleCallback: batteryOptimization,
              maxEventsPerSecond,
              categoryCount: Object.keys(newCategories).length
            });

            // Use command pattern instead of direct state manipulation
            engine.dispatch('setIngestEnabled', { enabled: ingestEnabled });
            engine.dispatch('setIngestPreferences', { 
              preferences: {
                useIdleCallback: batteryOptimization,
                maxEventsPerSecond
              }
            });
            engine.dispatch('setIngestCategories', { categories: newCategories });
          }

          // Import and call the ingest API
          import('../../utils/ingest.js').then(ingestModule => {
            if (ingestModule.updateOptimizationSettings) {
              ingestModule.updateOptimizationSettings(engine, {
                useIdleCallback: batteryOptimization,
                maxEventsPerSecond
              });
            }
            if (ingestModule.updateIngestCategories) {
              ingestModule.updateIngestCategories(engine, newCategories);
            }
          }).catch(e => {
            structuredLog('ERROR', 'Failed to import ingest module', { error: e.message });
          });

          console.log('Ingest settings updated:', { ingestEnabled, batteryOptimization, maxEventsPerSecond, categoryFilter });
        } catch (e) { 
          console.warn('updateIngestSettings failed', e); 
        }
        break;
      case 'exportIngestLogs':
        try {
          console.log('=== EXPORT ANALYTICS BUTTON CLICKED ===');
          structuredLog('DEBUG', 'Attempting to export analytics logs');
          
          // Export all ingest logs
          import('../../utils/idb-logger.js').then(idbModule => {
            structuredLog('DEBUG', 'idb-logger module loaded', { 
              hasGetAllIdbLogs: typeof idbModule.getAllIdbLogs === 'function'
            });
            
            if (idbModule.getAllIdbLogs) {
              idbModule.getAllIdbLogs().then(logs => {
                const blob = new Blob([JSON.stringify(logs, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `acoustsee-analytics-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
                structuredLog('INFO', 'Analytics exported', { count: logs.length });
              }).catch(e => {
                structuredLog('ERROR', 'Failed to get logs for export', { error: e.message });
              });
            }
          }).catch(e => {
            structuredLog('ERROR', 'Failed to import idb-logger for export', { error: e.message });
          });
        } catch (e) {
          structuredLog('ERROR', 'exportIngestLogs failed', { error: e.message });
        }
        break;
      default:
        break;
    }
  };
  actionsContainer.addEventListener('click', delegatedClick);
  attachedHandlers.push({ el: actionsContainer, type: 'click', fn: delegatedClick });
  
  // Also attach to ingestActions for Export Analytics button
  if (ingestActions) {
    ingestActions.addEventListener('click', delegatedClick);
    attachedHandlers.push({ el: ingestActions, type: 'click', fn: delegatedClick });
  }

  // NOTE: Grid Type, Synth Engine, Max Notes, Motion Threshold listeners
  // are now registered ONLY in dev-panel.js to avoid duplicate event firing.
  // This module (dev-panel.actions.js) only handles action buttons.

  try {
  // Performance controls wiring
  const fpsModeSel = panel.querySelector('#fps-mode-select');
    if (fpsModeSel) {
      const onFpsMode = (e) => {
        const mode = e.target.value;
        const targetFpsSlider = panel.querySelector('#target-fps-slider');
        const interval = targetFpsSlider ? Math.round(1000 / parseInt(targetFpsSlider.value)) : 66;
        engine.dispatch && engine.dispatch('setFpsMode', { mode, interval: mode === 'manual' ? interval : undefined });
      };
      fpsModeSel.addEventListener('change', onFpsMode);
      attachedHandlers.push({ el: fpsModeSel, type: 'change', fn: onFpsMode });
    }

  const targetFpsEl = panel.querySelector('#target-fps-slider');
    const targetFpsValueEl = panel.querySelector('#target-fps-value');
    if (targetFpsEl) {
      const onTargetFps = (e) => {
        const fps = parseInt(e.target.value);
        const interval = Math.round(1000 / fps);
        if (targetFpsValueEl) targetFpsValueEl.textContent = fps.toString();
        const fpsMode = panel.querySelector('#fps-mode-select')?.value;
        if (fpsMode === 'manual') {
          engine.dispatch && engine.dispatch('setFpsMode', { mode: 'manual', interval });
        }
      };
      targetFpsEl.addEventListener('input', onTargetFps);
      attachedHandlers.push({ el: targetFpsEl, type: 'input', fn: onTargetFps });
    }

  const frameSkipEl = panel.querySelector('#frame-skip-slider');
    const frameSkipValueEl = panel.querySelector('#frame-skip-value');
    if (frameSkipEl) {
      const onFrameSkip = (e) => {
        if (frameSkipValueEl) frameSkipValueEl.textContent = e.target.value;
      };
      frameSkipEl.addEventListener('input', onFrameSkip);
      attachedHandlers.push({ el: frameSkipEl, type: 'input', fn: onFrameSkip });
    }

  const resScaleEl = panel.querySelector('#resolution-scale-slider');
    const resScaleValueEl = panel.querySelector('#resolution-scale-value');
    if (resScaleEl) {
      const onResScale = (e) => {
        if (resScaleValueEl) resScaleValueEl.textContent = e.target.value;
      };
      resScaleEl.addEventListener('input', onResScale);
      attachedHandlers.push({ el: resScaleEl, type: 'input', fn: onResScale });
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
