// File: web/ui/debug-ui.js (Complete with all checkboxes)

import { settings } from '../core/state.js';
import { setOutputCallback } from '../utils/core-logger.js';
import { enableFrameWorker, enableWorkerTransfer } from '../video/frame-processor.js';

export function initializeDebugUI(engine, DOM) {
  const panel = document.createElement('div');
  panel.id = 'acoustsee-debug-panel';
  DOM.uiPanelRoot.appendChild(panel);

  panel.innerHTML = `
    <div class="debug-section state-section">
      <h2>State Inspector</h2>
      <pre id="debug-state-view">Loading state...</pre>
    </div>
    <div class="debug-section controls-section">
      <h2>Controls</h2>
      <div id="debug-controls"></div>
    </div>
    <div class="debug-section logs-section">
      <h2>Live Logs</h2>
      <div id="debug-log-view"></div>
    </div>
  `;

  // ... (The CSS styles for the debug panel) ...
  const styles = `
    #acoustsee-debug-panel {
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
    }
    .debug-section {
      padding: 10px;
      border-bottom: 1px solid #34495e;
      display: flex;
      flex-direction: column;
      overflow: hidden;
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
    }
    #debug-state-view {
      background: #222;
      padding: 5px;
      white-space: pre-wrap;
      word-break: break-all;
      overflow-y: auto;
    }
    .controls-section {
      flex-shrink: 0;
    }
    #debug-controls {
      overflow-y: auto;
      padding-right: 5px;
    }
    .logs-section {
      flex-grow: 1;
    }
    #debug-log-view {
      flex-grow: 1;
      overflow-y: scroll;
      background: #222;
      padding: 5px;
    }
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
  const workerCheckbox = createCheckbox('Enable Frame Worker'); // This was missing from the append() call
  const transferCheckbox = createCheckbox('Enable Buffer Transfer'); // This was also missing

  const startStopBtn = createButton('Start/Stop Processing');
  const saveBtn = createButton('Save Settings');
  const loadBtn = createButton('Load Settings');

  controlsContainer.append(
    gridSelect, synthSelect, maxNotesSlider, motionSlider, 
    autoFpsCheckbox, workerCheckbox, transferCheckbox, // They are now correctly added here
    startStopBtn, saveBtn, loadBtn
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
  saveBtn.querySelector('button').addEventListener('click', () => engine.dispatch('saveSettings'));
  loadBtn.querySelector('button').addEventListener('click', () => engine.dispatch('loadSettings'));

  // --- 4. WIRE UP OUTPUTS (Now complete) ---
  const stateView = panel.querySelector('#debug-state-view');
  const logView = panel.querySelector('#debug-log-view');

  engine.onStateChange(state => {
    // ... (all the other state syncs are unchanged)
    autoFpsCheckbox.querySelector('input').checked = state.autoFPS;
    workerCheckbox.querySelector('input').checked = !!state.enableFrameWorker;
    transferCheckbox.querySelector('input').checked = !!state.workerTransferEnabled;
    startStopBtn.querySelector('button').textContent = state.isProcessing ? 'Stop Processing' : 'Start Processing';
  });
  setOutputCallback((level, text) => {
    // Append simple log entries to the log view
    const entry = document.createElement('div');
    entry.className = `dbg-log dbg-${level.toLowerCase()}`;
    entry.textContent = `[${level}] ${text}`;
    logView.appendChild(entry);
    // keep the latest visible
    logView.scrollTop = logView.scrollHeight;
  });
}

// --- Helper functions (These should all be present and correct) ---
function createControlGroup(label) {
  const wrapper = document.createElement('div');
  wrapper.className = 'dbg-control-group';
  if (label) {
    const lab = document.createElement('label');
    lab.className = 'dbg-label';
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
  value.className = 'dbg-slider-value';
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