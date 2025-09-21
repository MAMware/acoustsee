// File: web/ui/dev-panel/dev-panel.js (Renamed from debug-ui.js)

// Settings will be provided via initializer config to avoid implicit global coupling
let _config = {};
import { setOutputCallback } from '../../utils/core-logger.js';
import { getAudioDiagnostics } from '../../audio/audio-processor.js';
import { debugLog, setLogView, clearLogs, exportLogs, setPaused } from '../log-viewer.js';
import { createAndWireActions } from './dev-panel.actions.js';
import { applyLayoutAndBehaviors } from './dev-panel-layout.js';
import { initializeDevPanelRenderer } from './dev-panel-renderer.js'; // renamed for clarity
import { BUILD_VERSION, AUDIO_VERSION, VIDEO_VERSION, UI_VERSION, LANGUAGES_VERSION } from '../../core/constants.js';
import { registerComponent } from '../ui-registry.js';

// Log available version constants and fallbacks to help detect missing values early.
console.log('dev-panel module loaded. Versions:', {
  BUILD_VERSION,
  AUDIO_VERSION,
  VIDEO_VERSION,
  UI_VERSION,
  LANGUAGES_VERSION
});

export function initializeDevPanel(arg1, arg2) {
  // Support two call patterns for migration:
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
        <div class="devpanel-header">
          <h1>Developer Panel</h1>
          <div id="devpanel-subtitle">Versions: Loading...</div>
        </div>

        <div class="devpanel-section state-section">
          <h2 class="section-header">
            <span>State Inspector</span>
            <button id="state-toggle-btn" class="collapse-btn" aria-expanded="true" title="Collapse Inspector">-</button>
          </h2>
          <div class="section-content">
            <pre id="devpanel-state-view">Loading state...</pre>
          </div>
        </div>

        <div id="worker-explorer-container" class="devpanel-section" style="display: none;">
          <h2 class="section-header">
            <span>Worker Stats</span>
          </h2>
          <div class="section-content">
            <div id="worker-explorer-legend"></div>
            <canvas id="worker-explorer-canvas" width="360" height="96"></canvas>
          </div>
        </div>

        <div class="devpanel-section controls-section">
          <h2 class="section-header"><span>Controls</span></h2>
          <div class="section-content">
            <div class="controls-grid">
              <div class="control-row mode-selector">
                <label>Mode:</label>
                <div class="segmented-control">
                  <button data-action="setMode" data-mode="flow" class="mode-btn active">Flow</button>
                  <button data-action="setMode" data-mode="focus" class="mode-btn">Focus</button>
                </div>
              </div>
              <div class="control-row"><label>Grid Type</label><select id="grid-type-select"></select></div>
              <div class="control-row"><label>Synth Engine</label><select id="synth-engine-select"></select></div>
              <div class="control-row"><label>Max Notes</label><input id="max-notes-slider" type="range" min="1" max="128" value="16"><span id="max-notes-value">16</span></div>
              <div class="control-row"><label>Motion Threshold</label><input id="motion-threshold-slider" type="range" min="0" max="1" step="0.01" value="0.20"><span id="motion-threshold-value">0.20</span></div>
            </div>
            <div class="devpanel-actions-grid">
              <button data-action="toggleWorkerExplorer" type="button">Toggle Worker Chart</button>
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
      `;
    } catch (e) {
      panel.textContent = 'Error: Dev panel could not be rendered.';
      console.error('Dev Panel innerHTML rendering failed', e);
      return; // Abort activation on critical failure
    }

    // 2) Define wiring function which will be called after CSS is loaded
    const wireUpUI = () => {
      try {
        setupUI(); // setupUI is declared below
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

  function setupUI() {
    applyLayoutAndBehaviors({ panel, DOM });

    // --- Wire Collapse Button ---
    try {
      const stateSection = panel.querySelector('.state-section');
      const toggleBtn = panel.querySelector('#state-toggle-btn');
      toggleBtn.addEventListener('click', () => {
        const isNowCollapsed = stateSection.classList.toggle('collapsed');
        toggleBtn.textContent = isNowCollapsed ? '+' : '-';
        toggleBtn.setAttribute('aria-expanded', String(!isNowCollapsed));
        toggleBtn.setAttribute('title', isNowCollapsed ? 'Expand Inspector' : 'Collapse Inspector');
      });
    } catch (e) { console.error('Failed to wire collapse button', e); }

    // --- Populate Version Subtitle ---
    try {
      const subtitle = panel.querySelector('#devpanel-subtitle');
      const metaVer = document.querySelector('meta[name="acoustsee-version"]')?.getAttribute('content');
      const ver = metaVer || window.ACOUSTSEE_VERSION || window.ACOUSTSEE_APP_VERSION || BUILD_VERSION;
      subtitle.textContent = `Build: ${ver} | Audio: ${AUDIO_VERSION || 'n/a'} | UI: ${UI_VERSION || 'n/a'}`;
    } catch (e) {}

    // --- Wire Action Buttons & Renderer ---
    // This correctly uses the existing architecture. No extra listeners needed here.
    try {
      const actionsModule = createAndWireActions(panel, engine, DOM, skipDiagnostics);
      if (actionsModule && typeof actionsModule.dispose === 'function') {
        panel.__devActionsDispose = actionsModule.dispose;
      }
      initializeDevPanelRenderer(engine, DOM);
    } catch (e) {
      console.error('initializeDevPanel: createAndWireActions/Renderer failed', e);
    }

    // --- Wire Log Viewer ---
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

    // --- Engine State Synchronization ---
    const stateView = panel.querySelector('#devpanel-state-view');
    const gridTypeSelect = panel.querySelector('#grid-type-select');
    const synthEngineSelect = panel.querySelector('#synth-engine-select');
    const maxNotesSlider = panel.querySelector('#max-notes-slider');
    const maxNotesValue = panel.querySelector('#max-notes-value');
    const motionThresholdSlider = panel.querySelector('#motion-threshold-slider');
    const motionThresholdValue = panel.querySelector('#motion-threshold-value');

    engine.onStateChange(state => {
      try {
        const diags = getAudioDiagnostics();
        if (stateView) stateView.textContent = JSON.stringify({ ...state, audio: diags }, null, 2);
        if (gridTypeSelect) gridTypeSelect.value = state.gridType;
        if (synthEngineSelect) synthEngineSelect.value = state.synthesisEngine;
        if (maxNotesSlider) maxNotesSlider.value = state.maxNotes;
        if (maxNotesValue) maxNotesValue.textContent = state.maxNotes;
        if (motionThresholdSlider) motionThresholdSlider.value = state.motionThreshold;
        if (motionThresholdValue) motionThresholdValue.textContent = state.motionThreshold;
      } catch(e) {}
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
