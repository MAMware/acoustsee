// File: web/ui/dev-panel/dev-panel.js (Renamed from debug-ui.js)

// Settings will be provided via initializer config to avoid implicit global coupling
let _config = {};
import { setOutputCallback } from '../../utils/core-logger.js';
import { getAudioDiagnostics } from '../../audio/audio-processor.js';
import { debugLog, setLogView, clearLogs, exportLogs, setPaused } from '../log-viewer.js';
import { createAndWireActions } from './dev-panel.actions.js';
import { applyLayoutAndBehaviors } from './dev-panel-layout.js';
import { initializeDevPanelRenderer } from './dev-panel-renderer.js'; // renamed for clarity
import { BUILD_VERSION, AUDIO_VERSION, VIDEO_VERSION, UI_VERSION, LANGUAGES_VERSION, UTILS_VERSION } from '../../core/constants.js';
import { registerComponent } from '../ui-registry.js';

// Log available version constants and fallbacks to help detect missing values early.
console.log('dev-panel module loaded. Versions:', {
  BUILD_VERSION,
  AUDIO_VERSION,
  VIDEO_VERSION,
  UI_VERSION,
  LANGUAGES_VERSION,
  UTILS_VERSION
});

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
  const onAppPoweredOn = () => {
    console.log('Activating Dev Panel in response to app:poweredOn event.');

    // 1) Render HTML structure
    try {
      panel.innerHTML = `
        <div class="devpanel-main-content">
          <div class="devpanel-header">
            <h1>Developer Panel</h1>
            <div id="devpanel-subtitle">Versions: Loading...</div>
          </div>

          <div class="devpanel-section state-section">
            <h2 class="section-header">
              <span>State Inspector</span>
              <button class="collapse-btn" data-target="state-content" aria-expanded="true" title="Collapse Inspector">-</button>
            </h2>
            <div id="state-content" class="section-content">
              <pre id="devpanel-state-view">Loading state...</pre>
            </div>
          </div>

          <!-- NEW WRAPPER for side-by-side layout in portrait mode -->
          <div class="devpanel-row">
            <div id="worker-explorer-container" class="devpanel-section">
              <h2 class="section-header">
                <span>Worker Performance</span>
                <button class="collapse-btn" data-target="worker-content" aria-expanded="true" title="Collapse Worker Stats">-</button>
              </h2>
              <div id="worker-content" class="section-content">
                <div id="worker-explorer-legend"></div>
                <canvas id="worker-explorer-canvas" width="360" height="96"></canvas>
              </div>
            </div>

            <div class="devpanel-section video-section">
              <h2 class="section-header">
                <span>Live Video Preview</span>
                <button class="collapse-btn" data-target="video-content" aria-expanded="false" title="Expand Video Preview">+</button>
              </h2>
              <div id="video-content" class="section-content">
                <video id="devpanel-video-preview" muted autoplay playsinline></video>
                <p class="perf-note">Note: This preview uses the existing camera stream with minimal overhead.</p>
              </div>
            </div>
          </div>
          <!-- END WRAPPER -->

          <div class="devpanel-section controls-section">
            <h2 class="section-header"><span>Controls</span></h2>
            <div class="section-content">
              <div class="devpanel-actions-grid">
                <button data-action="toggleProcessing" type="button">Start / Stop</button>
                <button data-action="resumeAudio" type="button">Resume Audio</button>
                <button data-action="saveSettings" type="button">Save Settings</button>
                <button data-action="loadSettings" type="button">Load Settings</button>
              </div>
              <div class="controls-grid-2col">
                <div class="control-column">
                  <label>Grid Type</label>
                  <select id="grid-type-select"></select>
                  <label>Motion Threshold</label>
                  <div class="slider-container">
                    <input id="motion-threshold-slider" type="range" min="0" max="1" step="0.01" value="0.20"><span id="motion-threshold-value">0.20</span>
                  </div>
                </div>
                <div class="control-column">
                  <label>Synth Engine</label>
                  <select id="synth-engine-select"></select>
                  <label>Max Notes</label>
                  <div class="slider-container">
                    <input id="max-notes-slider" type="range" min="1" max="128" value="16"><span id="max-notes-value">16</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="devpanel-section performance-section">
            <h2 class="section-header"><span>Performance Controls</span></h2>
            <div class="section-content">
              <div class="performance-grid">
                <div class="control-column">
                  <label>FPS Mode</label>
                  <select id="fps-mode-select">
                    <option value="auto">Auto (Adaptive)</option>
                    <option value="manual">Manual</option>
                  </select>
                  <label>Target FPS (Manual)</label>
                  <div class="slider-container">
                    <input id="target-fps-slider" type="range" min="4" max="30" step="1" value="15">
                    <span id="target-fps-value">15</span>
                  </div>
                </div>
                <div class="control-column">
                  <label>Frame Skip Rate</label>
                  <div class="slider-container">
                    <input id="frame-skip-slider" type="range" min="1" max="4" step="1" value="1">
                    <span id="frame-skip-value">1</span>
                  </div>
                  <label>Resolution Scale</label>
                  <div class="slider-container">
                    <input id="resolution-scale-slider" type="range" min="0.25" max="1.0" step="0.25" value="1.0">
                    <span id="resolution-scale-value">1.0</span>
                  </div>
                </div>
              </div>
              <div class="performance-actions">
                <button data-action="resetThrottling" type="button">Reset Throttling</button>
                <button data-action="applyThrottling" type="button">Apply Manual Throttling</button>
              </div>
            </div>
          </div>

          <div class="devpanel-section logs-section">
            <h2 class="section-header"><span>Live Logs</span></h2>
            <div class="section-content">
              <div class="log-controls">
                <button id="log-pause-btn" type="button">Pause</button>
                <button id="log-clear-btn" type="button">Clear</button>
                <button id="log-export-btn" type="button">Export</button>
              </div>
              <div id="devpanel-log-view"></div>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      panel.textContent = 'Error: Dev panel could not be rendered.';
      console.error('Dev Panel innerHTML rendering failed', e);
      return; // Abort activation on critical failure
    }

    // 2) Define wiring function which will be called after CSS is loaded
    const wireUpUI = async () => {
      try {
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
        }
      };
      const stopChart = () => {
        if (workerChartRenderLoopId !== null) {
          cancelAnimationFrame(workerChartRenderLoopId);
          workerChartRenderLoopId = null;
        }
      };

      // Set up click handlers for all collapsible section headers
      panel.querySelectorAll('.section-header').forEach(headerEl => {
        const sectionEl = headerEl.closest('.devpanel-section');
        const btn = headerEl.querySelector('.collapse-btn');
        if (!btn) return;
        if (btn.getAttribute('aria-expanded') === 'false') sectionEl.classList.add('collapsed');

        headerEl.addEventListener('click', () => {
          const isNowCollapsed = sectionEl.classList.toggle('collapsed');
          btn.textContent = isNowCollapsed ? '+' : '-';
          btn.setAttribute('aria-expanded', String(!isNowCollapsed));
          if (sectionEl.classList.contains('worker-section')) {
            isNowCollapsed ? stopChart() : startChart();
          }
        });
      });
      
      // Starts the worker chart if it's visible on initial load.
      const workerSection = panel.querySelector('.worker-section');
      if (workerSection && !workerSection.classList.contains('collapsed')) {
        startChart();
      }

      // Also use Page Visibility API to globally pause the chart
      document.addEventListener('visibilitychange', () => {
        // Find the worker section element safely.
        const workerSection = panel.querySelector('#worker-explorer-container'); // <-- CORRECT SELECTOR
        if (!workerSection) return; // Defensive check

        if (document.hidden) {
          stopChart();
        } else if (!workerSection.classList.contains('collapsed')) { 
          // Only restart if it was supposed to be running
          startChart();
        }
      });

    } catch (e) { console.error('Failed to wire collapse buttons or worker chart', e); }

    // --- Populate Version Subtitle ---
    try {
      const subtitle = panel.querySelector('#devpanel-subtitle');
      const metaVer = document.querySelector('meta[name="acoustsee-version"]')?.getAttribute('content');
      const ver = metaVer || window.ACOUSTSEE_VERSION || window.ACOUSTSEE_APP_VERSION || BUILD_VERSION;
      subtitle.textContent = `Build: ${ver} | Audio: ${AUDIO_VERSION || 'n/a'} | Video: ${VIDEO_VERSION || 'n/a'} | UI: ${UI_VERSION || 'n/a'} | Utils: ${UTILS_VERSION || 'n/a'}`;
    } catch (e) {}

    // --- Cost-Effective Video Preview Wiring ---
    try {
      const previewEl = panel.querySelector('#devpanel-video-preview');
      if (previewEl && DOM && DOM.videoFeed && DOM.videoFeed.srcObject) {
        previewEl.srcObject = DOM.videoFeed.srcObject;
      }
    } catch (e) { console.error('Failed to wire video preview', e); }

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

    // --- High-Performance State Synchronization using a Web Worker ---
    const stateView = panel.querySelector('#devpanel-state-view');
    const gridTypeSelect = panel.querySelector('#grid-type-select');
    const synthEngineSelect = panel.querySelector('#synth-engine-select');
    const maxNotesSlider = panel.querySelector('#max-notes-slider');
    const maxNotesValue = panel.querySelector('#max-notes-value');
    const motionThresholdSlider = panel.querySelector('#motion-threshold-slider');
    const motionThresholdValue = panel.querySelector('#motion-threshold-value');

    // Create a dedicated worker for JSON.stringify to avoid blocking the main thread.
    let stateStringifyWorker = null;
    try {
      const workerCode = `
        function stringifySafe(obj, indent = 2) {
          const seen = new WeakSet();
          const replacer = (key, value) => {
            if (typeof value === 'object' && value !== null) {
              if (seen.has(value)) {
                return '[Circular]';
              }
              seen.add(value);
            }
            // Skip functions, symbols, and undefined (JSON.stringify does this by default, but we make it explicit)
            if (typeof value === 'function' || typeof value === 'symbol' || value === undefined) {
              return '[Non-serializable: ' + typeof value + ']';
            }
            return value;
          };
          try {
            return JSON.stringify(obj, replacer, indent);
          } catch (e) {
            return 'Error during safe stringification: ' + e.message;
          }
        }

        self.onmessage = (event) => {
          try {
            const prettyString = stringifySafe(event.data);
            self.postMessage(prettyString);
          } catch (e) {
            self.postMessage('Error stringifying state: ' + e.message);
          }
        };
      `;
      const blob = new Blob([workerCode], { type: 'application/javascript' });
      stateStringifyWorker = new Worker(URL.createObjectURL(blob));

      // When the worker sends the string back, update the DOM. This is very fast.
      stateStringifyWorker.onmessage = (event) => {
        if (stateView) stateView.textContent = event.data;
      };
    } catch (e) {
      console.error("Failed to create state stringify worker. State inspector will be disabled.", e);
    }

    let lastStateUpdate = 0;
    const STATE_UPDATE_INTERVAL = 400; // Update state view max ~2.5 times/sec

    engine.onStateChange(state => {
      // First, update the fast/responsive controls immediately.
      try {
        if (gridTypeSelect) gridTypeSelect.value = state.gridType;
        if (synthEngineSelect) synthEngineSelect.value = state.synthesisEngine;
        if (maxNotesSlider) maxNotesSlider.value = state.maxNotes;
        if (maxNotesValue) maxNotesValue.textContent = state.maxNotes;
        if (motionThresholdSlider) motionThresholdSlider.value = state.motionThreshold;
        if (motionThresholdValue) motionThresholdValue.textContent = state.motionThreshold;
      } catch(e) {}

      // Then, handle the slow state view update.
      if (!stateStringifyWorker) return; // Don't proceed if worker failed to create

      const now = performance.now();
      if (now - lastStateUpdate > STATE_UPDATE_INTERVAL) {
        lastStateUpdate = now;
        // Offload the expensive stringify operation to the worker.
        const diags = getAudioDiagnostics();
        // Create a serializable clone of state, excluding arrays that contain functions
        const { availableGrids, availableEngines, availableLanguages, ...serializableState } = state;
        const stateClone = { ...serializableState, audio: diags };
        stateStringifyWorker.postMessage(stateClone);
      }
    });

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
}

// Register initializer in the ui-registry for other modules to access later under the canonical name
try { registerComponent && registerComponent('dev-panel', initializeDevPanel); } catch (e) {}
