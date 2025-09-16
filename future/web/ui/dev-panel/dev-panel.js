// File: web/ui/dev-panel/dev-panel.js (Renamed from debug-ui.js)

import { settings } from '../../core/state.js';
import { setOutputCallback } from '../../utils/core-logger.js';
import { getAudioDiagnostics } from '../../audio/audio-processor.js';
import { debugLog, setLogView, clearLogs, exportLogs, setPaused } from '../debug-log.js';
import { createAndWireActions } from './dev-panel.actions.js';
import { initializeDevPanelBehavior } from './dev-panel.behavior.js'; //R16925: we import it but it seems we not use it
import { BUILD_VERSION } from '../../core/constants.js';
import { registerComponent } from '../ui-registry.js';

console.log('dev-panel module loaded. Version:', BUILD_VERSION);

export function initializeDevPanel(engine, DOM, options = {}) {
  const { autoOpen = false, skipDiagnostics = false } = options || {};
  console.log('initializeDevPanel called', { autoOpen, skipDiagnostics });

  const panel = document.createElement('div');
  panel.id = 'acoustsee-dev-panel';
  
  const root = DOM.uiPanelRoot || document.body;
  root.appendChild(panel);

  // Start with the panel hidden. It will be shown by a gesture or if autoOpen is true.
  panel.style.display = 'none';

  // Function to actually show the panel
  function showPanel() {
    if (panel.style.display !== 'none') return; // Already visible
    console.log('Showing dev panel.');
    panel.style.display = 'flex';
  }

  // If autoOpen is true, show it immediately. Otherwise, set up a gesture.
  if (autoOpen) {
    showPanel();
  } else {
    // Set up a long-press gesture on the main container to reveal the panel.
    let pressTimer = null;
    const mainContainer = DOM.mainContainer || document.body;
    mainContainer.addEventListener('pointerdown', () => {
      pressTimer = setTimeout(showPanel, 800);
    });
    mainContainer.addEventListener('pointerup', () => clearTimeout(pressTimer));
    mainContainer.addEventListener('pointerleave', () => clearTimeout(pressTimer));
  }

  // --- HTML STRUCTURE ---
  try {
    panel.innerHTML = `
      <div class="debug-section state-section">
        <h2>State Inspector
          <span id="audio-version-badge" title="Build Version"></span>
        </h2>
        <pre id="debug-state-view">Loading state...</pre>
        <div id="version-footer"></div>
      </div>
      <div class="debug-section controls-section">
        <h2>Controls</h2>
        <div class="controls-grid">
          <div class="control-row"><label>Grid Type<select id="grid-type-select"></select></label></div>
          <div class="control-row"><label>Synth Engine<select id="synth-engine-select"></select></label></div>
          <div class="control-row"><label>Max Notes<input id="max-notes-slider" type="range" min="1" max="128" value="16"><span id="max-notes-value">16</span></label></div>
          <div class="control-row"><label>Motion Threshold<input id="motion-threshold-slider" type="range" min="0" max="1" step="0.01" value="0.20"><span id="motion-threshold-value">0.20</span></label></div>
        </div>
        <div class="debug-actions-grid"></div>
        <div id="worker-explorer-container" style="display:none; margin-top:8px;">
          <div id="worker-explorer-legend"></div>
          <canvas id="worker-explorer-canvas" width="360" height="96"></canvas>
        </div>
      </div>
      <div class="debug-section logs-section">
        <h2>Live Logs</h2>
        <div class="log-controls">
          <button id="log-pause-btn" type="button">Pause</button>
          <button id="log-clear-btn" type="button">Clear</button>
          <button id="log-export-btn" type="button">Export</button>
        </div>
        <div id="debug-log-view"></div>
      </div>
    `;
  } catch (e) {
    panel.textContent = 'Error: Dev panel could not be rendered.';
    return;
  }

  function setupUI() {
    // Reuse previous behavior code (copied and adapted)
    (function initializeDevPanelBehavior() {
        function applyResponsiveLayout() {
            try {
                const isLandscape = window.innerWidth > window.innerHeight;
                if (isLandscape) {
                    Object.assign(panel.style, { position: 'fixed', right: '0', top: '0', width: '400px', height: '100vh', borderLeft: '2px solid #34495e', borderTop: '' });
                } else {
                    Object.assign(panel.style, { position: 'fixed', left: '8px', right: '8px', bottom: '8px', top: 'auto', width: 'calc(100% - 16px)', height: '42vh', borderLeft: 'none', borderTop: '2px solid #34495e', borderRadius: '8px' });
                }
            } catch (e) {}
        }
        (function ensureVideoOnTop() {
            try {
                const videoEl = DOM.videoFeed || document.querySelector('video');
                if (videoEl && !videoEl.style.zIndex) {
                    videoEl.style.position = 'relative';
                    videoEl.style.zIndex = '50';
                }
                panel.style.zIndex = '100';
            } catch(e) {}
        })();
        applyResponsiveLayout();
        window.addEventListener('resize', applyResponsiveLayout, { passive: true });
        window.addEventListener('orientationchange', applyResponsiveLayout, { passive: true });
    })();

    try {
      const versionBadge = panel.querySelector('#audio-version-badge');
      const versionFooter = panel.querySelector('#version-footer');
      const metaVer = document.querySelector('meta[name="acoustsee-version"]')?.getAttribute('content');
      const ver = metaVer || window.ACOUSTSEE_VERSION || window.ACOUSTSEE_APP_VERSION || BUILD_VERSION;
      if (versionBadge) versionBadge.textContent = `v${ver}`;
      if (versionFooter) versionFooter.textContent = `Audio: ${AUDIO_VERSION || 'n/a'} | Video: ${VIDEO_VERSION || 'n/a'} | UI: ${UI_VERSION || ver}`;
    } catch (e) {}

    // worker explorer and video preview wiring replicated here (omitted for brevity)

    try {
      const actionsModule = createAndWireActions(panel, engine, DOM, skipDiagnostics);
      if (actionsModule && typeof actionsModule.dispose === 'function') {
        panel.__devActionsDispose = actionsModule.dispose;
      }
    } catch (e) {
      console.error('initializeDevPanel: createAndWireActions failed', e);
    }

    const stateView = panel.querySelector('#debug-state-view');
    const logView = panel.querySelector('#debug-log-view');
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

    engine.onStateChange(state => {
        try {
            const diags = getAudioDiagnostics();
            if(stateView) stateView.textContent = JSON.stringify({ ...state, audio: diags }, null, 2);
            panel.querySelector('#grid-type-select').value = state.gridType;
            panel.querySelector('#synth-engine-select').value = state.synthesisEngine;
            panel.querySelector('#max-notes-slider').value = state.maxNotes;
            panel.querySelector('#max-notes-value').textContent = state.maxNotes;
            panel.querySelector('#motion-threshold-slider').value = state.motionThreshold;
            panel.querySelector('#motion-threshold-value').textContent = state.motionThreshold;
            panel.querySelector('#auto-fps-checkbox').checked = state.autoFPS;
            panel.querySelector('#enable-frame-worker-checkbox').checked = settings.enableFrameWorker;
        } catch(e) {}
    });

    setOutputCallback((level, text) => debugLog(level, text));
  }

  // Stylesheet loader (uses new path)
  (function ensureDevCss(){
    try{
      const cssId = 'acoustsee-dev-panel-css';
      if (document.getElementById(cssId)) { setupUI(); return; }
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = './dev-panel/dev-panel.css';
      link.onload = () => setupUI();
      link.onerror = (e) => { console.error('Failed to load dev-panel stylesheet', e); setupUI(); };
      document.head.appendChild(link);
    } catch(e) {
      console.error('Exception loading dev-panel stylesheet', e);
      try{ setupUI(); } catch(_){ }
    }
  })();
}

// Register initializer in the ui-registry for other modules to access later
try { registerComponent('initializeDevPanel', initializeDevPanel); } catch (e) {}
