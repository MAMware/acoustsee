// File: web/ui/debug/debug-ui.js (Definitive Consolidated Version)

import { settings } from '../../core/state.js';
import { setOutputCallback } from '../../utils/core-logger.js';
import { getAudioDiagnostics } from '../../audio/audio-processor.js';
import { debugLog, setLogView, clearLogs, exportLogs, setPaused } from '../debug-log.js';
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
          <span id="audio-version-badge" title="Build Version"></span>
        </h2>
        <pre id="debug-state-view">Loading state...</pre>
        <div id="version-footer"></div>
      </div>
      <div class="debug-section controls-section">
        <h2>Controls</h2>
        <div class="controls-grid">
          <div class="control-row"><label>Grid Type<select id="grid-type-select"></select></label></div>
          <div class="control-row"><label>Synth Engine<select id="synth-engine-select"></select></label></div>
          <div class="control-row"><label>Max Notes<input id="max-notes-slider" type="range" min="1" max="128" value="16"><span id="max-notes-value">16</span></label></div>
          <div class="control-row"><label>Motion Threshold<input id="motion-threshold-slider" type="range" min="0" max="1" step="0.01" value="0.20"><span id="motion-threshold-value">0.20</span></label></div>
        </div>
        <div class="debug-actions-grid"></div>
        <div id="worker-explorer-container" style="display:none; margin-top:8px;">
          <div id="worker-explorer-legend"></div>
          <canvas id="worker-explorer-canvas" width="360" height="96"></canvas>
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

    // --- RESTORE VERSION FOOTER ---
    try {
      const versionBadge = panel.querySelector('#audio-version-badge');
      const versionFooter = panel.querySelector('#version-footer');
      const metaVer = document.querySelector('meta[name="acoustsee-version"]')?.getAttribute('content');
      const ver = metaVer || window.ACOUSTSEE_VERSION || window.ACOUSTSEE_APP_VERSION || BUILD_VERSION;
      if (versionBadge) versionBadge.textContent = `v${ver}`;
      if (versionFooter) versionFooter.textContent = `Audio: ${AUDIO_VERSION || 'n/a'} | Video: ${VIDEO_VERSION || 'n/a'} | UI: ${UI_VERSION || ver}`;
    } catch (e) {}

    // --- WIRE WORKER EXPLORER CANVAS ---
    try {
      const explorerContainer = panel.querySelector('#worker-explorer-container');
      const explorerLegend = panel.querySelector('#worker-explorer-legend');
      const explorerCanvas = panel.querySelector('#worker-explorer-canvas');
      if (explorerContainer && explorerCanvas) {
        // Resize for DPR
        try { scaleCanvasForDPR(explorerCanvas, explorerCanvas.width || 360, explorerCanvas.height || 96); } catch (e) {}
        // Basic polling/render function
        let explorerInterval = null;
        const historyMap = new Map();
        const MAX_SAMPLES = 60;
        function ensureSeries(id, name) {
          if (!historyMap.has(id)) {
            historyMap.set(id, { ring: new RingBuffer(MAX_SAMPLES), name: name || id });
            if (explorerLegend) {
              const item = document.createElement('div');
              const color = `hsl(${(historyMap.size * 137) % 360}, 72%, 58%)`;
              item.innerHTML = `<span style="width:10px;height:10px;background:${color};display:inline-block;margin-right:4px;"></span>${name}`;
              explorerLegend.appendChild(item);
            }
          }
          return historyMap.get(id);
        }
        function renderAll() {
          const seriesMap = new Map();
          historyMap.forEach((v, k) => seriesMap.set(k, v.ring.toArray()));
          drawMultiSparkline(explorerCanvas, seriesMap, {});
        }
        function syncFromRegistry() {
          try {
            const stats = getWorkerStats();
            if (!stats) return;
            stats.forEach(s => {
              const entry = ensureSeries(s.id, s.name);
              if (s.last) entry.ring.push(s.last.util ?? 0);
            });
            renderAll();
          } catch (e) {}
        }
        // toggle when buttons are clicked (the actions module wires the action button)
        panel.__debugExplorerStart = () => { if (!explorerInterval) { syncFromRegistry(); explorerInterval = setInterval(syncFromRegistry, 500); } };
        panel.__debugExplorerStop = () => { if (explorerInterval) { clearInterval(explorerInterval); explorerInterval = null; } };
      }
    } catch (e) {}

    // --- FIX: link video preview to DOM.videoFeed stream if present ---
    try {
      const previewEl = panel.querySelector('.debug-video-preview video') || panel.querySelector('#debug-video-preview');
      if (previewEl && DOM && DOM.videoFeed) {
        // Update immediately if stream is already present
        if (DOM.videoFeed.srcObject && previewEl.srcObject !== DOM.videoFeed.srcObject) {
          previewEl.srcObject = DOM.videoFeed.srcObject;
        }
        // Observe the application's video element for stream assignment
        try {
          const obs = new MutationObserver(() => {
            try { if (DOM.videoFeed.srcObject && previewEl.srcObject !== DOM.videoFeed.srcObject) previewEl.srcObject = DOM.videoFeed.srcObject; } catch (e) {}
          });
          obs.observe(DOM.videoFeed, { attributes: true });
          // store observer for potential teardown
          panel.__videoPreviewObserver = obs;
        } catch (e) {}
      }
    } catch (e) {}

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