// File: web/ui/debug-ui.js
// The Developer & Tester UI ("Debug View")
// UPDATED: Improved internal scrolling and layout for the panel.

import { setOutputCallback } from '../utils/core-logger.js';
import { settings } from '../core/state.js';

export function initializeDebugUI(engine, DOM) {
  // 1. --- CREATE UI & STYLES ---
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

  // --- UPDATED STYLES ---
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
      display: flex; /* Use flexbox for the section itself */
      flex-direction: column; /* Stack h2 and content vertically */
      overflow: hidden; /* Prevent content from breaking out */
    }
    .debug-section h2 {
      margin: 0 0 10px 0;
      font-size: 14px;
      color: #3498db;
      border-bottom: 1px solid #3498db;
      padding-bottom: 5px;
      flex-shrink: 0; /* Prevent the title from shrinking */
    }
    /* --- STATE INSPECTOR --- */
    .state-section {
      flex-shrink: 0; /* Don't let this section shrink */
      max-height: 25%; /* Give it a max height */
    }
    #debug-state-view {
      background: #222;
      padding: 5px;
      white-space: pre-wrap;
      word-break: break-all;
      overflow-y: auto; /* Allow this specific element to scroll */
    }
    /* --- CONTROLS --- */
    .controls-section {
      flex-shrink: 0; /* Don't let this section shrink either */
    }
    #debug-controls {
      overflow-y: auto; /* This is the key fix for the missing button */
      padding-right: 5px; /* Add some space for the scrollbar */
    }
    /* --- LOGS --- */
    .logs-section {
      flex-grow: 1; /* CRITICAL: This makes the logs section take all remaining space */
    }
    #debug-log-view {
      flex-grow: 1;
      overflow-y: scroll; /* Use scroll to always show the bar */
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

    /* --- General Control Styles --- */
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

  // 2. --- POPULATE CONTROLS (No changes here, this code remains the same) ---
  const controlsContainer = panel.querySelector('#debug-controls');
  const gridSelect = createSelect('Grid Type', settings.availableGrids.map(g => g.id));
  const synthSelect = createSelect('Synth Engine', settings.availableEngines.map(e => e.id));
  const maxNotesSlider = createSlider('Max Notes', 1, 100, 1);
  const motionSlider = createSlider('Motion Threshold', 1, 255, 5);
  const autoFpsCheckbox = createCheckbox('Auto FPS');
  const startStopBtn = createButton('Start/Stop Processing'); // This is the button that was hidden
  const saveBtn = createButton('Save Settings');
  const loadBtn = createButton('Load Settings');
  controlsContainer.append(
    gridSelect, synthSelect, maxNotesSlider, motionSlider, autoFpsCheckbox, startStopBtn, saveBtn, loadBtn
  );
  
  // 3. --- WIRE UP INPUTS (No changes here) ---
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

  // 4. --- WIRE UP OUTPUTS (No changes here) ---
  const stateView = panel.querySelector('#debug-state-view');
  const logView = panel.querySelector('#debug-log-view');
  engine.onStateChange(state => {
    stateView.textContent = JSON.stringify(state, null, 2);
    gridSelect.querySelector('select').value = state.gridType;
    synthSelect.querySelector('select').value = state.synthesisEngine;
    maxNotesSlider.querySelector('input').value = state.maxNotes;
    maxNotesSlider.querySelector('span').textContent = state.maxNotes;
    motionSlider.querySelector('input').value = state.motionThreshold;
    motionSlider.querySelector('span').textContent = state.motionThreshold;
    autoFpsCheckbox.querySelector('input').checked = state.autoFPS;
    startStopBtn.querySelector('button').textContent = state.isProcessing ? 'Stop Processing' : 'Start Processing';
  });
  setOutputCallback((level, text) => {
    const logEntry = document.createElement('div');
    logEntry.className = `log-entry log-${level}`;
    logEntry.textContent = text;
    logView.appendChild(logEntry);
    logView.scrollTop = logView.scrollHeight;
  });
}

// --- Helper functions for creating controls (No changes here) ---
function createControlGroup(label) { /* ... unchanged ... */ }
function createSelect(label, options) { /* ... unchanged ... */ }
function createSlider(label, min, max, step) { /* ... unchanged ... */ }
function createCheckbox(label) { /* ... unchanged ... */ }
function createButton(label) { /* ... unchanged ... */ }