// File: web/ui/debug-ui.js (Complete with all checkboxes)

import { settings } from '../core/state.js';
import { setOutputCallback } from '../utils/core-logger.js';
import { enableFrameWorker, enableWorkerTransfer } from '../video/frame-processor.js';
import { getAudioDiagnostics } from '../audio/audio-processor.js';
import { debugLog, setLogView, clearLogs, exportLogs, setPaused, setFilterText, setFilterLevel, setOnCountChange, getFilteredCount, getTotalCount } from './debug-log.js';
import { createControlGroup, createSelect, createSlider, createCheckbox } from './debug-ui.controls.js';
import { createAndWireActions } from './debug-ui.actions.js';
import initializeDebugUIBehavior from './debug-ui.behavior.js';
import installConsoleIngest from './debug-ingest.js';
import { BUILD_VERSION, AUDIO_VERSION, VIDEO_VERSION, UI_VERSION, LANGUAGES_VERSION } from '../core/constants.js';

// Add debug logs to confirm versions are loaded
console.log('Versions loaded:', { BUILD_VERSION, AUDIO_VERSION, VIDEO_VERSION, UI_VERSION, LANGUAGES_VERSION });

export function initializeDebugUI(engine, DOM, options = {}) {
  const { autoOpen = true, skipDiagnostics = false } = options || {};

  // --- DYNAMIC STYLESHEET LOADER ---
  // The debug UI is responsible for loading its own styles, making it a true "plugin".
  (function ensureDebugCss() {
    try {
      const cssId = 'acoustsee-debug-ui-css';
      if (document.getElementById(cssId)) {
        return; // Stylesheet is already loaded.
      }
      const link = document.createElement('link');
      link.id = cssId;
      link.rel = 'stylesheet';
      link.href = './ui/debug-ui.css'; 
      document.head.appendChild(link);
    } catch (e) {
      console.warn('Failed to load debug-ui.css', e);
    }
  })();

  const panel = document.createElement('div');
  panel.id = 'acoustsee-debug-panel';
  // keep debug panel visually present but avoid covering video/splash
  // Ensure the debug panel overlays the main video/content so controls are clickable.
  panel.style.zIndex = '100';
  // Note: controls are created below; query them after mounting the innerHTML.
  DOM.uiPanelRoot.appendChild(panel);

  // initialize behavior (responsive layout, video z-index, stylesheet loader)
  try { initializeDebugUIBehavior({ panel, DOM, settings, engine, skipDiagnostics }); } catch (e) { /* non-fatal */ }

  // Debug log for version badge
  console.log('Setting version badge to:', BUILD_VERSION);

  panel.innerHTML = `
    <div class="debug-section state-section">
  <h2>State Inspector
    <span id="audio-version-badge" style="margin-left:8px;padding:2px 6px;border-radius:8px;font-size:10px;vertical-align:middle;">${BUILD_VERSION}</span>
    <span id="audio-context-badge" style="margin-left:8px;padding:2px 6px;border-radius:8px;font-size:10px;vertical-align:middle;color:#c46;">No context</span>
  </h2>
      <pre id="debug-state-view">Loading state...</pre>
      <div style="margin-top:8px;font-size:11px;color:#aaa;">
        Versions: Audio ${AUDIO_VERSION} | Video ${VIDEO_VERSION} | UI ${UI_VERSION} | Lang ${LANGUAGES_VERSION}
      </div>
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
          <div class="control-row" style="display:flex; gap:12px; align-items:center;">
            <label style="display:flex; align-items:center; gap:6px; font-size:12px;">
              <input id="dev-console-ingest-checkbox" type="checkbox"> Dev: Console Ingest
            </label>
          </div>
        </div>

      </div>
    </div>
    <div class="debug-section logs-section">
      <h2>Live Logs <span id="log-match-count" style="font-size:12px; margin-left:8px; color:#9ad;">(0/0)</span></h2>
      <div class="log-controls" style="display:flex; align-items:center; gap:8px;">
        <button id="log-pause-btn" type="button">Pause</button>
        <label style="margin-left:8px; font-size:12px;">
          <input id="autoscroll-checkbox" type="checkbox" checked style="vertical-align:middle; margin-right:6px;"> Autoscroll
        </label>
        <button id="log-clear-btn" type="button" style="margin-left:8px;">Clear</button>
        <button id="log-export-btn" type="button" style="margin-left:4px;">Export</button>

        <input id="log-search-input" type="search" placeholder="Search logs..." style="margin-left:8px; padding:4px 8px; min-width:160px;"> 
        <button id="log-clear-filter-btn" type="button" title="Clear filter" style="margin-left:4px; font-size:12px; padding:4px 8px;">Clear Filter</button>

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

  if (!autoOpen) {
    // Keep the panel hidden initially and avoid running heavy diagnostics.
    try { panel.style.display = 'none'; } catch (e) {}
  }

  // install console ingest if allowed by settings (dev/local only by default)
  try {
    if (settings && settings.ingestEnabled) {
      // installConsoleIngest returns a dispose fn; keep it on the panel for potential cleanup
      try { panel.__disposeConsoleIngest = installConsoleIngest({ debugLog, settings }); } catch (e) {}
    }
  } catch (e) {}

  // show version badge (meta tag -> global constant -> fallback)
  

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
        // skip elements that were inserted into the debug panel itself
        if (el.closest && el.closest('#acoustsee-debug-panel')) continue;
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

    // final sync: ensure dev ingest checkbox and other UI states reflect settings
    try {
      const devIngestCheckbox = panel.querySelector('#dev-console-ingest-checkbox');
      if (devIngestCheckbox) devIngestCheckbox.checked = !!settings.ingestEnabled;
    } catch (e) {}

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

  // create and wire action buttons (moved to debug-ui.actions.js)
  const actions = createAndWireActions(actionsContainer, { engine, DOM, getAudioDiagnostics, debugLog, settings, skipDiagnostics });

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

  // Action handlers are created and wired in debug-ui.actions.js

  // --- 4. WIRE UP OUTPUTS (Now complete) ---
  const stateView = panel.querySelector('#debug-state-view');
  const logView = panel.querySelector('#debug-log-view');
  setLogView(logView, { maxEntries: 1000 });

  // subscribe to filtered/total count updates and wire clear-filter
  try {
    const countEl = panel.querySelector('#log-match-count');
    const clearFilterBtn = panel.querySelector('#log-clear-filter-btn');
    // update UI with object payload { filtered, total }
    setOnCountChange((counts) => { try {
      if (!countEl) return;
      const f = counts && typeof counts.filtered === 'number' ? counts.filtered : 0;
      const t = counts && typeof counts.total === 'number' ? counts.total : 0;
      countEl.textContent = `(${f}/${t})`;
    } catch (e) {} });
    // initialize
    try { if (countEl) countEl.textContent = `(${getFilteredCount()}/${getTotalCount()})`; } catch (e) {}
    // clear filter button
    if (clearFilterBtn) {
      clearFilterBtn.addEventListener('click', () => {
        try {
          // clear search input and reset filters
          const searchInput = panel.querySelector('#log-search-input'); if (searchInput) searchInput.value = '';
          setFilterText('');
          setFilterLevel(null);
        } catch (e) {}
      });
    }
  } catch (e) { /* non-fatal */ }

  // helper: enable/disable the Clear Filter button based on current filter state
  function updateClearFilterState() {
    try {
      const btn = panel.querySelector('#log-clear-filter-btn');
      if (!btn) return;
      const searchInput = panel.querySelector('#log-search-input');
      const verbositySel = panel.querySelector('#log-verbosity-select');
      const hasText = searchInput && String(searchInput.value || '').trim().length > 0;
      const levelFiltered = verbositySel && verbositySel.value && verbositySel.value !== 'INFO';
      if (hasText || levelFiltered) {
        btn.removeAttribute('disabled');
        btn.style.opacity = '';
        btn.title = 'Clear filter';
      } else {
        btn.setAttribute('disabled', 'true');
        btn.style.opacity = '0.45';
        btn.title = 'No active filters';
      }
    } catch (e) {}
  }

  // now that logView exists, wire up the log controls we added earlier
  const logPauseBtn = panel.querySelector('#log-pause-btn');
  const autoscrollCheckbox = panel.querySelector('#autoscroll-checkbox');
  const logClearBtn = panel.querySelector('#log-clear-btn');
  const logExportBtn = panel.querySelector('#log-export-btn');
  const logSearchInput = panel.querySelector('#log-search-input');

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

  // Dev console ingest toggle wiring
  try {
    const devIngestCheckbox = panel.querySelector('#dev-console-ingest-checkbox');
    if (devIngestCheckbox) {
      // initialize checkbox from current settings
      devIngestCheckbox.checked = !!settings.ingestEnabled;
      devIngestCheckbox.addEventListener('change', (e) => {
        try {
          const enabled = !!e.target.checked;
          settings.ingestEnabled = enabled;
          if (enabled) {
            // install if not already installed
            if (!panel.__disposeConsoleIngest) panel.__disposeConsoleIngest = installConsoleIngest({ debugLog, settings });
          } else {
            // dispose if installed
            try { if (panel.__disposeConsoleIngest) { panel.__disposeConsoleIngest(); panel.__disposeConsoleIngest = null; } } catch (err) {}
          }
        } catch (err) {}
      });
    }
  } catch (e) {}

  // wire search/filter to debug-log API (setFilterText/setFilterLevel)
  // wire search/filter to debug-log API (setFilterText/setFilterLevel)
  try {
    // debounce helper to avoid frequent re-render while typing
    function debounce(fn, wait = 150) {
      let timer = null;
      return function debounced(...args) {
        try { if (timer) clearTimeout(timer); } catch (e) {}
        timer = setTimeout(() => { try { fn(...args); } catch (e) {} }, wait);
      };
    }

    const debouncedSetFilterText = debounce((v) => setFilterText(v), 150);
    logSearchInput.addEventListener('input', (e) => { debouncedSetFilterText(e.target.value); try { updateClearFilterState(); } catch (e) {} });
    // allow Escape to clear filter when search is focused
    logSearchInput.addEventListener('keydown', (e) => {
      try {
        if (e.key === 'Escape' || e.key === 'Esc') {
          e.preventDefault();
          logSearchInput.value = '';
          setFilterText('');
          // reset verbosity select to INFO
          const verbositySel = panel.querySelector('#log-verbosity-select'); if (verbositySel) verbositySel.value = 'INFO';
          setFilterLevel(null);
          updateClearFilterState();
        }
      } catch (err) {}
    });

    // Also reuse verbosity control to filter by level when set to ERROR/WARN/DEBUG etc.
    const verbosityFilterEl = panel.querySelector('#log-verbosity-select');
    verbosityFilterEl.addEventListener('change', (e) => {
      const val = e.target.value;
      // treat INFO as no strict level filter
  setFilterLevel(val === 'INFO' ? null : val);
  try { updateClearFilterState(); } catch (e) {}
    });
  } catch (e) { /* non-fatal */ }

  // ensure clear filter initial state is correct
  try { updateClearFilterState(); } catch (e) {}

  // no-op: setLogView flushed buffered logs

  engine.onStateChange(state => {
    // ... (all the other state syncs are unchanged)
  try { if (autoFpsEl) autoFpsEl.checked = !!state.autoFPS; } catch (e) {}
  try { if (workerEl) workerEl.checked = !!state.enableFrameWorker; } catch (e) {}
  try { if (transferEl) transferEl.checked = !!state.workerTransferEnabled; } catch (e) {}
    if (actions && actions.startStopBtn) {
      try { actions.startStopBtn.querySelector('button').textContent = state.isProcessing ? 'Stop Processing' : 'Start Processing'; } catch (e) {}
    }
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