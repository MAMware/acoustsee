// File: web/ui/debug-ui.js
// The Developer & Tester UI ("Debug View")

import { setOutputCallback } from '../utils/core-logger.js';
import { settings } from '../core/state.js';

export function initializeDebugUI(engine, DOM) {
  // 1. --- CREATE UI & STYLES ---
  const panel = document.createElement('div');
  panel.id = 'acoustsee-debug-panel';
  DOM.uiPanelRoot.appendChild(panel);

  panel.innerHTML = `
    <div class="debug-section">
      <h2>State Inspector</h2>
      <pre id="debug-state-view">Loading state...</pre>
    </div>
    <div class="debug-section">
      <h2>Controls</h2>
      <div id="debug-controls"></div>
    </div>
    <div class="debug-section logs-section">
      <h2>Live Logs</h2>
      <div id="debug-log-view"></div>
    </div>
  `;

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
    }
    .debug-section {
      padding: 10px;
      border-bottom: 1px solid #34495e;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    .debug-section.logs-section {
      flex-grow: 1; /* Take remaining space */
    }
    .debug-section h2 {
      margin: 0 0 10px 0;
      font-size: 14px;
      color: #3498db;
      border-bottom: 1px solid #3498db;
      padding-bottom: 5px;
    }
    #debug-state-view {
      background: #222;
      padding: 5px;
      white-space: pre-wrap;
      word-break: break-all;
      max-height: 200px;
      overflow-y: auto;
    }
    #debug-log-view {
      flex-grow: 1;
      overflow-y: scroll;
      background: #222;
      padding: 5px;
    }
    #debug-log-view .log-entry {
      border-bottom: 1px dotted #444;
      padding-bottom: 3px;
      margin-bottom: 3px;
    }
    #debug-log-view .log-warn { color: #f39c12; }
    #debug-log-view .log-error { color: #e74c3c; font-weight: bold; }
    .control-group { margin-bottom: 10px; }
    .control-group label { display: block; margin-bottom: 4px; }
    .control-group select, .control-group input, .control-group button {
      width: 100%;
      background: #34495e;
      color: #ecf0f1;
      border: 1px solid #7f8c8d;
      border-radius: 3px;
      padding: 4px;
      box-sizing: border-box;
    }
    .control-group button { cursor: pointer; background: #2980b9; }
    .control-group button:hover { background: #3498db; }
  `;

  const styleSheet = document.createElement("style");
  styleSheet.innerText = styles;
  document.head.appendChild(styleSheet);

  // 2. --- POPULATE CONTROLS ---
  const controlsContainer = panel.querySelector('#debug-controls');
  
  // Create dropdowns
  const gridSelect = createSelect('Grid Type', settings.availableGrids.map(g => g.id));
  const synthSelect = createSelect('Synth Engine', settings.availableEngines.map(e => e.id));
  
  // Create sliders
  const maxNotesSlider = createSlider('Max Notes', 1, 100, 1);
  const motionSlider = createSlider('Motion Threshold', 1, 255, 5);
  
  // Create checkbox
  const autoFpsCheckbox = createCheckbox('Auto FPS');

  // Create buttons
  const startStopBtn = createButton('Start/Stop Processing');
  const saveBtn = createButton('Save Settings');
  const loadBtn = createButton('Load Settings');

  controlsContainer.append(
    gridSelect, synthSelect, maxNotesSlider, motionSlider, autoFpsCheckbox, startStopBtn, saveBtn, loadBtn
  );
  
  // 3. --- WIRE UP INPUTS (Controls -> Engine) ---
  gridSelect.querySelector('select').addEventListener('change', (e) => engine.dispatch('setGridType', { gridType: e.target.value }));
  synthSelect.querySelector('select').addEventListener('change', (e) => engine.dispatch('setSynthEngine', { synthEngine: e.target.value }));
  maxNotesSlider.querySelector('input').addEventListener('input', (e) => {
    engine.dispatch('setMaxNotes', { maxNotes: e.target.value });
    maxNotesSlider.querySelector('span').textContent = e.target.value;
  });
  motionSlider.querySelector('input').addEventListener('input', (e) => {
    engine.dispatch('setMotionThreshold', { motionThreshold: e.target.value });
    motionSlider.querySelector('span').textContent = e.target.value;
  });
  autoFpsCheckbox.querySelector('input').addEventListener('change', (e) => engine.dispatch('setAutoFPS', { enabled: e.target.checked }));

  startStopBtn.querySelector('button').addEventListener('click', () => {
    const isProcessing = engine.getState().isProcessing;
    if (isProcessing) {
      engine.dispatch('stopProcessing', { videoEl: DOM.videoFeed });
    } else {
      engine.dispatch('startProcessing', { videoEl: DOM.videoFeed, canvasEl: DOM.frameCanvas });
    }
  });
  saveBtn.querySelector('button').addEventListener('click', () => engine.dispatch('saveSettings'));
  loadBtn.querySelector('button').addEventListener('click', () => engine.dispatch('loadSettings'));


  // 4. --- WIRE UP OUTPUTS (Engine -> UI) ---
  const stateView = panel.querySelector('#debug-state-view');
  const logView = panel.querySelector('#debug-log-view');

  // State Inspector
  engine.onStateChange(state => {
    stateView.textContent = JSON.stringify(state, null, 2);
    
    // Sync controls with state
    gridSelect.querySelector('select').value = state.gridType;
    synthSelect.querySelector('select').value = state.synthesisEngine;
    maxNotesSlider.querySelector('input').value = state.maxNotes;
    maxNotesSlider.querySelector('span').textContent = state.maxNotes;
    motionSlider.querySelector('input').value = state.motionThreshold;
    motionSlider.querySelector('span').textContent = state.motionThreshold;
    autoFpsCheckbox.querySelector('input').checked = state.autoFPS;
    startStopBtn.querySelector('button').textContent = state.isProcessing ? 'Stop Processing' : 'Start Processing';
  });

  // Log Viewer
  setOutputCallback((level, text) => {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${level}`;
    logEntry.textContent = text;
    logView.appendChild(logEntry);
    // Auto-scroll to the bottom
    logView.scrollTop = logView.scrollHeight;
  });
}

// --- Helper functions for creating controls ---
function createControlGroup(label) {
  const group = document.createElement('div');
  group.className = 'control-group';
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  group.appendChild(labelEl);
  return group;
}

function createSelect(label, options) {
  const group = createControlGroup(label);
  const select = document.createElement('select');
  options.forEach(opt => {
    const option = document.createElement('option');
    option.value = opt;
    option.textContent = opt;
    select.appendChild(option);
  });
  group.appendChild(select);
  return group;
}

function createSlider(label, min, max, step) {
  const group = createControlGroup(label);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = min;
  input.max = max;
  input.step = step;
  const valueSpan = document.createElement('span');
  valueSpan.style.marginLeft = '10px';
  group.appendChild(input);
  group.appendChild(valueSpan);
  return group;
}

function createCheckbox(label) {
  const group = createControlGroup(''); // Checkbox label is special
  const input = document.createElement('input');
  input.type = 'checkbox';
  input.id = `debug-checkbox-${label.replace(/\s+/g, '-')}`;
  const labelEl = document.createElement('label');
  labelEl.textContent = label;
  labelEl.setAttribute('for', input.id);
  labelEl.style.display = 'inline-block';
  labelEl.style.marginLeft = '5px';
  group.appendChild(input);
  group.appendChild(labelEl);
  return group;
}

function createButton(label) {
  const group = createControlGroup('');
  const button = document.createElement('button');
  button.textContent = label;
  group.appendChild(button);
  return group;
}