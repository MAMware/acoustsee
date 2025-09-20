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
      <div class="devpanel-section state-section">
        <h2>State Inspector
          <span id="audio-version-badge" title="Build Version"></span>
        </h2>
        <pre id="devpanel-state-view">Loading state...</pre>
        <div id="version-footer"></div>
      </div>
      <div class="devpanel-section controls-section">
        <h2>Controls</h2>
        <div class="controls-grid">
          <div class="control-row mode-selector">
            <label>Mode:</label>
            <div class="segmented-control">
              <button data-action="setMode" data-mode="flow" class="mode-btn active">Flow</button>
              <button data-action="setMode" data-mode="focus" class="mode-btn">Focus</button>
            </div>
          </div>
          <div class="control-row"><label>Grid Type<select id="grid-type-select"></select></label></div>
          <div class="control-row"><label>Synth Engine<select id="synth-engine-select"></select></label></div>
          <div class="control-row"><label>Max Notes<input id="max-notes-slider" type="range" min="1" max="128" value="16"><span id="max-notes-value">16</span></label></div>
          <div class="control-row"><label>Motion Threshold<input id="motion-threshold-slider" type="range" min="0" max="1" step="0.01" value="0.20"><span id="motion-threshold-value">0.20</span></label></div>
        </div>
        <div class="devpanel-actions-grid">
          <button data-action="toggleWorkerExplorer" type="button">Worker Stats</button>
        </div>
        <div id="worker-explorer-container" style="display:none; margin-top:8px;">
          <div id="worker-explorer-legend"></div>
          <canvas id="worker-explorer-canvas" width="360" height="96"></canvas>
        </div>
      </div>
      <div class="devpanel-section logs-section">
        <h2>Live Logs</h2>
        <div class="log-controls">
          <button id="log-pause-btn" type="button">Pause</button>
          <button id="log-clear-btn" type="button">Clear</button>
          <button id="log-export-btn" type="button">Export</button>
        </div>
        <div id="devpanel-log-view"></div>
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
      const cssId = 'acoustsee-dev-panel-css';
      if (document.getElementById(cssId)) {
        wireUpUI();
        return;
      }
      // Construct a prioritized href list. Prefer an explicit basePath provided
      // via _config.basePath or _config.workerBaseUrl, then fall back to
      // importMetaUrl and packaged relative paths.
      const candidates = [];
      try {
        const explicitBase = (_config && (_config.basePath || _config.workerBaseUrl || _config.importMetaUrl));
        if (explicitBase) {
          // If the provided base looks like it points to a directory containing
          // the `video/` directory or the app root, attempt to build a path to
          // the UI asset relative to it.
          try { candidates.push(new URL('./ui/dev-panel/dev-panel.css', explicitBase).href); } catch (e) {}
        }
      } catch (e) {}
      // Also try the common packaged locations
      candidates.push('/ui/dev-panel/dev-panel.css');
      candidates.push('./ui/dev-panel/dev-panel.css');

      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';

      let loaded = false;
      const tryNext = (idx) => {
        if (idx >= candidates.length) {
          console.warn('dev-panel: all stylesheet candidates failed, proceeding without styles');
          wireUpUI();
          return;
        }
        const href = candidates[idx];
        link.href = href;
        // Use a temporary onerror handler to try the next candidate
        const onErr = (e) => {
          console.warn('dev-panel: stylesheet candidate failed', href, e);
          // Try next candidate by cloning a fresh link element to avoid stateful failures.
          const newLink = document.createElement('link');
          newLink.id = cssId;
          newLink.rel = 'stylesheet';
          document.head.removeChild(link);
          document.head.appendChild(newLink);
          // Replace reference
          link = newLink; // eslint-disable-line no-param-reassign
          tryNext(idx + 1);
        };
        link.onload = () => { loaded = true; wireUpUI(); };
        link.onerror = onErr;
        document.head.appendChild(link);
      };
      tryNext(0);
    } catch (e) {
      console.warn('Exception loading dev-panel stylesheet', e);
      try { wireUpUI(); } catch (_) {}
    }
  };

  function setupUI() {
    // Reuse previous behavior code (copied and adapted)
    // Delegate panel behavior to the shared module to avoid duplicate inline logic.
    try {
      // applyLayoutAndBehaviors controls layout and z-index, and wires resize/orientation handlers.
      applyLayoutAndBehaviors({ panel, DOM });
    } catch (e) {
      // Best-effort: if the behavior module fails, fall back to a minimal responsive layout.
      try {
        const applyResponsiveLayout = () => {
          const isLandscape = window.innerWidth > window.innerHeight;
          if (isLandscape) {
            Object.assign(panel.style, { position: 'fixed', right: '0', top: '0', width: '400px', height: '100vh', borderLeft: '2px solid #34495e' });
          } else {
            Object.assign(panel.style, { position: 'fixed', left: '8px', right: '8px', bottom: '8px', top: 'auto', width: 'calc(100% - 16px)', height: '42vh', borderTop: '2px solid #34495e', borderRadius: '8px' });
          }
        };
        applyResponsiveLayout();
        window.addEventListener('resize', applyResponsiveLayout, { passive: true });
      } catch (e2) { /* ignore */ }
    }

    try {
      // Cache frequently-updated DOM elements to avoid repeated querySelector calls
      const gridTypeSelect = panel.querySelector('#grid-type-select');
      const synthEngineSelect = panel.querySelector('#synth-engine-select');
      const maxNotesSlider = panel.querySelector('#max-notes-slider');
      const maxNotesValue = panel.querySelector('#max-notes-value');
      const motionThresholdSlider = panel.querySelector('#motion-threshold-slider');
      const motionThresholdValue = panel.querySelector('#motion-threshold-value');
      const autoFpsCheckbox = panel.querySelector('#auto-fps-checkbox');
      const enableFrameWorkerCheckbox = panel.querySelector('#enable-frame-worker-checkbox');
      const versionBadge = panel.querySelector('#audio-version-badge');
      const versionFooter = panel.querySelector('#version-footer');
  const metaVer = (typeof document !== 'undefined' && document.querySelector) ? document.querySelector('meta[name="acoustsee-version"]')?.getAttribute('content') : null;
  const ver = metaVer || (typeof window !== 'undefined' && (window.ACOUSTSEE_VERSION || window.ACOUSTSEE_APP_VERSION)) || BUILD_VERSION;
      if (versionBadge) versionBadge.textContent = `v${ver}`;
      if (versionFooter) versionFooter.textContent = `Audio: ${AUDIO_VERSION || 'n/a'} | Video: ${VIDEO_VERSION || 'n/a'} | UI: ${UI_VERSION || ver}`;
    } catch (e) {}

  // worker explorer and video preview wiring replicated here (omitted for brevity) R190925 omitted? why? 

    try {
      // Instrumentation: snapshot pre-action wiring
      try {
        console.log('dev-panel: setupUI starting. nodes:', {
          stateView: !!panel.querySelector('#devpanel-state-view'),
          logView: !!panel.querySelector('#devpanel-log-view'),
          actionsGrid: !!panel.querySelector('.devpanel-actions-grid')
        });
      } catch (_) {}

      const actionsModule = createAndWireActions(panel, engine, DOM, skipDiagnostics);
      console.log('dev-panel: createAndWireActions returned', !!actionsModule);
      if (actionsModule && typeof actionsModule.dispose === 'function') {
        panel.__devActionsDispose = actionsModule.dispose;
      }
      try {
        // Initialize dev-panel overlay renderer if present
        initializeDevPanelRenderer(engine, DOM);
      } catch (e) { /* ignore */ }
    } catch (e) {
      console.error('initializeDevPanel: createAndWireActions failed', e);
      // expose failure in the DOM for quick visual detection
      try { const cs = panel.querySelector('.controls-section'); if (cs) cs.textContent = 'Actions failed: see console'; } catch(_) {}
    }

  const stateView = panel.querySelector('#devpanel-state-view');
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
    // This callback synchronizes the Dev Panel's UI controls (sliders, dropdowns,
    // checkboxes) with the engine state whenever it changes, ensuring the panel
    // reflects the current application settings and provides live feedback.
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
      if (autoFpsCheckbox) autoFpsCheckbox.checked = state.autoFPS;
      if (enableFrameWorkerCheckbox) enableFrameWorkerCheckbox.checked = (_config.settings && _config.settings.enableFrameWorker) || false;
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
