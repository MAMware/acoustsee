// File: web/ui/debug-ui.js (Complete with all checkboxes)

import { settings } from '../core/state.js';
import { setOutputCallback } from '../utils/core-logger.js';
import { enableFrameWorker, enableWorkerTransfer } from '../video/frame-processor.js';
import { getAudioDiagnostics } from '../audio/audio-processor.js';
import { debugLog, setLogView, clearLogs, exportLogs, setPaused } from './debug-log.js';

export function initializeDebugUI(engine, DOM) {
  const panel = document.createElement('div');
  panel.id = 'acoustsee-debug-panel';
  // keep debug panel visually present but avoid covering video/splash
  panel.style.zIndex = '5';
  // Note: controls are created below; query them after mounting the innerHTML.
  DOM.uiPanelRoot.appendChild(panel);

  panel.innerHTML = `
    <div class="debug-section state-section">
  <h2>State Inspector <span id="audio-state-badge" style="margin-left:8px;padding:2px 6px;border-radius:8px;font-size:10px;vertical-align:middle;">?</span></h2>
      <pre id="debug-state-view">Loading state...</pre>
    </div>
    <div class="debug-section controls-section">
      <h2>Controls</h2>

      <!-- two-column controls grid -->
      <div class="controls-grid" style="display:grid; grid-template-columns: 1fr 1fr; gap:10px; align-items:start;">

        <!-- LEFT COLUMN -->
        <div class="controls-col-left" style="display:flex; flex-direction:column; gap:8px;">
          <div class="control-row">
            <label style="display:flex; flex-direction:column; font-size:13px;">Grid Type
              <select id="grid-type-select" style="margin-top:6px;">
                <!-- options populated by JS -->
              </select>
            </label>
          </div>

          <div class="control-row">
            <label style="display:flex; align-items:center; gap:8px; font-size:13px;">
              Max Notes
              <input id="max-notes-slider" type="range" min="1" max="128" value="16" style="flex:1;">
              <span id="max-notes-value" style="width:36px; text-align:right;">16</span>
            </label>
          </div>

          <div class="control-row" style="display:flex; gap:12px; align-items:center;">
            <label style="display:flex; align-items:center; gap:6px;"><input id="auto-fps-checkbox" type="checkbox"> Auto FPS</label>
            <label style="display:flex; align-items:center; gap:6px;"><input id="enable-frame-worker-checkbox" type="checkbox"> Enable Frame Worker</label>
          </div>
        </div>

        <!-- RIGHT COLUMN -->
        <div class="controls-col-right" style="display:flex; flex-direction:column; gap:8px;">
          <div class="control-row">
            <label style="display:flex; flex-direction:column; font-size:13px;">Synth Engine
              <select id="synth-engine-select" style="margin-top:6px;">
                <!-- options populated by JS -->
              </select>
            </label>
          </div>

          <div class="control-row">
            <label style="display:flex; align-items:center; gap:8px; font-size:13px;">
              Motion Threshold
              <input id="motion-threshold-slider" type="range" min="0" max="1" step="0.01" value="0.20" style="flex:1;">
              <span id="motion-threshold-value" style="width:48px; text-align:right;">0.20</span>
            </label>
          </div>

          <div class="control-row" style="display:flex; gap:12px; align-items:center;">
            <label style="display:flex; align-items:center; gap:6px;"><input id="enable-frame-buffer-checkbox" type="checkbox"> Enable Frame Buffer Transfer</label>
            <label style="display:flex; align-items:center; gap:6px;"><input id="include-process-logs-checkbox" type="checkbox"> Include Process Frame Logs</label>
          </div>
        </div>

      </div>
    </div>
    <div class="debug-section logs-section">
      <h2>Live Logs</h2>
      <div class="log-controls" style="display:flex; align-items:center; gap:8px;">
        <button id="log-pause-btn" type="button">Pause</button>
        <label style="margin-left:8px; font-size:12px;">
          <input id="autoscroll-checkbox" type="checkbox" checked style="vertical-align:middle; margin-right:6px;"> Autoscroll
        </label>
        <button id="log-clear-btn" type="button" style="margin-left:8px;">Clear</button>
        <button id="log-export-btn" type="button" style="margin-left:4px;">Export</button>

        <!-- push verbosity control to the right of export -->
        <div style="margin-left:auto; display:flex; align-items:center; gap:8px;">
          <label style="font-size:12px; display:flex; align-items:center; gap:6px;">
            Verbosity
            <select id="log-verbosity-select" style="margin-left:6px;">
              <option value="ERROR">ERROR</option>
              <option value="WARN">WARN</option>
              <option value="INFO" selected>INFO</option>
              <option value="DEBUG">DEBUG</option>
              <option value="VERBOSE">VERBOSE</option>
            </select>
          </label>
        </div>
      </div>
      <div id="debug-log-view"></div>
    </div>
  `;

  // show version badge (meta tag -> global constant -> fallback)
  (function setVersionBadge() {
    try {
      const meta = document.querySelector('meta[name="acoustsee-version"]')?.getAttribute('content');
      const ver = meta || window.ACOUSTSEE_VERSION || window.ACOUSTSEE_APP_VERSION || null;
      if (ver) {
        const badge = document.getElementById('audio-state-badge');
        if (badge) {
          badge.textContent = ver;
          badge.style.background = '#111';
          badge.style.color = '#9ad';
          badge.style.border = '1px solid rgba(255,255,255,0.04)';
        }
      }
    } catch (e) {}
  })();

  // Poll for engine context and show a friendly loading message until it's available.
  (function waitForContext() {
    const stateView = document.getElementById('debug-state-view');
    if (!stateView) return;
    const displayLoading = () => {
      stateView.textContent = 'Loading context...';
      stateView.style.color = '';
    };
    displayLoading();

    const getContext = () => {
      try {
        if (engine == null) return null;
        if (engine.context) return engine.context;
        if (typeof engine.getContext === 'function') return engine.getContext();
        if (typeof engine.get === 'function') return engine.get('context');
      } catch (e) { /* ignore */ }
      return null;
    };

    const start = Date.now();
    const timeoutMs = 7000;
    const iv = setInterval(() => {
      const ctx = getContext();
      if (ctx) {
        clearInterval(iv);
        try {
          const summary = typeof ctx === 'object' ? JSON.stringify({ id: ctx.id, state: ctx.state || ctx.status || 'ready' }) : String(ctx);
          stateView.textContent = `Context: ${summary}`;
          stateView.style.color = '';
        } catch (e) {
          stateView.textContent = 'Context available';
          stateView.style.color = '';
        }
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        stateView.textContent = 'No context (not initialized)';
        stateView.style.color = '#c46';
      }
    }, 200);
  })();

  const styles = `
    #acoustsee-debug-panel {
      position: fixed; /* ensure predictable placement and avoid overlaying other UI */
      right: 0;
      top: 0;
      width: 400px;
      height: 100vh;
      background-color: #2c3e50;
      color: #ecf0f1;
      font-family: monospace;
      font-size: 12px;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      border-left: 2px solid #34495e;
      box-sizing: border-box;
      z-index: 1000;
    }
    .debug-section {
      padding: 10px;
      border-bottom: 1px solid #34495e;
      display: flex;
      flex-direction: column;
      
      overflow: visible;
      min-height: 0;
    }
    .debug-section h2 {
      margin: 0 0 10px 0;
      font-size: 14px;
      color: #3498db;
      border-bottom: 1px solid #3498db;
      padding-bottom: 5px;
      flex-shrink: 0;
    }
    .state-section {
      flex-shrink: 0;
      max-height: 25%;
      min-height: 0;
    }
    #debug-state-view {
      background: #222;
      padding: 5px;
      white-space: pre-wrap;
      word-break: break-all;
      overflow-y: auto;
      max-height: 100%;
    }
    .controls-section {
      flex-shrink: 0;
      max-height: 40%;
      min-height: 0;
    }
    #debug-controls {
      overflow-y: auto;
      padding-right: 5px;
      max-height: 100%;
    }
    .logs-section {
      flex-grow: 1;
      display: flex;
      flex-direction: column;
      min-height: 0; 
    }
    #debug-log-view {
      flex: 1 1 auto;
      min-height: 0;    
      overflow-y: auto; 
      background: #222;
      padding: 5px;
    }
    .log-controls {
      display: flex;
      align-items: center;
      gap: 6px;
      margin-bottom: 6px;
    }
    .log-controls button {
      background: #3b4b5a;
      color: #ecf0f1;
      border: 1px solid #556;
      padding: 4px 8px;
      border-radius: 3px;
      cursor: pointer;
      font-size: 12px;
    }
    .log-controls button:hover { background: #4a5b6b; }
    .log-timestamp { color: #95a5a6; margin-right: 6px; font-size: 11px; }
    .log-badge { background: #444; padding: 2px 6px; border-radius: 4px; margin-right: 6px; font-weight: 600; font-size: 11px; }
    .log-badge.error { background: #7f2b2b; color: #fff; }
    .log-badge.warn { background: #8a6600; color: #fff; }
    .log-badge.info { background: #2d6a9f; color: #fff; }
    .log-badge.debug { background: #5a5566; color: #fff; }
    .log-badge.verbose { background: #444; color: #fff; }
    .log-text { color: #ddd; white-space: pre-wrap; }
    .log-entry { /* Renamed for clarity */
      border-bottom: 1px dotted #444;
      padding-bottom: 3px;
      margin-bottom: 3px;
    }
    .log-warn { color: #f39c12; }
    .log-error { color: #e74c3c; font-weight: bold; }

    /* --- RESTORED CONTROL STYLES --- */
    .control-group {
      margin-bottom: 10px;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
    }
    .control-group label {
      flex-basis: 120px; /* Give labels a fixed width */
      padding-right: 10px;
    }
    .control-group select, .control-group input, .control-group button {
      flex-grow: 1;
      background: #34495e;
      color: #ecf0f1;
      border: 1px solid #7f8c8d;
      border-radius: 3px;
      padding: 4px;
      box-sizing: border-box;
    }
    .control-group input[type="checkbox"] {
      flex-grow: 0;
      margin-right: 10px;
    }
    .control-group .slider-value { /* Renamed for clarity */
      margin-left: 10px;
      flex-basis: 30px;
    }
    .control-group button {
      cursor: pointer;
      background: #2980b9;
      flex-basis: 100%;
      margin-top: 5px;
    }
    .control-group button:hover { background: #3498db; }
  `;

  const styleSheet = document.createElement("style");
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);

  // --- 2. POPULATE CONTROLS (populate the two-column grid and action buttons) ---
  const controlsGrid = panel.querySelector('.controls-grid');
  // create an actions container (for start/stop, test note, resume, etc.) after the grid
  let actionsContainer = panel.querySelector('#debug-controls-actions');
  if (!actionsContainer) {
    actionsContainer = document.createElement('div');
    actionsContainer.id = 'debug-controls-actions';
    actionsContainer.style.marginTop = '10px';
    controlsGrid.parentNode.insertBefore(actionsContainer, controlsGrid.nextSibling);
  }

  // populate selects from settings
  const gridTypeEl = panel.querySelector('#grid-type-select');
  settings.availableGrids.forEach(g => {
    const opt = document.createElement('option'); opt.value = g.id; opt.textContent = g.id; gridTypeEl.appendChild(opt);
  });

  const synthEngineEl = panel.querySelector('#synth-engine-select');
  settings.availableEngines.forEach(e => {
    const opt = document.createElement('option'); opt.value = e.id; opt.textContent = e.id; synthEngineEl.appendChild(opt);
  });

  const maxNotesEl = panel.querySelector('#max-notes-slider');
  const maxNotesValueEl = panel.querySelector('#max-notes-value');
  const motionEl = panel.querySelector('#motion-threshold-slider');
  const motionValueEl = panel.querySelector('#motion-threshold-value');
  const autoFpsEl = panel.querySelector('#auto-fps-checkbox');
  const workerEl = panel.querySelector('#enable-frame-worker-checkbox');
  const transferEl = panel.querySelector('#enable-frame-buffer-checkbox');
  const includeProcessEl = panel.querySelector('#include-process-logs-checkbox');
  const verbosityEl = panel.querySelector('#log-verbosity-select');

  // create action buttons and append to actionsContainer
  const startStopBtn = createButton('Start/Stop Processing');
  const emitTestNoteBtn = createButton('Emit Test Note');
  const resumeAudioBtn = createButton('Resume Audio');
  const logAudioDiagsBtn = createButton('Log Audio Diags');
  const saveBtn = createButton('Save Settings');
  const loadBtn = createButton('Load Settings');
  actionsContainer.append(startStopBtn, emitTestNoteBtn, resumeAudioBtn, logAudioDiagsBtn, saveBtn, loadBtn);

  // --- 3. WIRE UP INPUTS (Now adapted to the new DOM) ---
  gridTypeEl.addEventListener('change', (e) => engine.dispatch('setGridType', { gridType: e.target.value }));
  synthEngineEl.addEventListener('change', (e) => engine.dispatch('setSynthEngine', { synthEngine: e.target.value }));
  maxNotesEl.addEventListener('input', (e) => { engine.dispatch('setMaxNotes', { maxNotes: e.target.value }); maxNotesValueEl.textContent = e.target.value; });
  motionEl.addEventListener('input', (e) => { engine.dispatch('setMotionThreshold', { motionThreshold: e.target.value }); motionValueEl.textContent = e.target.value; });
  autoFpsEl.addEventListener('change', (e) => engine.dispatch('setAutoFPS', { enabled: e.target.checked }));

  workerEl.addEventListener('change', (e) => {
    settings.enableFrameWorker = e.target.checked;
    enableFrameWorker(e.target.checked);
  });
  transferEl.addEventListener('change', (e) => {
    settings.workerTransferEnabled = e.target.checked;
    enableWorkerTransfer(e.target.checked);
  });

  // verbosity state
  let currentVerbosity = 'INFO';
  let includeProcessFrameLogs = !!settings.includeProcessFrameLogs;

  verbosityEl.value = currentVerbosity;
  verbosityEl.addEventListener('change', (e) => { currentVerbosity = e.target.value; });
  includeProcessEl.checked = includeProcessFrameLogs;
  includeProcessEl.addEventListener('change', (e) => { includeProcessFrameLogs = e.target.checked; settings.includeProcessFrameLogs = e.target.checked; });

  startStopBtn.querySelector('button').addEventListener('click', async () => {
    try {
      await engine.dispatch('toggleProcessing', { videoEl: DOM.videoFeed, canvasEl: DOM.frameCanvas });
    } catch (e) {
      // fallback: check state and call start/stop explicitly
      console.warn('toggleProcessing failed, falling back to start/stop', e);
      const isProcessing = engine.getState ? engine.getState().isProcessing : false;
      if (isProcessing) {
        await engine.dispatch('stopProcessing', { videoEl: DOM.videoFeed });
      } else {
        await engine.dispatch('startProcessing', { videoEl: DOM.videoFeed, canvasEl: DOM.frameCanvas });
      }
    }
  });
  emitTestNoteBtn.querySelector('button').addEventListener('click', async () => {
    try {
      await engine.dispatch('playTestNote', { pitch: 440 });
    } catch (err) {
      console.error('playTestNote failed', err);
    }
  });
  resumeAudioBtn.querySelector('button').addEventListener('click', async () => {
    try {
      const res = await engine.dispatch('resumeAudio');
  const msg = res?.ok ? `Audio resumed: ${res.state}` : `Resume failed: ${res?.error || 'unknown'}`;
  debugLog('INFO', msg);
      // update badge immediately
      try { const diags = getAudioDiagnostics(); const badge = document.getElementById('audio-state-badge'); if (badge) { badge.textContent = diags.audioContextState; badge.style.background = diags.audioContextState === 'running' ? '#2ecc71' : '#e74c3c'; }} catch(e){}
    } catch (e) { console.error('resumeAudio dispatch failed', e); }
  });
  logAudioDiagsBtn.querySelector('button').addEventListener('click', () => {
    try {
      const diags = getAudioDiagnostics();
      console.log('Audio diagnostics:', diags);
  debugLog('INFO', `Audio diags: ${JSON.stringify(diags)}`);
    } catch (e) { console.error('Failed to get audio diags', e); }
  });
  saveBtn.querySelector('button').addEventListener('click', () => engine.dispatch('saveSettings'));
  loadBtn.querySelector('button').addEventListener('click', () => engine.dispatch('loadSettings'));

  // --- 4. WIRE UP OUTPUTS (Now complete) ---
  const stateView = panel.querySelector('#debug-state-view');
  const logView = panel.querySelector('#debug-log-view');
  setLogView(logView, { maxEntries: 1000 });

  // now that logView exists, wire up the log controls we added earlier
  const logPauseBtn = panel.querySelector('#log-pause-btn');
  const autoscrollCheckbox = panel.querySelector('#autoscroll-checkbox');
  const logClearBtn = panel.querySelector('#log-clear-btn');
  const logExportBtn = panel.querySelector('#log-export-btn');

  logPauseBtn.addEventListener('click', () => {
    const isPaused = logPauseBtn.textContent === 'Pause';
    setPaused(!isPaused);
    logPauseBtn.textContent = isPaused ? 'Resume' : 'Pause';
  });
  logClearBtn.addEventListener('click', () => {
    clearLogs();
  });
  logExportBtn.addEventListener('click', () => {
    try {
      const data = exportLogs();
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `acoustsee-logs-${new Date().toISOString()}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error('Failed to export logs', e); }
  });

  // no-op: setLogView flushed buffered logs

  engine.onStateChange(state => {
    // ... (all the other state syncs are unchanged)
    autoFpsCheckbox.querySelector('input').checked = state.autoFPS;
    workerCheckbox.querySelector('input').checked = !!state.enableFrameWorker;
    transferCheckbox.querySelector('input').checked = !!state.workerTransferEnabled;
    startStopBtn.querySelector('button').textContent = state.isProcessing ? 'Stop Processing' : 'Start Processing';
    // Update state inspector with audio diagnostics and badge
    try {
      const diags = getAudioDiagnostics();
      stateView.textContent = JSON.stringify({ ...state, audio: diags }, null, 2);
      const badge = document.getElementById('audio-state-badge');
      if (badge) {
        const s = diags.audioContextState || 'no-context';
        badge.textContent = s;
        badge.style.background = s === 'running' ? '#2ecc71' : '#e74c3c';
        badge.style.color = '#061019';
      }
    } catch (e) {
      stateView.textContent = JSON.stringify(state, null, 2);
    }
  });
  setOutputCallback((level, text) => {
    const severity = ['ERROR','WARN','INFO','DEBUG','VERBOSE'];
    const lvl = String(level || '').toUpperCase();
    const lvlIndex = severity.indexOf(lvl) === -1 ? severity.indexOf('INFO') : severity.indexOf(lvl);
    const currentIndex = severity.indexOf(currentVerbosity);

    // filter out hot-path messages unless explicitly allowed
    if (typeof text === 'string' && text.includes('processFrame') && !includeProcessFrameLogs) return;

    // respect verbosity
    if (lvlIndex > currentIndex) return;

  // route to module-level debug API
  debugLog(lvl, text);
  });
}

// --- Helper functions (These should all be present and correct) ---
function createControlGroup(label) {
  const wrapper = document.createElement('div');
  wrapper.className = 'control-group';
  if (label) {
    const lab = document.createElement('label');
    lab.textContent = label;
    wrapper.appendChild(lab);
  }
  return wrapper;
}

function createSelect(label, options = []) {
  const group = createControlGroup(label);
  const select = document.createElement('select');
  options.forEach(o => {
    const opt = document.createElement('option');
    opt.value = o;
    opt.textContent = o;
    select.appendChild(opt);
  });
  group.appendChild(select);
  return group;
}

function createSlider(label, min = 0, max = 100, step = 1) {
  const group = createControlGroup(label);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  input.value = min;
  const value = document.createElement('span');
  value.className = 'slider-value';
  value.textContent = input.value;
  group.appendChild(input);
  group.appendChild(value);
  return group;
}

function createCheckbox(label) {
  const group = createControlGroup(label);
  const input = document.createElement('input');
  input.type = 'checkbox';
  group.appendChild(input);
  return group;
}

function createButton(label) {
  const group = createControlGroup();
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  group.appendChild(btn);
  return group;
}

// (start/stop handler lives inside initializeDebugUI to keep scope correct)