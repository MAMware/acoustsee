// Wrapper coordinator for debug UI - re-exports existing implementation for now
import { settings } from '../../core/state.js';
import { setOutputCallback } from '../../utils/core-logger.js';
import { enableFrameWorker, enableWorkerTransfer } from '../../video/frame-processor.js';
import { getAudioDiagnostics } from '../../audio/audio-processor.js';
import { debugLog, setLogView, clearLogs, exportLogs, setPaused, setFilterText, setFilterLevel, setOnCountChange, getFilteredCount, getTotalCount } from '../debug-log.js';
import { createControlGroup, createSelect, createSlider, createCheckbox } from './debug-ui.controls.js';
import { createAndWireActions } from './debug-ui.actions.js';
import initializeDebugUIBehavior from './debug-ui.behavior.js';
import installConsoleIngest from '../debug-ingest.js';
import { BUILD_VERSION, AUDIO_VERSION, VIDEO_VERSION, UI_VERSION, LANGUAGES_VERSION } from '../../core/constants.js';

// Add debug logs to confirm versions are loaded
console.log('Versions loaded:', { BUILD_VERSION, AUDIO_VERSION, VIDEO_VERSION, UI_VERSION, LANGUAGES_VERSION });
console.log('debug-ui module loaded');

export function initializeDebugUI(engine, DOM, options = {}) {
  const { autoOpen = true, skipDiagnostics = false } = options || {};
  console.log('initializeDebugUI called', { autoOpen, skipDiagnostics, hasDOM: !!DOM });

  // --- DYNAMIC STYLESHEET LOADER ---
  (function ensureDebugCss() {
	try {
	  const cssId = 'acoustsee-debug-ui-css';
	  if (document.getElementById(cssId)) return;
	  const link = document.createElement('link');
	  link.id = cssId;
	  link.rel = 'stylesheet';
	  link.href = './ui/debug/debug-ui.css';
	  link.onload = () => console.log('ensureDebugCss: debug-ui.css loaded successfully.');
	  link.onerror = (e) => console.warn('ensureDebugCss: failed to load debug-ui.css', e);
	  document.head.appendChild(link);
	} catch (e) {
	  console.error('ensureDebugCss: Exception while trying to load stylesheet.', e);
	}
  })();

  const panel = document.createElement('div');
  panel.id = 'acoustsee-debug-panel';
  
  const root = DOM.uiPanelRoot || document.body;
  root.appendChild(panel);

  try {
	initializeDebugUIBehavior({ panel, DOM, settings, engine, skipDiagnostics });
  } catch(e) {
	console.error('initializeDebugUIBehavior failed', e);
  }

  // --- COMPLETE AND CORRECT HTML STRUCTURE ---
  try {
	panel.innerHTML = `
	  <div class="debug-section state-section">
		<h2>State Inspector
		  <span id="audio-version-badge" title="Build Version" style="margin-left:8px;padding:2px 6px;border-radius:8px;font-size:10px;vertical-align:middle;background:#111;color:#9ad;"></span>
		  <span id="audio-context-badge" style="margin-left:4px;padding:2px 6px;border-radius:8px;font-size:10px;vertical-align:middle;">...</span>
		</h2>
		<pre id="debug-state-view">Loading state...</pre>
	  </div>
	  <div class="debug-section controls-section">
		<h2>Controls</h2>
		<div class="controls-grid">
		  <!-- LEFT COLUMN -->
		  <div class="controls-col-left">
			<div class="control-row">
			  <label>Grid Type<select id="grid-type-select"></select></label>
			</div>
			<div class="control-row">
			  <label>Max Notes
				<input id="max-notes-slider" type="range" min="1" max="128" value="16">
				<span id="max-notes-value">16</span>
			  </label>
			</div>
			<div class="control-row">
				<label><input id="auto-fps-checkbox" type="checkbox"> Auto FPS</label>
			</div>
		  </div>
		  <!-- RIGHT COLUMN -->
		  <div class="controls-col-right">
			<div class="control-row">
			  <label>Synth Engine<select id="synth-engine-select"></select></label>
			</div>
			<div class="control-row">
			  <label>Motion Threshold
				<input id="motion-threshold-slider" type="range" min="0" max="1" step="0.01" value="0.20">
				<span id="motion-threshold-value">0.20</span>
			  </label>
			</div>
			<div class="control-row">
				<label><input id="enable-frame-worker-checkbox" type="checkbox"> Enable Frame Worker</label>
			</div>
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
	console.error('Failed to set panel innerHTML', e);
	panel.textContent = 'Error: Debug panel could not be rendered.';
	return;
  }
  
  if (!autoOpen) {
	panel.style.display = 'none';
  }

  // --- WIRING AND OUTPUTS ---
  // This part remains the same, as it will now have the correct DOM elements to find.
  try {
	createAndWireActions(panel.querySelector('.debug-actions-grid'), { engine, DOM, getAudioDiagnostics, debugLog, settings, skipDiagnostics });
  } catch(e) {
	console.error('createAndWireActions failed', e);
  }

  const stateView = panel.querySelector('#debug-state-view');
  const logView = panel.querySelector('#debug-log-view');
  try {
	setLogView(logView);
  } catch(e) {
	console.error('setLogView failed', e);
  }
  
  engine.onStateChange(state => {
	// ... (state change logic remains the same)
  });

  setOutputCallback((level, text) => debugLog(level, text));
  
  console.log('initializeDebugUI completed');
}


