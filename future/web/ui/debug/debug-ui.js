// File: web/ui/debug/debug-ui.js (Version with Race Condition Fix)

import { settings } from '../../core/state.js';
import { setOutputCallback } from '../../utils/core-logger.js';
import { getAudioDiagnostics } from '../../audio/audio-processor.js';
import { debugLog, setLogView } from './debug-log.js';
import { initializeDebugUIBehavior } from './debug-ui.behavior.js';
import { createAndWireActions } from './debug-ui.actions.js';
import { BUILD_VERSION } from '../../core/constants.js';

export function initializeDebugUI(engine, DOM, options = {}) {
  const { autoOpen = true, skipDiagnostics = false } = options || {};

  const panel = document.createElement('div');
  panel.id = 'acoustsee-debug-panel';
  
  const root = DOM.uiPanelRoot || document.body;
  root.appendChild(panel);

  if (!autoOpen) {
    panel.style.display = 'none';
  }

  // --- HTML STRUCTURE ---
  // We set the innerHTML early, so the elements exist in the DOM. This is clean and efficient.
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
          </div>
          <div class="controls-col-right">
            <div class="control-row"><label>Synth Engine<select id="synth-engine-select"></select></label></div>
            <div class="control-row"><label>Motion Threshold<input id="motion-threshold-slider" type="range" min="0" max="1" step="0.01" value="0.20"><span id="motion-threshold-value">0.20</span></label></div>
          </div>
        </div>
        <div class="debug-actions-grid"></div>
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
    console.error('Failed to set panel innerHTML', e);
    return;
  }

  // This function contains all the logic that DEPENDS on the CSS being loaded.
  function setupUI() {
    try {
      initializeDebugUIBehavior({ panel, DOM, settings, engine, skipDiagnostics });
    } catch(e) {
      console.error('initializeDebugUIBehavior failed', e);
    }
    
    try {
      // Pass the panel itself to the actions module so it can find its children.
      createAndWireActions(panel, engine, DOM, skipDiagnostics);
    } catch(e) {
      console.error('createAndWireActions failed', e);
    }

    // Wire up outputs
    const stateView = panel.querySelector('#debug-state-view');
    const logView = panel.querySelector('#debug-log-view');
    setLogView(logView);
    
    engine.onStateChange(state => {
      try {
        const diags = getAudioDiagnostics();
        if(stateView) stateView.textContent = JSON.stringify({ ...state, audio: diags }, null, 2);
      } catch (e) {
         if(stateView) stateView.textContent = JSON.stringify(state, null, 2);
      }
    });

    setOutputCallback((level, text) => debugLog(level, text));
  }

  // --- DYNAMIC STYLESHEET LOADER WITH CALLBACK ---
  (function ensureDebugCss(){
    try{
      const cssId = 'acoustsee-debug-ui-css';
      // If the stylesheet is already in the DOM, run setup immediately.
      if (document.getElementById(cssId)) {
        setupUI();
        return;
      }
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = './ui/debug/debug-ui.css';
      
      // THE CRITICAL FIX: Wait for the stylesheet to load, THEN run setup.
      link.onload = () => {
        console.log('ensureDebugCss: debug-ui.css loaded successfully. Initializing UI behavior.');
        setupUI();
      };
      
      // If CSS fails to load, we still run setup so the user sees a functional, if unstyled, panel.
      link.onerror = (e) => {
        console.error('Failed to load debug stylesheet', e);
        setupUI();
      };
      document.head.appendChild(link);
    } catch(e) {
      console.error('Exception loading debug stylesheet', e);
      // Fallback to run setup even if the link injection fails.
      try { setupUI(); } catch(_) {}
    }
  })();
}
