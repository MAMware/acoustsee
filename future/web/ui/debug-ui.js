// File: web/ui/debug-ui.js (Complete with all checkboxes)

import { settings } from '../core/state.js';
import { setOutputCallback } from '../utils/core-logger.js';
import { enableFrameWorker, enableWorkerTransfer } from '../video/frame-processor.js';
import { getAudioDiagnostics } from '../audio/audio-processor.js';
import { debugLog, setLogView, clearLogs, exportLogs, setPaused } from './debug-log.js';
import { createControlGroup, createSelect, createSlider, createCheckbox, createButton } from './debug-ui.controls.js';

export function initializeDebugUI(engine, DOM) {
  const panel = document.createElement('div');
  panel.id = 'acoustsee-debug-panel';
  // keep debug panel visually present but avoid covering video/splash
  panel.style.zIndex = '5';
  // Note: controls are created below; query them after mounting the innerHTML.
  DOM.uiPanelRoot.appendChild(panel);

  panel.innerHTML = `
    <div class="debug-section state-section">
  <h2>State Inspector
    <span id="audio-version-badge" style="margin-left:8px;padding:2px 6px;border-radius:8px;font-size:10px;vertical-align:middle;">?</span>
    <span id="audio-context-badge" style="margin-left:8px;padding:2px 6px;border-radius:8px;font-size:10px;vertical-align:middle;color:#c46;">No context</span>
  </h2>
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
      const badge = document.getElementById('audio-version-badge');
      if (badge) {
        badge.textContent = ver || 'unknown';
        badge.style.background = '#111';
        badge.style.color = '#9ad';
        badge.style.border = '1px solid rgba(255,255,255,0.04)';
      }
    } catch (e) {}
  })();

  // Responsive layout: landscape => panel right and video left; portrait => bottom sheet
  (function responsivePanelLayout() {
    const candidates = ['#video-container','#video-preview','.video-preview','#preview','video','#frameCanvas','canvas'];

    function findVideoElement() {
      for (const sel of candidates) {
        try {
          const el = document.querySelector(sel);
          if (el && document.body.contains(el)) return el;
        } catch (e) { /* ignore selector errors */ }
      }
      const vid = document.querySelector('video, canvas');
      if (vid && document.body.contains(vid)) return vid;
      return null;
    }

    function applyLandscape(el, panelEl) {
      const vw = Math.max(document.documentElement.clientWidth || 0, window.innerWidth || 0);
      const preferred = panelEl.getBoundingClientRect().width || 400;
      const calcWidth = Math.min(preferred, Math.max(280, Math.round(vw * 0.36)));
      panelEl.style.position = 'fixed';
      panelEl.style.right = '0';
      panelEl.style.left = 'auto';
      panelEl.style.top = '0';
      panelEl.style.bottom = 'auto';
      panelEl.style.width = calcWidth + 'px';
      panelEl.style.height = '100vh';
      panelEl.style.borderLeft = '2px solid #34495e';
      panelEl.style.borderTop = '';
      if (el) {
        const container = el.parentElement || el;
        container.style.boxSizing = 'border-box';
        container.style.marginRight = (calcWidth + 12) + 'px';
        container.style.marginBottom = '';
      }
    }

    function applyPortrait(el, panelEl) {
      const vh = Math.max(document.documentElement.clientHeight || 0, window.innerHeight || 0);
      const sheetHeight = Math.max(220, Math.round(vh * 0.42));
      panelEl.style.position = 'fixed';
      panelEl.style.left = '8px';
      panelEl.style.right = '8px';
      panelEl.style.top = 'auto';
      panelEl.style.bottom = '8px';
      panelEl.style.width = `calc(100% - 16px)`;
      panelEl.style.height = sheetHeight + 'px';
      panelEl.style.borderLeft = 'none';
      panelEl.style.borderTop = '2px solid #34495e';
      panelEl.style.borderRadius = '8px';
      if (el) {
        const container = el.parentElement || el;
        container.style.boxSizing = 'border-box';
        container.style.marginBottom = (sheetHeight + 12) + 'px';
        container.style.marginRight = '';
      }
    }

    function applyResponsiveLayout() {
      try {
        const panelEl = document.getElementById('acoustsee-debug-panel');
        if (!panelEl) return;
        const el = findVideoElement();
        const isLandscape = window.innerWidth > window.innerHeight;
        if (isLandscape) {
          applyLandscape(el, panelEl);
        } else {
          applyPortrait(el, panelEl);
        }
      } catch (e) { /* fail silently */ }
    }

    applyResponsiveLayout();
    window.addEventListener('resize', applyResponsiveLayout, { passive: true });
    window.addEventListener('orientationchange', applyResponsiveLayout, { passive: true });
    setTimeout(applyResponsiveLayout, 600);
  })();

  // Poll for engine context and set the small inline context badge (don't overwrite state inspector)
  (function waitForContextBadge() {
    const ctxBadge = document.getElementById('audio-context-badge');
    if (!ctxBadge) return;
    const setBadge = (txt, color) => {
      ctxBadge.textContent = txt;
      ctxBadge.style.color = color || '';
    };

    const getContext = () => {
      try {
        if (engine == null) return null;
        if (engine.context) return engine.context;
        if (typeof engine.getContext === 'function') return engine.getContext();
        if (typeof engine.get === 'function') return engine.get('context');
      } catch (e) { /* ignore */ }
      return null;
    };

    // initial
    setBadge('Loading...', '#9ad');

    const start = Date.now();
    const timeoutMs = 7000;
    const iv = setInterval(() => {
      const ctx = getContext();
      if (ctx) {
        clearInterval(iv);
        try {
          const stateText = typeof ctx === 'object' ? (ctx.state || ctx.status || 'ready') : String(ctx);
          setBadge(String(stateText), '#2ecc71');
        } catch (e) {
          setBadge('Context', '#2ecc71');
        }
        return;
      }
      if (Date.now() - start > timeoutMs) {
        clearInterval(iv);
        setBadge('No context (not initialized)', '#c46');
      }
    }, 250);
  })();

  // Try to locate the video preview element and ensure it is above the debug panel.
  (function ensureVideoOnTop() {
    try {
      const tried = new Set();
      const candidates = [
        () => DOM?.videoFeed,
        () => document.getElementById('video-preview'),
        () => document.getElementById('preview'),
        () => document.querySelector('.video-preview'),
        () => document.querySelector('video#preview'),
        () => document.querySelector('#videoFeed'),
        () => document.querySelector('video'),
        () => document.querySelector('#frameCanvas'),
        () => document.querySelector('canvas')
      ];

      for (const getter of candidates) {
        let el;
        try { el = getter(); } catch (e) { el = null; }
        if (!el || tried.has(el)) continue;
        tried.add(el);
        // ensure element is in document and visible
        if (!document.body.contains(el)) continue;
        const style = window.getComputedStyle(el);
        // ignore if invisible
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') === 0) continue;
        // parse current z-index
        const z = parseInt(style.zIndex, 10);
        if (isNaN(z) || z <= 5) {
          // elevate element safely
          if (!el.style.position) el.style.position = style.position === 'static' ? 'relative' : style.position || 'relative';
          el.style.zIndex = '50';
        }
        // done with first visible candidate
        return;
      }
    } catch (e) {
      // don't block UI on errors
    }
  })();

  // Load debug UI stylesheet (extracted to keep JS small and separate concerns)
  (function ensureDebugCss() {
    if (!document.getElementById('acoustsee-debug-ui-css')) {
      const link = document.createElement('link');
      link.id = 'acoustsee-debug-ui-css';
      link.rel = 'stylesheet';
      link.href = '/future/web/ui/debug-ui.css';
      document.head.appendChild(link);
    }
  })();

  // --- 2. POPULATE CONTROLS (populate the two-column grid and action buttons) ---
  const controlsGrid = panel.querySelector('.controls-grid');
  // create an actions container (for start/stop, test note, resume, etc.) after the grid
  let actionsContainer = panel.querySelector('#debug-controls-actions');
  if (!actionsContainer) {
    actionsContainer = document.createElement('div');
    actionsContainer.id = 'debug-controls-actions';
    actionsContainer.style.marginTop = '10px';
  // use a compact grid layout for action buttons
  actionsContainer.className = 'debug-actions-grid';
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
  const deviceDiagsBtn = createButton('Run Device Diags');
  const audioTestBtn = createButton('Audio Output Test');
  const saveBtn = createButton('Save Settings');
  const loadBtn = createButton('Load Settings');
  actionsContainer.append(startStopBtn, emitTestNoteBtn, resumeAudioBtn, logAudioDiagsBtn, deviceDiagsBtn, audioTestBtn, saveBtn, loadBtn);

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

  // Run combined device diagnostics: enumerate devices, test resumeAudio, and request mic permission
  deviceDiagsBtn.querySelector('button').addEventListener('click', async () => {
    const ts = new Date().toISOString();
    debugLog('INFO', `Device Diags: starting at ${ts}`);
    const report = { timestamp: ts, enumerateDevices: null, resumeAudio: null, micRequest: null, permissionState: null };

    // enumerateDevices (best-effort)
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.enumerateDevices === 'function') {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        report.enumerateDevices = devices.map(d => ({ kind: d.kind, label: d.label || '(hidden)', deviceId: d.deviceId }));
        debugLog('DEBUG', `Enumerated ${report.enumerateDevices.length} devices`);
        debugLog('DEBUG', `Devices: ${JSON.stringify(report.enumerateDevices)}`);
      } catch (e) {
        report.enumerateDevices = { error: e?.message || String(e) };
        debugLog('WARN', `enumerateDevices failed: ${report.enumerateDevices.error}`);
      }
    } else {
      report.enumerateDevices = { error: 'enumerateDevices not available' };
      debugLog('WARN', 'navigator.mediaDevices.enumerateDevices not available');
    }

    // Permission status for microphone (if supported)
    try {
      if (navigator.permissions && typeof navigator.permissions.query === 'function') {
        try {
          const p = await navigator.permissions.query({ name: 'microphone' });
          report.permissionState = p.state || null;
          debugLog('DEBUG', `Microphone permission state: ${report.permissionState}`);
        } catch (e) {
          // Some browsers may not support querying 'microphone'
          report.permissionState = { error: e?.message || String(e) };
        }
      }
    } catch (e) { /* best-effort */ }

    // Test resumeAudio via engine command
    try {
      const res = await engine.dispatch('resumeAudio');
      report.resumeAudio = res || { ok: false, error: 'no-response' };
      debugLog(res?.ok ? 'INFO' : 'WARN', `resumeAudio result: ${JSON.stringify(report.resumeAudio)}`);
    } catch (e) {
      report.resumeAudio = { ok: false, error: e?.message || String(e) };
      debugLog('ERROR', `resumeAudio dispatch failed: ${report.resumeAudio.error}`);
    }

    // Request mic permission and short-lived stream to test device acquisition
    if (typeof navigator !== 'undefined' && navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        try {
          const tracks = stream.getAudioTracks ? stream.getAudioTracks().map(t => ({ label: t.label || '(hidden)', kind: t.kind })) : [];
          report.micRequest = { success: true, trackCount: tracks.length, tracks };
          debugLog('INFO', `getUserMedia succeeded, tracks: ${tracks.length}`);
          debugLog('DEBUG', `Mic tracks: ${JSON.stringify(tracks)}`);
        } finally {
          // stop tracks to avoid leaving mic open
          try { stream.getTracks().forEach(t => t.stop()); } catch (e) {}
        }
      } catch (e) {
        report.micRequest = { success: false, error: e?.message || String(e) };
        debugLog('WARN', `getUserMedia (mic) failed: ${report.micRequest.error}`);
      }
    } else {
      report.micRequest = { error: 'getUserMedia not available' };
      debugLog('WARN', 'navigator.mediaDevices.getUserMedia not available');
    }

    // Final summary log
    try {
      const summary = {
        timestamp: report.timestamp,
        devices: Array.isArray(report.enumerateDevices) ? report.enumerateDevices.length : report.enumerateDevices,
        permissionState: report.permissionState,
        resumeOk: !!(report.resumeAudio && report.resumeAudio.ok),
        micSuccess: !!(report.micRequest && report.micRequest.success)
      };
      debugLog('INFO', `Device Diags Summary: ${JSON.stringify(summary)}`);
      debugLog('DEBUG', `Device Diags Full: ${JSON.stringify(report)}`);
    } catch (e) {
      debugLog('ERROR', `Failed to stringify device diags: ${e?.message || String(e)}`);
    }
  });
  // Audio output test: confirm with user then resume audio and play a short test note
  audioTestBtn.querySelector('button').addEventListener('click', async () => {
    try {
      const ok = window.confirm('Play a short test tone now? Please lower your volume or wear headphones. Continue?');
      if (!ok) { debugLog('INFO', 'Audio test cancelled by user'); return; }
      debugLog('INFO', 'Audio test: user confirmed, attempting to resume audio');
      try {
        const res = await engine.dispatch('resumeAudio');
        debugLog(res?.ok ? 'INFO' : 'WARN', `resumeAudio result: ${JSON.stringify(res)}`);
      } catch (e) {
        debugLog('WARN', `resumeAudio dispatch threw: ${e?.message || String(e)}`);
      }
      // play a short test note (engine handler will call audio module)
      try {
        const playRes = await engine.dispatch('playTestNote', { pitch: 880 });
        debugLog('INFO', `playTestNote dispatched: ${JSON.stringify(playRes)}`);
      } catch (e) {
        debugLog('ERROR', `playTestNote failed: ${e?.message || String(e)}`);
      }
    } catch (e) {
      debugLog('ERROR', `Audio test failed: ${e?.message || String(e)}`);
    }
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
// Helper factories are now provided by ./debug-ui.controls.js

// (start/stop handler lives inside initializeDebugUI to keep scope correct)