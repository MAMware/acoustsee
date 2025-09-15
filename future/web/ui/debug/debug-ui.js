// File: web/ui/debug/debug-ui.js (Definitive Consolidated Version)

import { settings } from '../../core/state.js';
import { setOutputCallback } from '../../utils/core-logger.js';
import { getAudioDiagnostics } from '../../audio/audio-processor.js';
import { debugLog, setLogView } from '../debug-log.js';
import { createAndWireActions } from './debug-ui.actions.js';
import { initializeDebugUIBehavior } from './debug-ui.behavior.js';
import { BUILD_VERSION } from '../../core/constants.js';

console.log('debug-ui module loaded. Version:', BUILD_VERSION);

export function initializeDebugUI(engine, DOM, options = {}) {
  const { autoOpen = false, skipDiagnostics = false } = options || {};
  console.log('initializeDebugUI called', { autoOpen, skipDiagnostics });

  const panel = document.createElement('div');
  panel.id = 'acoustsee-debug-panel';
  
  const root = DOM.uiPanelRoot || document.body;
  root.appendChild(panel);

  // Start with the panel hidden. It will be shown by a gesture or if autoOpen is true.
  panel.style.display = 'none';

  // Function to actually show the panel
  function showPanel() {
    if (panel.style.display !== 'none') return; // Already visible
    console.log('Showing debug panel.');
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
          <span id="audio-version-badge" title="Build Version">v${BUILD_VERSION}</span>
          <span id="audio-context-badge">...</span>
        </h2>
        <pre id="debug-state-view">Loading state...</pre>
      </div>
      <div class="debug-section controls-section">
        <h2>Controls</h2>
        <div class="controls-grid">
          <div class="controls-col-left">
            <div class="control-row"><label>Grid Type<select id="grid-type-select"></select></label></div>
            <div class="control-row"><label>Max Notes<input id="max-notes-slider" type="range" min="1" max="128" value="16"><span id="max-notes-value">16</span></label></div>
             <div class="control-row"><label><input id="auto-fps-checkbox" type="checkbox"> Auto FPS</label></div>
          </div>
          <div class="controls-col-right">
            <div class="control-row"><label>Synth Engine<select id="synth-engine-select"></select></label></div>
            <div class="control-row"><label>Motion Threshold<input id="motion-threshold-slider" type="range" min="0" max="1" step="0.01" value="0.20"><span id="motion-threshold-value">0.20</span></label></div>
            <div class="control-row"><label><input id="enable-frame-worker-checkbox" type="checkbox"> Enable Frame Worker</label></div>
          </div>
        </div>
        <div class="debug-actions-grid">
          <div class="control-group"><button data-action="toggleProcessing">Start/Stop Processing</button></div>
          <div class="control-group"><button data-action="playTestNote">Emit Test Note</button></div>
          <div class="control-group"><button data-action="resumeAudio">Resume Audio</button></div>
          <div class="control-group"><button data-action="saveSettings">Save Settings</button></div>
          <div class="control-group"><button data-action="loadSettings">Load Settings</button></div>
          <div class="control-group"><button data-action="toggleWorkerExplorer">Worker Explorer</button></div>
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
    panel.textContent = 'Error: Debug panel could not be rendered.';
    return;
  }

  // This function contains all the logic that DEPENDS on the CSS being loaded.
  function setupUI() {
    // --- CONSOLIDATED BEHAVIOR ---
    (function initializeDebugUIBehavior() {
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

  // --- Wire actions via the modular actions module ---
  try {
    const actionsModule = createAndWireActions(panel, engine, DOM, skipDiagnostics);
    // store dispose handle on the panel for potential teardown
    if (actionsModule && typeof actionsModule.dispose === 'function') {
      panel.__debugActionsDispose = actionsModule.dispose;
    }
  } catch (e) {
    console.error('initializeDebugUI: createAndWireActions failed', e);
  }

    // --- OUTPUT WIRING ---
    const stateView = panel.querySelector('#debug-state-view');
    const logView = panel.querySelector('#debug-log-view');
    setLogView(logView);

    // Populate the visible version badge early so it's visible immediately
    try {
      const versionBadge = panel.querySelector('#audio-version-badge');
      const metaVer = document.querySelector('meta[name="acoustsee-version"]')?.getAttribute('content');
      const ver = metaVer || window.ACOUSTSEE_VERSION || window.ACOUSTSEE_APP_VERSION || null;
      if (ver && versionBadge) versionBadge.textContent = `v${ver}`;
    } catch (e) {}

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
            // Sync UI to state
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

  // --- STYLESHEET LOADER WITH CALLBACK ---
  (function ensureDebugCss(){
    try{
      const cssId = 'acoustsee-debug-ui-css';
      if (document.getElementById(cssId)) { setupUI(); return; }
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = './ui/debug/debug-ui.css'; // Corrected path
      link.onload = () => setupUI();
      link.onerror = (e) => { console.error('Failed to load debug stylesheet', e); setupUI(); };
      document.head.appendChild(link);
    } catch(e) {
      console.error('Exception loading debug stylesheet', e);
      try{ setupUI(); } catch(_){}
    }
  })();
}