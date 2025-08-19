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

  // ... (The CSS styles inside this file can remain the same as before) ...
  const styles = `...`; // No change to the styles defined within this file.

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

  startStopBtn.querySelector('button').addEventListener('click', () => { /* ... unchanged ... */ });
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

  setOutputCallback((level, text) => { /* ... unchanged ... */ });
}

// --- Helper functions (These should all be present and correct) ---
function createControlGroup(label) { /* ... */ }
function createSelect(label, options) { /* ... */ }
function createSlider(label, min, max, step) { /* ... */ }
function createCheckbox(label) { /* ... */ }
function createButton(label) { /* ... */ }