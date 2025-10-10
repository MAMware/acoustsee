// File: web/ui/dev-panel/dev-panel.js (Renamed from debug-ui.js)

// Settings will be provided via initializer config to avoid implicit global coupling
let _config = {};
import { setOutputCallback, setLogLevel } from '../../utils/core-logger.js';
import { getAudioDiagnostics } from '../../audio/audio-processor.js';
import { debugLog, setLogView, clearLogs, exportLogs, setPaused } from '../log-viewer.js';
import { structuredLog } from '../../utils/logging.js';
import { executeNonCriticalOperation, createMinimalFallback } from '../../utils/error-handling.js';
import { createAndWireActions } from './dev-panel.actions.js';
import { applyLayoutAndBehaviors } from './dev-panel-layout.js';
import { initializeDevPanelRenderer } from './dev-panel-renderer.js'; // renamed for clarity
import { StateInspector } from './state-inspector.js';
// Do not import core constants here; version info is read from engine state (buildInfo)
import { registerComponent } from '../ui-registry.js';

// Module loaded. Version information is read from engine.getState().buildInfo at runtime.
console.log('dev-panel module loaded. Version info will be read from engine state at runtime.');

export function initializeDevPanel(arg1, arg2) {
  // R24925 Support two call patterns for migration:
  //  - initializeDevPanel(engine, DOM)  (legacy)
  //  - initializeDevPanel({ engine, engineDispatch, dom, getEngineState }) (DI)
  let engine = null;
  let DOM = null;
  const skipDiagnostics = false;
  if (arg1 && typeof arg1.getState === 'function') {
    engine = arg1;
    DOM = arg2 || (typeof window !== 'undefined' ? window.DOM : undefined);
  } else {
    const cfg = arg1 || {};
    engine = cfg.engine || (cfg.engineDispatch ? { dispatch: cfg.engineDispatch, getState: cfg.getEngineState || (()=>({})), onStateChange: cfg.onStateChange || (()=>{}) } : null);
    DOM = cfg.dom || arg2 || (typeof window !== 'undefined' ? window.DOM : undefined);
  }
  // Ensure safe engine / DOM defaults to avoid crashing during migration
  engine = engine || { dispatch: () => {}, getState: () => ({}), onStateChange: () => {} };
  DOM = DOM || (typeof window !== 'undefined' ? window.DOM : undefined);
  // Merge config for use in internal helpers
  _config = Object.assign({}, _config, (typeof arg1 === 'object' && !arg1.getState) ? arg1 : (arg2 && typeof arg2 === 'object' ? arg2 : {}));
  console.log('initializeDevPanel called (visible)');

  const panel = document.createElement('div');
  panel.id = 'acoustsee-dev-panel';
  const root = (DOM && DOM.uiPanelRoot) || document.body;
  root.appendChild(panel);

  // Start hidden. Panel will be rendered, styled, and wired on activation.
  panel.style.display = 'none';

  // Activation handler: renders HTML, loads CSS, wires UI, and shows the panel.
  const onAppPoweredOn = async () => {
    console.log('Activating Dev Panel in response to app:poweredOn event.');

    // Enable DEBUG level logging for the dev panel
    setLogLevel('DEBUG');
    structuredLog('INFO', 'Dev Panel: Log level set to DEBUG');

    // 1) Fetch and render HTML structure from external template
    try {
      const resp = await fetch(new URL('./dev-panel.html', import.meta.url));
      if (!resp.ok) throw new Error(`Failed to fetch template: ${resp.status} ${resp.statusText}`);
      const html = await resp.text();
      panel.innerHTML = html;
    } catch (e) {
      // Preserve original fallback behavior using executeNonCriticalOperation
      return executeNonCriticalOperation('dev-panel', () => {
        throw e; // Re-throw to trigger fallback
      }, (error) => {
        const fallback = createMinimalFallback('dev-panel', error);

        // Add basic controls for core accessibility functions
        const basicControls = document.createElement('div');
        basicControls.innerHTML = `
          <div style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 4px;">
            <h4 style="margin: 0 0 8px 0;">Basic Controls (Core Accessibility Unaffected)</h4>
            <button onclick="location.reload()" style="
              background: #007bff; 
              color: white; 
              border: none; 
              padding: 8px 16px; 
              border-radius: 4px; 
              margin-right: 8px;
              cursor: pointer;
            ">Reload App</button>
            <button onclick="console.log('Engine state:', window.engine?.getState())" style="
              background: #6c757d; 
              color: white; 
              border: none; 
              padding: 8px 16px; 
              border-radius: 4px;
              cursor: pointer;
            ">Log State</button>
          </div>
        `;

        fallback.appendChild(basicControls);
        panel.appendChild(fallback);
        return; // Don't continue initialization
      });
    }

    // 2) Define wiring function which will be called after CSS is loaded
    const wireUpUI = async () => {
      try {
        // --- START NEW BLOCK: Touch Pad Wiring ---
        try {
          const padArea = panel.querySelector('#touch-pad-area'); // Use the correct ID
          if (padArea) {
            const durationSlider = panel.querySelector('#pad-duration');
            const durationValue = panel.querySelector('#pad-duration-value');
            let isPadActive = false;
            let padStartTime = null; // Track when touch/click started

            // Wire up slider display
            let _padDurationHandler = null;
            if (durationSlider && durationValue) {
              _padDurationHandler = (e) => { durationValue.textContent = parseFloat(e.target.value).toFixed(1); };
              durationSlider.addEventListener('input', _padDurationHandler);
            }

            const generateCuesFromPad = (e) => {
              try {
                if (!isPadActive) return;
                const state = engine.getState && engine.getState();
                const currentGrid = state && state.availableGrids && state.availableGrids.find(g => g.id === state.gridType);
                if (!currentGrid) return;

                const rect = padArea.getBoundingClientRect();
                const x = (e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX)) - rect.left;
                const y = (e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY)) - rect.top;

                const mockMotionResults = { movingRegions: [{ x: x, y: y, intensity: 100 }] };

                const gridOutput = currentGrid.mapFunction && currentGrid.mapFunction(null, rect.width, rect.height, null, mockMotionResults);
                if (gridOutput && gridOutput.cues && gridOutput.cues.length > 0) {
                  // If user set a pad duration, attach it to each generated cue
                  const padDur = durationSlider ? parseFloat(durationSlider.value) : undefined;
                  if (typeof padDur === 'number' && !Number.isNaN(padDur)) {
                    gridOutput.cues.forEach(c => { c.duration = c.duration || padDur; });
                    structuredLog('DEBUG', 'Touch Pad: Duration attached to cues', { duration: padDur, cueCount: gridOutput.cues.length });
                  }
                  engine.dispatch && engine.dispatch('audioPlayCues', { cues: gridOutput.cues });
                }
              } catch (err) { structuredLog('ERROR', 'Touch Pad generate error', { error: err?.message || String(err) }); }
            };

            const onPointerDown = (e) => {
              isPadActive = true;
              padStartTime = performance.now(); // Record start time
              try { padArea.setPointerCapture && padArea.setPointerCapture(e.pointerId); } catch (_) {}
              generateCuesFromPad(e);
            };

            const onPointerUp = (e) => {
              isPadActive = false;
              // Log the touch/click duration for debugging
              if (padStartTime !== null) {
                const duration = performance.now() - padStartTime;
                structuredLog('DEBUG', 'Touch Pad: Interaction ended', { 
                  interactionDuration: Math.round(duration), 
                  expectedNoteDuration: durationSlider ? parseFloat(durationSlider.value) : 'unknown' 
                });
                padStartTime = null;
              }
              try { padArea.releasePointerCapture && padArea.releasePointerCapture(e.pointerId); } catch (_) {}
              engine.dispatch && engine.dispatch('audioPlayCues', { cues: [] });
            };

            padArea.addEventListener('pointerdown', onPointerDown);
            padArea.addEventListener('pointermove', generateCuesFromPad);
            padArea.addEventListener('pointerup', onPointerUp);
            padArea.addEventListener('pointerleave', onPointerUp);

            // Store a cleanup function on the panel for the main dispose function
            panel.__touchPadCleanup = () => {
              try { padArea.removeEventListener('pointerdown', onPointerDown); } catch (_) {}
              try { padArea.removeEventListener('pointermove', generateCuesFromPad); } catch (_) {}
              try { padArea.removeEventListener('pointerup', onPointerUp); } catch (_) {}
              try { padArea.removeEventListener('pointerleave', onPointerUp); } catch (_) {}
              try { if (_padDurationHandler && durationSlider) durationSlider.removeEventListener('input', _padDurationHandler); } catch (_) {}
            };
            structuredLog('INFO', 'Touch Pad UI wired successfully.');
          } else {
            structuredLog('WARN', 'Touch Pad area (#touch-pad-area) not found in template.');
          }
        } catch (e) { console.error('Failed to wire Touch Pad', e); }
        // --- END NEW BLOCK ---

        await setupUI(); // setupUI is declared below
        panel.style.display = 'flex';
      } catch (e) {
        console.error('Dev Panel setupUI failed during wiring', e);
      }
    };

    // 3) Load stylesheet and call wireUpUI once loaded (or immediately if already present)
    try {
      // Replace brittle candidate fallback logic with a single, deterministic loader
      function loadCss() {
        const cssId = 'acoustsee-dev-panel-css';
        if (document.getElementById(cssId)) {
          wireUpUI();
          return;
        }

        const base = (
          (_config && _config.basePath) ||
          ((_config && _config.importMetaUrl) ? new URL('.', _config.importMetaUrl).href : null) ||
          (typeof document !== 'undefined' ? document.baseURI : './')
        );

        const href = new URL('ui/dev-panel/dev-panel.css', base).href;

        const link = document.createElement('link');
        link.id = cssId;
        link.rel = 'stylesheet';
        link.href = href;
        try { console.debug && console.debug('Dev Panel: attempting to load CSS from', link.href); } catch (e) {}

        link.onload = () => {
          try { console.debug && console.debug('Dev Panel CSS loaded:', link.href); } catch (e) {}
          wireUpUI();
        };

        link.onerror = (e) => {
          try { console.error && console.error('Dev Panel: stylesheet failed to load', { path: link.href, error: e }); } catch (err) {}
          // attempt to wire up unstyled UI so functionality remains available
          wireUpUI();
        };

        document.head.appendChild(link);
      }

      // Invoke the loader
      loadCss();
    } catch (e) {
      console.warn('Exception loading dev-panel stylesheet', e);
      try { wireUpUI(); } catch (_) {}
    }
  };

  async function setupUI() {
    // This panel is now full-screen by default via its CSS.

    // --- Wire All Collapsible Sections (with special logic for worker chart) ---
    let workerChartRenderLoopId = null;
    try {
      // Prepare the chart rendering function once.
      const workerCanvas = panel.querySelector('#worker-explorer-canvas');
      const legendEl = panel.querySelector('#worker-explorer-legend');
      const { RingBuffer, scaleCanvasForDPR, drawMultiSparkline } = (await import('./worker-charts.js'));
      const workerDataBuffers = new Map();
      scaleCanvasForDPR(workerCanvas);

      const renderCharts = () => {
        if (!window.__acoustseeDevPanelGetWorkerStats) return;
        const stats = window.__acoustseeDevPanelGetWorkerStats();
        // Include aggregated stats from video worker
        if (window.__acoustseeWorkerStats) {
          window.__acoustseeWorkerStats.forEach((stat, id) => stats.push(stat));
        }
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
        if (legendEl) legendEl.innerHTML = legendHTML;
        drawMultiSparkline(workerCanvas, seriesMap);
      };

      // Create a rendering loop using requestAnimationFrame
      let lastRenderTime = 0;
      const renderLoop = (timestamp) => {
        // Limit rendering to ~4 FPS (once every 250ms)
        if (timestamp - lastRenderTime >= 250) {
          lastRenderTime = timestamp;
          renderCharts();
        }
        // Continue the loop
        workerChartRenderLoopId = requestAnimationFrame(renderLoop);
      };

      const startChart = () => {
        if (workerChartRenderLoopId === null) {
          lastRenderTime = performance.now();
          workerChartRenderLoopId = requestAnimationFrame(renderLoop);
          try { panel.__workerChartRAFId = workerChartRenderLoopId; } catch (e) {}
        }
      };
      const stopChart = () => {
        if (workerChartRenderLoopId !== null) {
          try { cancelAnimationFrame(workerChartRenderLoopId); } catch (e) {}
          workerChartRenderLoopId = null;
          try { panel.__workerChartRAFId = null; } catch (e) {}
        }
      };

      // Set up click handlers for all collapsible section headers
      panel.querySelectorAll('.section-header').forEach(headerEl => {
        const sectionEl = headerEl.closest('.devpanel-section');
        const btn = headerEl.querySelector('.collapse-btn');
        if (!btn) return;
        if (btn.getAttribute('aria-expanded') === 'false') sectionEl.classList.add('collapsed');

        // Only the button toggles collapse, not the whole header
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isNowCollapsed = sectionEl.classList.toggle('collapsed');
          btn.textContent = isNowCollapsed ? '+' : '-';
          btn.setAttribute('aria-expanded', String(!isNowCollapsed));
          if (sectionEl.classList.contains('worker-section')) {
            isNowCollapsed ? stopChart() : startChart();
          }
          if (sectionEl.classList.contains('video-section')) {
            const previewToggle = panel.querySelector('#devpanel-preview-toggle');
            const wantsPreview = previewToggle && previewToggle.checked;
            if (isNowCollapsed) {
              if (typeof panel.__stopPreview === 'function') panel.__stopPreview();
            } else if (wantsPreview && typeof panel.__startPreview === 'function') {
              panel.__startPreview(4);
            }
          }
        });
      });
      
      // Starts the worker chart if it's visible on initial load.
      const workerSection = panel.querySelector('#worker-explorer-container');
      if (workerSection && !workerSection.classList.contains('collapsed')) {
        // Add a small delay to ensure workers are registered and data is available
        setTimeout(() => {
          startChart();
        }, 500);
      }

      // Also use Page Visibility API to globally pause the chart
      const visibilityHandler = () => {
        // Find the worker section element safely.
        const workerSection = panel.querySelector('#worker-explorer-container'); // <-- CORRECT SELECTOR
        if (!workerSection) return; // Defensive check

        if (document.hidden) {
          stopChart();
        } else if (!workerSection.classList.contains('collapsed')) { 
          // Only restart if it was supposed to be running
          startChart();
        }
      };
      document.addEventListener('visibilitychange', visibilityHandler);
      panel.__visibilityHandler = visibilityHandler;

      // Start chart when processing begins (workers become active)
      if (engine.onStateChange) {
        const onStateChangeCb = (state) => {
          const workerSection = panel.querySelector('#worker-explorer-container');
          if (workerSection && !workerSection.classList.contains('collapsed')) {
            if (state.isProcessing && workerChartRenderLoopId === null) {
              // Processing started and chart isn't running - start it
              startChart();
            } else if (!state.isProcessing && workerChartRenderLoopId !== null) {
              // Processing stopped - optionally keep chart running to show final data
              stopChart(); // Uncomment if you want chart to stop when processing stops
            }
          }
        };
        const maybeUnsub = engine.onStateChange(onStateChangeCb);
        if (typeof maybeUnsub === 'function') panel.__engineOnStateUnsubscribe = maybeUnsub;
      }

    } catch (e) { console.error('Failed to wire collapse buttons or worker chart', e); }

    // --- Populate Version Subtitle ---
    try {
      const subtitle = panel.querySelector('#devpanel-subtitle');
      const metaVer = document.querySelector('meta[name="acoustsee-version"]')?.getAttribute('content');
      const buildInfo = engine.getState().buildInfo || {};
      const ver = metaVer || window.ACOUSTSEE_VERSION || window.ACOUSTSEE_APP_VERSION || buildInfo.version || 'unknown';
      subtitle.textContent = `Build: ${ver} | Audio: ${buildInfo.audio_version || 'n/a'} | Video: ${buildInfo.video_version || 'n/a'} | UI: ${buildInfo.ui_version || 'n/a'} | Utils: ${buildInfo.utils_version || 'n/a'}`;
    } catch (e) {}

    // --- Cost-Effective Processing Canvas Preview Wiring ---
    try {
      const pickProcessingCanvas = () =>
        (DOM && (DOM.frameCanvas || DOM.videoCanvas)) ||
        document.querySelector('canvas#frameCanvas, canvas#frame-canvas, canvas[data-role="frame-canvas"]');

      const previewCanvas = panel.querySelector('#devpanel-preview-canvas');
      const previewToggle = panel.querySelector('#devpanel-preview-toggle');

      panel.__previewInterval = null;
      panel.__previewRO = null;

      if (!previewCanvas || !previewToggle) {
        return;
      }

      const previewCtx = previewCanvas.getContext('2d', { alpha: false });
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
          previewCanvas.width = w;
          previewCanvas.height = h;
          previewCanvas.style.width = `${w}px`;
          previewCanvas.style.height = `${h}px`;
        } catch (_) {}
      };

      const detachSource = () => {
        if (panel.__previewRO) {
          try { panel.__previewRO.disconnect(); } catch (_) {}
        }
        panel.__previewRO = null;
        activeSource = null;
      };

      const resolvePreviewSource = () => {
        const candidates = [];
        if (DOM?.videoFeed) candidates.push(DOM.videoFeed);
        const docVideoFeed = document.querySelector('video#videoFeed');
        if (docVideoFeed && docVideoFeed !== DOM?.videoFeed) candidates.push(docVideoFeed);
        const processingCanvas = pickProcessingCanvas();
        if (processingCanvas) candidates.push(processingCanvas);

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
            panel.__previewRO = new ResizeObserver(() => resizePreview(src));
            panel.__previewRO.observe(src);
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
          previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
          previewCtx.drawImage(src, 0, 0, previewCanvas.width, previewCanvas.height);
        } catch (_) {}
      };

      const startPreview = (fps = 4) => {
        if (panel.__previewInterval) return;
        previewCanvas.style.display = 'block';
        ensureSource();
        const intervalMs = Math.max(1000 / fps, 200);
        panel.__previewInterval = setInterval(drawFrame, intervalMs);
      };

      const stopPreview = () => {
        if (panel.__previewInterval) {
          clearInterval(panel.__previewInterval);
          panel.__previewInterval = null;
        }
        detachSource();
        loggedMissingSource = false;
        if (previewCanvas && previewCtx) {
          previewCtx.clearRect(0, 0, previewCanvas.width || 0, previewCanvas.height || 0);
        }
        if (previewCanvas) {
          previewCanvas.style.display = 'none';
        }
      };

      panel.__startPreview = startPreview;
      panel.__stopPreview = stopPreview;

      const handleVideoReady = () => {
        if (!DOM?.videoFeed) return;
        if (previewToggle.checked) {
          resizePreview(DOM.videoFeed);
          if (!panel.__previewInterval) startPreview(4);
        }
      };

      if (DOM?.videoFeed) {
        try {
          DOM.videoFeed.addEventListener('loadedmetadata', handleVideoReady, { passive: true });
          DOM.videoFeed.addEventListener('playing', handleVideoReady, { passive: true });
        } catch (_) {}
        panel.__detachPreviewVideoEvents = () => {
          try { DOM.videoFeed.removeEventListener('loadedmetadata', handleVideoReady); } catch (_) {}
          try { DOM.videoFeed.removeEventListener('playing', handleVideoReady); } catch (_) {}
        };
      } else {
        panel.__detachPreviewVideoEvents = () => {};
      }

      previewToggle.addEventListener('change', (e) => {
        if (e.target.checked) startPreview(4);
        else stopPreview();
      }, { passive: true });

      setTimeout(() => {
        if (previewToggle.checked) startPreview(4);
      }, 600);

      if (engine.onStateChange) {
        const previewOnState = (state) => {
          if (!state) return;
          if (state.isProcessing && previewToggle.checked && !panel.__previewInterval) {
            startPreview(4);
          }
        };
        const maybeUnsub = engine.onStateChange(previewOnState);
        if (typeof maybeUnsub === 'function') panel.__previewOnStateUnsubscribe = maybeUnsub;
      }

    } catch (e) { console.error('Failed to wire processing preview', e); }

    // --- Wire Core Action Buttons & Renderer ---
    try {
      const actionsModule = createAndWireActions(panel, engine, DOM, skipDiagnostics);
      if (actionsModule && typeof actionsModule.dispose === 'function') {
        panel.__devActionsDispose = actionsModule.dispose;
      }
      initializeDevPanelRenderer(engine, DOM);
    } catch (e) {
      console.error('initializeDevPanel: createAndWireActions/Renderer failed', e);
    }

    // --- Wire Log Viewer Controls ---
    const logView = panel.querySelector('#devpanel-log-view');
    setLogView(logView);
    panel.querySelector('#log-pause-btn').addEventListener('click', (e) => {
        const isPaused = e.target.textContent === 'Pause';
        setPaused(!isPaused);
        e.target.textContent = isPaused ? 'Resume' : 'Pause';
    });
    panel.querySelector('#log-clear-btn').addEventListener('click', clearLogs);
    panel.querySelector('#log-export-btn').addEventListener('click', () => {
        const data = exportLogs();
        const blob = new Blob([data], {type: 'application/json'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'acoustsee-logs.json'; a.click();
        URL.revokeObjectURL(url);
    });

    // --- Dynamically Populate Grid and Synth Dropdowns from Central State ---
    try {
      const state = engine.getState(); // Get the current application state

      // Populate Grid Type Select
      const gridSelect = panel.querySelector('#grid-type-select');
      if (gridSelect && Array.isArray(state.availableGrids)) {
        gridSelect.innerHTML = ''; // Clear any existing options
        state.availableGrids.forEach(grid => {
          const option = document.createElement('option');
          option.value = grid.id;
          // Use the user-friendly name from meta if available, otherwise use the ID
          option.textContent = (grid.meta && grid.meta.name) || grid.id;
          gridSelect.appendChild(option);
        });
        // Set the initial value from the state
        if (state.gridType) {
          gridSelect.value = state.gridType;
        }
      }

      // Populate Synth Engine Select
      const synthSelect = panel.querySelector('#synth-engine-select');
      if (synthSelect && Array.isArray(state.availableEngines)) {
        synthSelect.innerHTML = ''; // Clear any existing options
        state.availableEngines.forEach(engineMeta => {
          const option = document.createElement('option');
          option.value = engineMeta.id;
          // The structure from available-synths.js is slightly different
          option.textContent = (engineMeta.meta && engineMeta.meta.name) || engineMeta.id;
          synthSelect.appendChild(option);
        });
        // Set the initial value from the state
        if (state.synthesisEngine) {
          synthSelect.value = state.synthesisEngine;
        }
      }
    } catch (e) {
      structuredLog('ERROR', 'Failed to dynamically populate dropdowns from state', { error: e.message });
    }

    // --- Initialize Visual State Inspector ---
    try {
      const stateSection = panel.querySelector('#state-content');
      if (stateSection) {
        // Create new visual state inspector
        const stateInspector = new StateInspector(stateSection, engine);
        // Store reference for cleanup
        panel.__stateInspector = stateInspector;
        // If header filter exists, forward its input to internal filter
        const externalFilter = panel.querySelector('#state-filter-external');
        if (externalFilter && typeof stateInspector.filterState === 'function') {
          externalFilter.addEventListener('input', (e) => {
            stateInspector.filterState(e.target.value.toLowerCase());
          });
        }
        // NOTE: removed standalone video size label. Video dimensions are now
        // pushed to engine state by media-commands and rendered inside the
        // State Inspector (group: Video Settings) as `videoSize`.
        structuredLog('INFO', 'dev-panel', { message: 'Visual state inspector initialized' });
      }
    } catch (e) {
      structuredLog('ERROR', 'dev-panel', { message: 'Failed to initialize state inspector', error: e.message });
      // Fallback to simple text display
      const stateSection = panel.querySelector('#state-content');
      if (stateSection) {
        stateSection.innerHTML = '<div style="color: #e74c3c; padding: 8px;">State inspector failed to load. Check console for details.</div>';
      }
    }

    // --- Control Synchronization ---
    const gridTypeSelect = panel.querySelector('#grid-type-select');
    const synthEngineSelect = panel.querySelector('#synth-engine-select');
    const modeSelect = panel.querySelector('#mode-select');
    const fpsModeSelect = panel.querySelector('#fps-mode-select');
    const maxNotesSlider = panel.querySelector('#max-notes-slider');
    const maxNotesValue = panel.querySelector('#max-notes-value');
    const motionThresholdSlider = panel.querySelector('#motion-threshold-slider');
    const motionThresholdValue = panel.querySelector('#motion-threshold-value');
    const ingestRateSelect = panel.querySelector('#ingest-rate-select');
    const ingestEnabledCheckbox = panel.querySelector('#ingest-enabled-checkbox');
    const batteryOptimizationCheckbox = panel.querySelector('#battery-optimization-checkbox');
    const ingestCategoryToggles = panel.querySelectorAll('.category-toggle input[type="checkbox"]');

    // Sync controls with state changes
    engine.onStateChange(state => {
      try {
        if (gridTypeSelect) gridTypeSelect.value = state.gridType;
        if (synthEngineSelect) synthEngineSelect.value = state.synthesisEngine;
        if (modeSelect) modeSelect.value = state.currentMode;
        if (fpsModeSelect) fpsModeSelect.value = state.autoFPS ? 'auto' : 'manual';
        if (maxNotesSlider) maxNotesSlider.value = state.maxNotes;
        if (maxNotesValue) maxNotesValue.textContent = state.maxNotes;
        if (motionThresholdSlider) motionThresholdSlider.value = state.motionThreshold;
        if (motionThresholdValue) motionThresholdValue.textContent = state.motionThreshold;
        // Update ingest controls
        if (ingestEnabledCheckbox) ingestEnabledCheckbox.checked = state.ingestEnabled;
        if (batteryOptimizationCheckbox) batteryOptimizationCheckbox.checked = state.ingestPreferences?.useIdleCallback || false;
        if (ingestRateSelect) ingestRateSelect.value = state.ingestPreferences?.maxEventsPerSecond || 10;
        // Update category toggle selection
        if (ingestCategoryToggles && state.ingestCategories) {
          const enabledCategories = Object.keys(state.ingestCategories);
          ingestCategoryToggles.forEach(toggle => {
            toggle.checked = enabledCategories.includes(toggle.dataset.category);
          });
        }
      } catch(e) {}
    });

    // Add change listeners for selects
    if (fpsModeSelect) {
      fpsModeSelect.addEventListener('change', (e) => {
        const enabled = e.target.value === 'auto';
        engine.dispatch('setAutoFps', { enabled });
      });
    }
    if (gridTypeSelect) {
      gridTypeSelect.addEventListener('change', (e) => {
        console.log('=== GRID DROPDOWN CHANGE EVENT FIRED ===');
        const selectedValue = e.target.value;
        const optionsCount = e.target.options.length;
        const selectedIndex = e.target.selectedIndex;
        const selectedOption = e.target.options[selectedIndex];
        
        structuredLog('DEBUG', 'Grid dropdown changed', {
          selectedValue,
          selectedIndex,
          optionsCount,
          optionValue: selectedOption?.value,
          optionText: selectedOption?.textContent
        });
        
        const payloadToSend = { gridType: selectedValue };
        structuredLog('DEBUG', 'About to dispatch setGridType', { payload: payloadToSend });
        engine.dispatch('setGridType', payloadToSend);
      });
    }
    if (synthEngineSelect) {
      synthEngineSelect.addEventListener('change', (e) => {
        console.log('=== SYNTH DROPDOWN CHANGE EVENT FIRED ===');
        const selectedValue = e.target.value;
        const optionsCount = e.target.options.length;
        const selectedIndex = e.target.selectedIndex;
        const selectedOption = e.target.options[selectedIndex];
        
        structuredLog('DEBUG', 'Synth dropdown changed', {
          selectedValue,
          selectedIndex,
          optionsCount,
          optionValue: selectedOption?.value,
          optionText: selectedOption?.textContent
        });
        
        const payloadToSend = { synthesisEngine: selectedValue };
        structuredLog('DEBUG', 'About to dispatch setSynthEngine', { payload: payloadToSend });
        engine.dispatch('setSynthEngine', payloadToSend);
      });
    }
    
    // Add event listeners for Max Notes and Motion Threshold sliders
    if (maxNotesSlider) {
      maxNotesSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        if (maxNotesValue) maxNotesValue.textContent = value;
        structuredLog('DEBUG', 'Max notes slider changed', { value });
        engine.dispatch('setMaxNotes', { maxNotes: value });
      });
    }
    
    if (motionThresholdSlider) {
      motionThresholdSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        if (motionThresholdValue) motionThresholdValue.textContent = value;
        structuredLog('DEBUG', 'Motion threshold slider changed', { value });
        engine.dispatch('setMotionThreshold', { motionThreshold: value });
      });
    }
    
    // Add event listeners for Performance Analytics controls
    if (ingestEnabledCheckbox) {
      ingestEnabledCheckbox.addEventListener('change', (e) => {
        console.log('=== INGEST ENABLED CHECKBOX CHANGED ===');
        structuredLog('DEBUG', 'Ingest enabled changed', { checked: e.target.checked });
        engine.dispatch('setIngestEnabled', { enabled: e.target.checked });
      });
    }
    
    if (batteryOptimizationCheckbox) {
      batteryOptimizationCheckbox.addEventListener('change', (e) => {
        console.log('=== BATTERY OPTIMIZATION CHECKBOX CHANGED ===');
        structuredLog('DEBUG', 'Battery optimization changed', { checked: e.target.checked });
        engine.dispatch('setIngestPreferences', { 
          preferences: { useIdleCallback: e.target.checked }
        });
      });
    }
    
    if (ingestRateSelect) {
      ingestRateSelect.addEventListener('change', (e) => {
        console.log('=== INGEST RATE SELECT CHANGED ===');
        const rate = parseInt(e.target.value);
        structuredLog('DEBUG', 'Ingest rate changed', { 
          selectedValue: e.target.value,
          parsedRate: rate 
        });
        engine.dispatch('setIngestPreferences', { 
          preferences: { maxEventsPerSecond: rate }
        });
      });
    }
    
    // Add listeners for category toggles
    if (ingestCategoryToggles) {
      ingestCategoryToggles.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
          console.log('=== CATEGORY TOGGLE CHANGED ===');
          const category = e.target.dataset.category;
          const checked = e.target.checked;
          structuredLog('DEBUG', 'Category toggle changed', { category, checked });
          
          // This is more complex - categories need to be managed carefully
          // For now, just log it. The "Apply Settings" button will handle the full update
        });
      });
    }

    setOutputCallback((level, text) => debugLog(level, text));
  }

  // --- Self-Activation Wiring ---
  // The Dev Panel listens for the 'app:poweredOn' event. This establishes a
  // clear contract: if the engine does not support `on`, fail fast and show
  // an explicit error in the panel for developers.
  try {
    if (!engine || typeof engine.on !== 'function') {
      throw new Error('Engine does not support the required event emitter interface (`on` method).');
    }

    let unsubscribe = null;
    const activationListener = () => {
      try {
        onAppPoweredOn();
      } catch (e) {
        console.warn('Dev Panel activation failed', e);
      }
      try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (_) {}
    };

    unsubscribe = engine.on('app:poweredOn', activationListener);
  } catch (err) {
    console.error('CRITICAL: Dev Panel self-activation wiring failed.', err);
    // Provide visible feedback in the panel so developers notice immediately.
    try {
      panel.style.display = 'block';
      panel.style.padding = '16px';
      panel.style.background = '#fff6f6';
      panel.style.border = '2px solid #d00';
      panel.textContent = `Dev Panel failed to initialize: ${err.message}. See console for details.`;
    } catch (e) {
      console.error('Failed to display error in dev panel DOM', e);
    }
  }

  // Consolidated disposer - return a dispose() function that cleans up everything
  return {
    dispose() {
      structuredLog('INFO', 'Disposing Dev Panel...');

      // 1. Dispose of StateInspector
      try {
        if (panel.__stateInspector && typeof panel.__stateInspector.dispose === 'function') {
          panel.__stateInspector.dispose();
        }
      } catch (e) { /* swallow */ }

      // 2. Dispose of wired actions from dev-panel.actions.js
      try {
        if (panel.__devActionsDispose && typeof panel.__devActionsDispose === 'function') {
          panel.__devActionsDispose();
        }
      } catch (e) { /* swallow */ }

      // 3. Stop the video preview and clean up its resources
      try {
        if (typeof panel.__stopPreview === 'function') panel.__stopPreview();
      } catch (e) { /* swallow */ }
      try {
        if (typeof panel.__detachPreviewVideoEvents === 'function') panel.__detachPreviewVideoEvents();
      } catch (e) { /* swallow */ }

      // 4. Stop the worker chart rendering loop
      try {
        if (typeof cancelAnimationFrame === 'function') {
          // We stored RAF id in workerChartRenderLoopId inside setupUI scope; try to access via panel
          const rafId = panel.__workerChartRAFId;
          if (typeof rafId === 'number') cancelAnimationFrame(rafId);
        }
      } catch (e) { /* swallow */ }

      // 5. Clean up the log viewer callback
      try { setOutputCallback(null); } catch (e) { /* swallow */ }

      // 6. Remove global event listeners (visibilitychange)
      try {
        if (typeof panel.__visibilityHandler === 'function') {
          document.removeEventListener('visibilitychange', panel.__visibilityHandler);
        }
      } catch (e) { /* swallow */ }

      // 6.5 Touch Pad cleanup if present
      try {
        if (typeof panel.__touchPadCleanup === 'function') {
          panel.__touchPadCleanup();
        }
      } catch (e) { /* swallow */ }

      // 7. Remove engine state change listener if present
      try {
        if (panel.__engineOnStateUnsubscribe && typeof panel.__engineOnStateUnsubscribe === 'function') {
          panel.__engineOnStateUnsubscribe();
        }
      } catch (e) { /* swallow */ }

      // 8. Remove panel node from DOM
      try {
        if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      } catch (e) { /* swallow */ }

      structuredLog('INFO', 'Dev Panel disposed successfully.');
    }
  };
}

// Register initializer in the ui-registry for other modules to access later under the canonical name
try { registerComponent && registerComponent('dev-panel', initializeDevPanel); } catch (e) {}
