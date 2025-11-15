// File: web/ui/dev-panel/dev-panel.actions.js
// Robust createAndWireActions which wires controls and returns a dispose handle.
// worker-monitor.js now lives alongside the dev-panel UI and provides worker stats

import { getWorkerStats } from './worker-monitor.js';
import { RingBuffer, makeThrottledRenderer, scaleCanvasForDPR, drawMultiSparkline } from './worker-charts.js';
import { structuredLog } from '../../utils/logging.js';
import { clearIdbLogs } from '../../utils/idb-logger.js';

export function createAndWireActions(panel, engine, DOM, skipDiagnostics) {
  // There may be multiple action grids (e.g., Synth Sandbox and Controls).
  const actionsContainers = panel.querySelectorAll('.devpanel-actions-grid');
  const ingestActions = panel.querySelector('.ingest-actions');
  if (!actionsContainers || actionsContainers.length === 0) {
    console.error('createAndWireActions: Could not find any .devpanel-actions-grid containers in the provided panel.');
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
  // Check if button is in any of the actionsContainers or ingestActions
  const isInActions = Array.from(actionsContainers).some(c => c.contains(btn)) || (ingestActions && ingestActions.contains(btn));
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
      case 'sandbox-play-note':
        try {
          const pitch = parseFloat(panel.querySelector('#sandbox-pitch')?.value || '440');
          const intensity = parseFloat(panel.querySelector('#sandbox-intensity')?.value || '0.5');
          const pan = parseFloat(panel.querySelector('#sandbox-pan')?.value || '0');
          const manualCue = {
            objectType: 'default_motion',
            pitch: pitch,
            intensity: intensity,
            pan: pan,
            position: { x: pan, y: 0, z: 0 }
          };

          // Dispatch the main pipeline event for logging and compatibility
          engine.dispatch && engine.dispatch('audioCuesReady', { cues: [manualCue] });

          // ALSO dispatch the direct audio play command as a robust fallback
          try {
            engine.dispatch && engine.dispatch('audioPlayCues', { cues: [manualCue] });
            structuredLog('INFO', 'Synth Sandbox: Dispatched manual cue via BOTH events', manualCue);
          } catch (e) {
            structuredLog('WARN', 'Synth Sandbox: Failed to dispatch audioPlayCues fallback', { error: e?.message || String(e), manualCue });
          }
        } catch (e) {
          structuredLog('ERROR', 'Synth Sandbox: Failed to dispatch manual cue', { error: e?.message || String(e) });
        }
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
      case 'toggleHaptic':
        engine.dispatch && engine.dispatch('toggleHaptic', { enabled: !engine.state.hapticEnabled });
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
      
      // CORE-15: Motion detection preset actions
      case 'motion-preset-subtle':
        engine.dispatch && engine.dispatch('updateMotionDetection', { 
          params: { step: 8, threshold: 15, maxRegions: 32, windowSize: 7 } 
        });
        break;
      case 'motion-preset-normal':
        engine.dispatch && engine.dispatch('updateMotionDetection', { 
          params: { step: 6, threshold: 20, maxRegions: 64, windowSize: 5 } 
        });
        break;
      case 'motion-preset-large':
        engine.dispatch && engine.dispatch('updateMotionDetection', { 
          params: { step: 4, threshold: 30, maxRegions: 96, windowSize: 3 } 
        });
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
      case 'clearIdbLogs':
        try {
          const clearBtn = btn;
          clearBtn.disabled = true;
          const originalText = clearBtn.textContent;
          clearBtn.textContent = 'Clearing...';
          
          clearIdbLogs().then(() => {
            structuredLog('INFO', 'User cleared IDB logs from dev panel', {});
            clearBtn.textContent = '✓ Logs cleared';
            clearBtn.classList.add('success');
            
            // Reset button after 2 seconds
            setTimeout(() => {
              clearBtn.textContent = originalText;
              clearBtn.classList.remove('success');
              clearBtn.disabled = false;
            }, 2000);
          }).catch(err => {
            structuredLog('ERROR', 'Failed to clear IDB logs', { error: err.message });
            clearBtn.textContent = `✗ Failed: ${err.message}`;
            clearBtn.classList.add('error');
            
            // Reset button after 3 seconds
            setTimeout(() => {
              clearBtn.textContent = originalText;
              clearBtn.classList.remove('error');
              clearBtn.disabled = false;
            }, 3000);
          });
        } catch (e) {
          structuredLog('ERROR', 'clearIdbLogs dispatch failed', { error: e.message });
        }
        break;
      default:
        break;
    }
  };
  // Attach delegated click to all action grids
  Array.from(actionsContainers).forEach(container => {
    try {
      container.addEventListener('click', delegatedClick);
      attachedHandlers.push({ el: container, type: 'click', fn: delegatedClick });
    } catch (e) { /* ignore */ }
  });
  
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

  const depthPathSel = panel.querySelector('#depth-path-select');
    if (depthPathSel) {
      const onDepthPath = (e) => {
        const path = e.target.value;
        engine.dispatch && engine.dispatch('setDepthPath', { path });
      };
      depthPathSel.addEventListener('change', onDepthPath);
      attachedHandlers.push({ el: depthPathSel, type: 'change', fn: onDepthPath });
    }

  // Semantic Detection Toggle (Educational Mode)
  const semanticDetectionToggle = panel.querySelector('#semantic-detection-toggle');
    if (semanticDetectionToggle) {
      const onSemanticToggle = (e) => {
        const enabled = e.target.checked;
        engine.dispatch && engine.dispatch('toggleSemanticDetection', { enabled });
        structuredLog('INFO', 'Semantic detection toggled', { enabled, context: 'Dev Panel' });
      };
      // Initialize from state
      const state = engine.getState && engine.getState();
      if (state && state.enableSemanticDetection !== undefined) {
        semanticDetectionToggle.checked = state.enableSemanticDetection;
      }
      semanticDetectionToggle.addEventListener('change', onSemanticToggle);
      attachedHandlers.push({ el: semanticDetectionToggle, type: 'change', fn: onSemanticToggle });
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
    // --- Synth Sandbox slider UI updates ---
    try {
      const sandboxPitch = panel.querySelector('#sandbox-pitch');
      const sandboxPitchValue = panel.querySelector('#sandbox-pitch-value');
      if (sandboxPitch && sandboxPitchValue) {
        const handler = (e) => { sandboxPitchValue.textContent = e.target.value; };
        sandboxPitch.addEventListener('input', handler);
        attachedHandlers.push({ el: sandboxPitch, type: 'input', fn: handler });
      }

      const sandboxIntensity = panel.querySelector('#sandbox-intensity');
      const sandboxIntensityValue = panel.querySelector('#sandbox-intensity-value');
      if (sandboxIntensity && sandboxIntensityValue) {
        const handler = (e) => { sandboxIntensityValue.textContent = e.target.value; };
        sandboxIntensity.addEventListener('input', handler);
        attachedHandlers.push({ el: sandboxIntensity, type: 'input', fn: handler });
      }

      const sandboxPan = panel.querySelector('#sandbox-pan');
      const sandboxPanValue = panel.querySelector('#sandbox-pan-value');
      if (sandboxPan && sandboxPanValue) {
        const handler = (e) => { sandboxPanValue.textContent = e.target.value; };
        sandboxPan.addEventListener('input', handler);
        attachedHandlers.push({ el: sandboxPan, type: 'input', fn: handler });
      }
    } catch (e) { console.error('Failed to wire Synth Sandbox sliders', e); }

      
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
        
        // Update semantic detection toggle state
        const semanticToggle = panel.querySelector('#semantic-detection-toggle');
        if (semanticToggle && state && state.enableSemanticDetection !== undefined) {
          semanticToggle.checked = state.enableSemanticDetection;
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

  // Update cues display
  const updateCuesDisplay = (state) => {
    const cuesPanel = panel.querySelector('#cues-panel');
    if (cuesPanel) {
      cuesPanel.innerHTML = `
        <h3>Live Cues</h3>
        <p><strong>Mode:</strong> ${state.currentMode || 'flow'}</p>
        <p><strong>BPM:</strong> ${state.bpm || 100}</p>
        <p><strong>TextureGrid:</strong> <pre>${state.textureGrid ? JSON.stringify(state.textureGrid, null, 2) : 'N/A'}</pre></p>
        <p><strong>Objects:</strong> ${state.objects ? state.objects.join(', ') : 'None'}</p>
        <p><strong>Pointed:</strong> ${state.pointed ? JSON.stringify(state.pointed, null, 2) : 'None'}</p>
      `;
    }
  };

  // Mode switch button
  const modeButton = document.createElement('button');
  const currentMode = engine?.getState?.()?.currentMode || 'flow';
  modeButton.textContent = `Switch Mode (Current: ${currentMode})`;
  modeButton.setAttribute('data-action', 'switchMode');
  modeButton.type = 'button';
  const controlsGrid = panel.querySelector('.devpanel-actions-grid');
  if (controlsGrid) controlsGrid.appendChild(modeButton);

  // Add switchMode action
  attachedHandlers.push({
    element: modeButton,
    event: 'click',
    handler: () => {
      if (!engine) return;
      const state = engine?.getState?.();
      if (!state) return;
      const modes = ['flow', 'focus', 'hybrid'];
      const currentIndex = modes.indexOf(state.currentMode || 'flow');
      const newMode = modes[(currentIndex + 1) % modes.length];
      engine.dispatch && engine.dispatch('setMode', { mode: newMode });
    }
  });

  // Update display on state changes
  engine.onStateChange((state) => {
    updateCuesDisplay(state);
    if (modeButton) modeButton.textContent = `Switch Mode (Current: ${state.currentMode || 'flow'})`;
  });

  return { dispose };
}
