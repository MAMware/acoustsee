// File: web/ui/debug/debug-ui.js (Consolidated and Final Version)
// This single file contains all the logic for the Debug UI component.

import { settings } from '../../core/state.js';
import { setOutputCallback } from '../../utils/core-logger.js';
import { enableFrameWorker, enableWorkerTransfer } from '../../video/frame-processor.js';
import { getAudioDiagnostics } from '../../audio/audio-processor.js';
import { debugLog, setLogView, clearLogs, exportLogs, setPaused } from '../debug-log.js';
import { getWorkerStats } from '../../debug/worker-monitor.js';
import { RingBuffer, makeThrottledRenderer, scaleCanvasForDPR, drawMultiSparkline } from './worker-charts.js';

// --- Helper Factories (from former debug-ui.controls.js) ---
function createButton(label) {
  const group = document.createElement('div');
  group.className = 'control-group';
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = label;
  group.appendChild(btn);
  return group;
}

export function initializeDebugUI(engine, DOM, options = {}) {
  const { autoOpen = true, skipDiagnostics = false } = options || {};

  const panel = document.createElement('div');
  panel.id = 'acoustsee-debug-panel';
  
  const root = DOM.uiPanelRoot || document.body;
  root.appendChild(panel);

  if (!autoOpen) {
    panel.style.display = 'none';
  }

  // --- HTML STRUCTURE WITH data-action ATTRIBUTES ---
  try {
    panel.innerHTML = `
      <div class="debug-section state-section">
        <h2>State Inspector
          <span id="audio-version-badge"></span>
          <span id="audio-context-badge"></span>
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

  // --- CONSOLIDATED ACTIONS ---
  (function createAndWireActions() {
    const actionsContainer = panel.querySelector('.debug-actions-grid');
    if (!actionsContainer) return;

    actionsContainer.append(
      createButton('Start/Stop Processing'),
      createButton('Emit Test Note'),
      createButton('Resume Audio'),
      createButton('Save Settings'),
      createButton('Load Settings'),
      createButton('Worker Explorer')
    );

    // Delegated action handling using data-action attributes
    actionsContainer.addEventListener('click', (ev) => {
      const btn = ev.target.closest('button[data-action]');
      if (!btn || !actionsContainer.contains(btn)) return;
      const action = btn.getAttribute('data-action');
      switch (action) {
        case 'toggleProcessing':
          engine.dispatch('toggleProcessing', { videoEl: DOM.videoFeed, canvasEl: DOM.frameCanvas });
          break;
        case 'playTestNote':
          engine.dispatch('playTestNote', { pitch: 440 });
          break;
        case 'resumeAudio':
          engine.dispatch('resumeAudio');
          break;
        case 'saveSettings':
          engine.dispatch('saveSettings');
          break;
        case 'loadSettings':
          engine.dispatch('loadSettings');
          break;
        // 'toggleWorkerExplorer' is handled by the explicit workerExplorerBtn handler below
      }
    });
        
    // Wire Controls
    const gridTypeEl = panel.querySelector('#grid-type-select');
    settings.availableGrids.forEach(g => { const opt = document.createElement('option'); opt.value = g.id; opt.textContent = g.id; gridTypeEl.appendChild(opt); });
    gridTypeEl.addEventListener('change', (e) => engine.dispatch('setGridType', { gridType: e.target.value }));

    const synthEngineEl = panel.querySelector('#synth-engine-select');
    settings.availableEngines.forEach(e => { const opt = document.createElement('option'); opt.value = e.id; opt.textContent = e.id; synthEngineEl.appendChild(opt); });
    synthEngineEl.addEventListener('change', (e) => engine.dispatch('setSynthEngine', { synthEngine: e.target.value }));

    const maxNotesEl = panel.querySelector('#max-notes-slider');
    const maxNotesValueEl = panel.querySelector('#max-notes-value');
    maxNotesEl.addEventListener('input', (e) => { engine.dispatch('setMaxNotes', { maxNotes: e.target.value }); maxNotesValueEl.textContent = e.target.value; });

    const motionEl = panel.querySelector('#motion-threshold-slider');
    const motionValueEl = panel.querySelector('#motion-threshold-value');
    motionEl.addEventListener('input', (e) => { engine.dispatch('setMotionThreshold', { motionThreshold: e.target.value }); motionValueEl.textContent = e.target.value; });

    panel.querySelector('#auto-fps-checkbox').addEventListener('change', e => engine.dispatch('setAutoFPS', { enabled: e.target.checked }));
    panel.querySelector('#enable-frame-worker-checkbox').addEventListener('change', e => enableFrameWorker(e.target.checked));

    // Video Preview (enhanced)
    const vp = document.createElement('div');
    vp.style.cssText = 'border:1px solid #333;padding:8px;margin-top:10px;background:#0b0b0b;border-radius:6px;';
    vp.innerHTML = `<div style="font-size:13px;font-weight:600;margin-bottom:6px;">Video Preview</div>`;
    const videoWrap = document.createElement('div');
    videoWrap.style.position = 'relative'; videoWrap.style.height = '140px'; videoWrap.style.background = '#000';
    const preview = document.createElement('video');
    preview.autoplay = true; preview.muted = true; preview.playsInline = true;
    preview.style.cssText = 'width:100%;height:100%;object-fit:contain;';
    if (DOM.videoFeed && DOM.videoFeed.srcObject) preview.srcObject = DOM.videoFeed.srcObject;
    videoWrap.appendChild(preview);
    vp.appendChild(videoWrap);
    actionsContainer.appendChild(vp);

    // create a named worker explorer panel (toggled via data-action)
    let explorerPanel = panel.querySelector('#worker-explorer-panel');
    if (!explorerPanel) {
      explorerPanel = document.createElement('div');
      explorerPanel.id = 'worker-explorer-panel';
      explorerPanel.style.display = 'none';
      explorerPanel.style.marginTop = '10px';
      actionsContainer.appendChild(explorerPanel);
    }

    const multiWrapper = document.createElement('div');
    multiWrapper.style.cssText = 'padding:8px;border:1px solid #333;background:#070707;border-radius:6px;';
    const legend = document.createElement('div');
    legend.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-bottom:8px;font-size:12px;';
    const multiCanvas = document.createElement('canvas');
    scaleCanvasForDPR(multiCanvas, 360, 96);
    multiWrapper.appendChild(legend);
    multiWrapper.appendChild(multiCanvas);
    explorerPanel.appendChild(multiWrapper);

    const historyMap = new Map(); // id -> { ring, name }
    const MAX_SAMPLES = 60;

    function ensureSeries(id, name) {
      if (!historyMap.has(id)) {
        historyMap.set(id, { ring: new RingBuffer(MAX_SAMPLES), name: name || id });
        // Update legend
        const item = document.createElement('div');
        const color = `hsl(${(historyMap.size * 137) % 360}, 72%, 58%)`;
        item.innerHTML = `<span style="width:10px;height:10px;background:${color};display:inline-block;margin-right:4px;"></span>${name}`;
        legend.appendChild(item);
      }
      return historyMap.get(id);
    }

    function renderAll() {
      const seriesMap = new Map();
      historyMap.forEach((v, k) => seriesMap.set(k, v.ring.toArray()));
      drawMultiSparkline(multiCanvas, seriesMap, {});
    }
    const requestRender = makeThrottledRenderer(renderAll, 2);

    function syncFromRegistry() {
      const stats = getWorkerStats();
      if (!stats) return;
      stats.forEach(s => {
        const entry = ensureSeries(s.id, s.name);
        if(s.last) entry.ring.push(s.last.util ?? 0);
      });
      requestRender();
    }

    let explorerInterval = null;
    // explicit button reference: find the button with data-action toggleWorkerExplorer
    const workerExplorerBtn = panel.querySelector('button[data-action="toggleWorkerExplorer"]');
    if (workerExplorerBtn) {
      workerExplorerBtn.addEventListener('click', () => {
        if (explorerPanel.style.display === 'none') {
          explorerPanel.style.display = 'block';
          syncFromRegistry(); // Initial render
          explorerInterval = setInterval(syncFromRegistry, 500);
        } else {
          explorerPanel.style.display = 'none';
          if (explorerInterval) clearInterval(explorerInterval);
          explorerInterval = null;
        }
      });
    }
  })();

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