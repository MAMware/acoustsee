// File: web/ui/debug-ui.js (Complete with all checkboxes)

import { settings } from '../core/state.js';
import { setOutputCallback } from '../utils/core-logger.js';
import { enableFrameWorker, enableWorkerTransfer } from '../video/frame-processor.js';
import { getAudioDiagnostics } from '../audio/audio-processor.js';

// Module-level logging API and state so callers outside initializeDebugUI can log safely.
let moduleLogView = null;
let moduleLogsPaused = false;
const MAX_LOG_ENTRIES = 1000; // capped circular buffer
const moduleLogBuffer = [];

function formatTimestamp(d = new Date()) {
  return d.toISOString().replace('T', ' ').replace('Z', '');
}

function createLogRow(entry) {
  const row = document.createElement('div');
  row.className = 'log-entry';
  const ts = document.createElement('span'); ts.className = 'log-timestamp'; ts.textContent = formatTimestamp(new Date(entry.t));
  const badge = document.createElement('span'); badge.className = `log-badge ${entry.level.toLowerCase()}`; badge.textContent = entry.level;
  const txt = document.createElement('span'); txt.className = 'log-text'; txt.textContent = entry.text;
  row.appendChild(ts); row.appendChild(badge); row.appendChild(txt);
  return row;
}

export function debugLog(level, text) {
  const lvl = String(level || 'INFO').toUpperCase();
  const entry = { t: Date.now(), level: lvl, text: typeof text === 'string' ? text : JSON.stringify(text) };
  moduleLogBuffer.push(entry);
  if (moduleLogBuffer.length > MAX_LOG_ENTRIES) moduleLogBuffer.shift();

  if (moduleLogsPaused) return;
  if (!moduleLogView) return; // will be flushed once UI mounts

  const row = createLogRow(entry);
  moduleLogView.appendChild(row);
  while (moduleLogView.children.length > MAX_LOG_ENTRIES) moduleLogView.removeChild(moduleLogView.firstChild);
  const autoscroll = document.getElementById('autoscroll-checkbox')?.checked ?? true;
  if (autoscroll) moduleLogView.scrollTop = moduleLogView.scrollHeight;
}

// compatibility shim for non-module callers
if (typeof window !== 'undefined' && !window.acoustseeDebugLog) window.acoustseeDebugLog = debugLog;

export function initializeDebugUI(engine, DOM) {
  const panel = document.createElement('div');
  panel.id = 'acoustsee-debug-panel';
  // Note: controls are created below; query them after mounting the innerHTML.
  DOM.uiPanelRoot.appendChild(panel);

  panel.innerHTML = `
    <div class="debug-section state-section">
  <h2>State Inspector <span id="audio-state-badge" style="margin-left:8px;padding:2px 6px;border-radius:8px;font-size:10px;vertical-align:middle;">?</span></h2>
      <pre id="debug-state-view">Loading state...</pre>
    </div>
    <div class="debug-section controls-section">
      <h2>Controls</h2>
      <div id="debug-controls"></div>
    </div>
    <div class="debug-section logs-section">
      <h2>Live Logs</h2>
      <div class="log-controls">
        <button id="log-pause-btn" type="button">Pause</button>
        <label style="margin-left:8px; font-size:12px;">
          <input id="autoscroll-checkbox" type="checkbox" checked style="vertical-align:middle; margin-right:6px;"> Autoscroll
        </label>
        <button id="log-clear-btn" type="button" style="margin-left:8px;">Clear</button>
        <button id="log-export-btn" type="button" style="margin-left:4px;">Export</button>
      </div>
      <div id="debug-log-view"></div>
    </div>
  `;

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

  // --- 2. POPULATE CONTROLS (This section is now fully correct) ---
  const controlsContainer = panel.querySelector('#debug-controls');
  
  const gridSelect = createSelect('Grid Type', settings.availableGrids.map(g => g.id));
  const synthSelect = createSelect('Synth Engine', settings.availableEngines.map(e => e.id));
  const maxNotesSlider = createSlider('Max Notes', 1, 100, 1);
  const motionSlider = createSlider('Motion Threshold', 1, 255, 5);
  const autoFpsCheckbox = createCheckbox('Auto FPS');
  const workerCheckbox = createCheckbox('Enable Frame Worker');
  const transferCheckbox = createCheckbox('Enable Buffer Transfer');

  const verbositySelect = createSelect('Log Verbosity', ['ERROR','WARN','INFO','DEBUG','VERBOSE']);
  const includeProcessFrameCheckbox = createCheckbox('Include processFrame logs');

  const startStopBtn = createButton('Start/Stop Processing');
  const emitTestNoteBtn = createButton('Emit Test Note');
  const resumeAudioBtn = createButton('Resume Audio');
  const logAudioDiagsBtn = createButton('Log Audio Diags');
  const saveBtn = createButton('Save Settings');
  const loadBtn = createButton('Load Settings');

  controlsContainer.append(
    gridSelect, synthSelect, maxNotesSlider, motionSlider,
    autoFpsCheckbox, workerCheckbox, transferCheckbox,
    verbositySelect, includeProcessFrameCheckbox,
  startStopBtn, emitTestNoteBtn, resumeAudioBtn, logAudioDiagsBtn, saveBtn, loadBtn
  );
  
  // --- 3. WIRE UP INPUTS (Now complete) ---
  gridSelect.querySelector('select').addEventListener('change', (e) => engine.dispatch('setGridType', { gridType: e.target.value }));
  synthSelect.querySelector('select').addEventListener('change', (e) => engine.dispatch('setSynthEngine', { synthEngine: e.target.value }));
  maxNotesSlider.querySelector('input').addEventListener('input', (e) => { engine.dispatch('setMaxNotes', { maxNotes: e.target.value }); maxNotesSlider.querySelector('span').textContent = e.target.value; });
  motionSlider.querySelector('input').addEventListener('input', (e) => { engine.dispatch('setMotionThreshold', { motionThreshold: e.target.value }); motionSlider.querySelector('span').textContent = e.target.value; });
  autoFpsCheckbox.querySelector('input').addEventListener('change', (e) => engine.dispatch('setAutoFPS', { enabled: e.target.checked }));

  workerCheckbox.querySelector('input').addEventListener('change', (e) => {
    settings.enableFrameWorker = e.target.checked;
    enableFrameWorker(e.target.checked);
  });
  transferCheckbox.querySelector('input').addEventListener('change', (e) => {
    settings.workerTransferEnabled = e.target.checked;
    enableWorkerTransfer(e.target.checked);
  });

  // verbosity state
  let currentVerbosity = 'INFO';
  let includeProcessFrameLogs = !!settings.includeProcessFrameLogs;

  verbositySelect.querySelector('select').value = currentVerbosity;
  verbositySelect.querySelector('select').addEventListener('change', (e) => { currentVerbosity = e.target.value; });
  includeProcessFrameCheckbox.querySelector('input').checked = includeProcessFrameLogs;
  includeProcessFrameCheckbox.querySelector('input').addEventListener('change', (e) => { includeProcessFrameLogs = e.target.checked; settings.includeProcessFrameLogs = e.target.checked; });

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
  logMessage('INFO', msg);
      // update badge immediately
      try { const diags = getAudioDiagnostics(); const badge = document.getElementById('audio-state-badge'); if (badge) { badge.textContent = diags.audioContextState; badge.style.background = diags.audioContextState === 'running' ? '#2ecc71' : '#e74c3c'; }} catch(e){}
    } catch (e) { console.error('resumeAudio dispatch failed', e); }
  });
  logAudioDiagsBtn.querySelector('button').addEventListener('click', () => {
    try {
      const diags = getAudioDiagnostics();
      console.log('Audio diagnostics:', diags);
  logMessage('INFO', `Audio diags: ${JSON.stringify(diags)}`);
    } catch (e) { console.error('Failed to get audio diags', e); }
  });
  saveBtn.querySelector('button').addEventListener('click', () => engine.dispatch('saveSettings'));
  loadBtn.querySelector('button').addEventListener('click', () => engine.dispatch('loadSettings'));

  // --- 4. WIRE UP OUTPUTS (Now complete) ---
  const stateView = panel.querySelector('#debug-state-view');
  const logView = panel.querySelector('#debug-log-view');
  moduleLogView = logView;

  // now that logView exists, wire up the log controls we added earlier
  const logPauseBtn = panel.querySelector('#log-pause-btn');
  const autoscrollCheckbox = panel.querySelector('#autoscroll-checkbox');
  const logClearBtn = panel.querySelector('#log-clear-btn');
  const logExportBtn = panel.querySelector('#log-export-btn');

  let logsPaused = false; // local toggle mirrored to moduleLogsPaused when used

  logPauseBtn.addEventListener('click', () => {
    logsPaused = !logsPaused;
    moduleLogsPaused = logsPaused;
    logPauseBtn.textContent = logsPaused ? 'Resume' : 'Pause';
  });
  logClearBtn.addEventListener('click', () => {
    moduleLogBuffer.length = 0; while (logView.firstChild) logView.removeChild(logView.firstChild);
  });
  logExportBtn.addEventListener('click', () => {
    try {
      const blob = new Blob([JSON.stringify(moduleLogBuffer, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a'); a.href = url; a.download = `acoustsee-logs-${new Date().toISOString()}.json`; a.click();
      URL.revokeObjectURL(url);
    } catch (e) { console.error('Failed to export logs', e); }
  });

  // flush buffered module logs that arrived before UI mount
  if (moduleLogBuffer.length) {
    moduleLogBuffer.forEach(entry => moduleLogView.appendChild(createLogRow(entry)));
    while (moduleLogView.children.length > MAX_LOG_ENTRIES) moduleLogView.removeChild(moduleLogView.firstChild);
    if (autoscrollCheckbox && autoscrollCheckbox.checked) moduleLogView.scrollTop = moduleLogView.scrollHeight;
  }

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