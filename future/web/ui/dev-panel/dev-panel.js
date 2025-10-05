// File: web/ui/dev-panel/dev-panel.js (Renamed from debug-ui.js)

// Settings will be provided via initializer config to avoid implicit global coupling
let _config = {};
import { setOutputCallback } from '../../utils/core-logger.js';
import { getAudioDiagnostics } from '../../audio/audio-processor.js';
import { debugLog, setLogView, clearLogs, exportLogs, setPaused } from '../log-viewer.js';
import { structuredLog } from '../../utils/logging.js';
import { executeNonCriticalOperation, createMinimalFallback } from '../../utils/error-handling.js';
import { createAndWireActions } from './dev-panel.actions.js';
import { applyLayoutAndBehaviors } from './dev-panel-layout.js';
import { initializeDevPanelRenderer } from './dev-panel-renderer.js'; // renamed for clarity
import { StateInspector } from './state-inspector.js';
import { BUILD_VERSION, AUDIO_VERSION, VIDEO_VERSION, UI_VERSION, LANGUAGES_VERSION, UTILS_VERSION } from '../../core/constants.js';
import { registerComponent } from '../ui-registry.js';

// Log available version constants and fallbacks to help detect missing values early.
console.log('dev-panel module loaded. Versions:', {
  BUILD_VERSION,
  AUDIO_VERSION,
  VIDEO_VERSION,
  UI_VERSION,
  LANGUAGES_VERSION,
  UTILS_VERSION
});

export function initializeDevPanel(arg1, arg2) {
  // R24925 Support two call patterns for migration:
  //  - initializeDevPanel(engine, DOM)  (legacy)
  //  - initializeDevPanel({ engine, engineDispatch, dom, getEngineState }) (DI)
  let engine = null;
  let DOM = null;
  const skipDiagnostics = false;
  if (arg1 && typeof arg1.getState === 'function') {
    engine = arg1;
    DOM = arg2 || (typeof window !== 'undefined' ? window.DOM : undefined);
  } else {
    const cfg = arg1 || {};
    engine = cfg.engine || (cfg.engineDispatch ? { dispatch: cfg.engineDispatch, getState: cfg.getEngineState || (()=>({})), onStateChange: cfg.onStateChange || (()=>{}) } : null);
    DOM = cfg.dom || arg2 || (typeof window !== 'undefined' ? window.DOM : undefined);
  }
  // Ensure safe engine / DOM defaults to avoid crashing during migration
  engine = engine || { dispatch: () => {}, getState: () => ({}), onStateChange: () => {} };
  DOM = DOM || (typeof window !== 'undefined' ? window.DOM : undefined);
  // Merge config for use in internal helpers
  _config = Object.assign({}, _config, (typeof arg1 === 'object' && !arg1.getState) ? arg1 : (arg2 && typeof arg2 === 'object' ? arg2 : {}));
  console.log('initializeDevPanel called (visible)');

  const panel = document.createElement('div');
  panel.id = 'acoustsee-dev-panel';
  const root = (DOM && DOM.uiPanelRoot) || document.body;
  root.appendChild(panel);

  // Start hidden. Panel will be rendered, styled, and wired on activation.
  panel.style.display = 'none';

  // Activation handler: renders HTML, loads CSS, wires UI, and shows the panel.
  const onAppPoweredOn = () => {
    console.log('Activating Dev Panel in response to app:poweredOn event.');

    // 1) Render HTML structure
    try {
      panel.innerHTML = `
        <div class="devpanel-main-content">
          <div class="devpanel-header">
            <h1>Developer Panel</h1>
            <div id="devpanel-subtitle">Versions: Loading...</div>
          </div>

          <div class="devpanel-section state-section">
            <h2 class="section-header">
              <span>State Inspector</span>
              <input type="text" placeholder="Filter" id="state-filter-external" class="header-filter" />
              <button class="collapse-btn" data-target="state-content" aria-expanded="true" title="Collapse Inspector">-</button>
            </h2>
            <div id="state-content" class="section-content">
              <!-- StateInspector component will be rendered here -->
            </div>
          </div>

          <!-- Side-by-side Worker and Video Preview, always aligned -->
          <div class="devpanel-row devpanel-row-balanced">
            <div id="worker-explorer-container" class="devpanel-section worker-section">
              <h2 class="section-header">
                <span>Worker Performance</span>
                <span class="section-header-spacer"></span>
                <button class="collapse-btn" data-target="worker-content" aria-expanded="true" title="Collapse Worker Stats">-</button>
              </h2>
              <div id="worker-content" class="section-content">
                <div id="worker-explorer-legend"></div>
                <canvas id="worker-explorer-canvas" width="360" height="96"></canvas>
              </div>
            </div>

            <div class="devpanel-section video-section">
              <h2 class="section-header">
                <span>Live Video Preview</span>
                <span class="section-header-spacer"></span>
                <button class="collapse-btn" data-target="video-content" aria-expanded="true" title="Collapse Video Preview">-</button>
              </h2>
              <div id="video-content" class="section-content video-content">
                <!-- Replaced the <video> preview with a low-overhead processing preview canvas. -->
                <div id="devpanel-preview-container" class="preview-container">
                  <div class="preview-toggle-row">
                    <input type="checkbox" id="devpanel-preview-toggle" aria-label="Show processing preview (low FPS)" />
                    <label for="devpanel-preview-toggle">Processing Preview (2–5 FPS)</label>
                  </div>
                  <canvas id="devpanel-preview-canvas" width="320" height="240"></canvas>
                  <p class="perf-note">Note: This preview samples the processing canvas at low FPS to avoid extra decoders.</p>
                </div>
              </div>
            </div>
          </div>

          <div class="devpanel-section controls-section">
            <h2 class="section-header"><span>Controls</span></h2>
            <div class="section-content">
              <div class="devpanel-actions-grid">
                <button data-action="toggleProcessing" type="button">Start / Stop</button>
                <button data-action="resumeAudio" type="button">Resume Audio</button>
                <button data-action="saveSettings" type="button">Save Settings</button>
                <button data-action="loadSettings" type="button">Load Settings</button>
              </div>
              <div class="controls-grid-2col">
                <div class="control-column">
                  <label>Operating Mode</label>
                  <select id="mode-select">
                    <option value="flow">Flow (Navigation)</option>
                    <option value="focus">Focus (Identification)</option>
                  </select>
                  <label>Grid Type</label>
                  <select id="grid-type-select"></select>
                  <label>Motion Threshold</label>
                  <div class="slider-container">
                    <input id="motion-threshold-slider" type="range" min="0" max="1" step="0.01" value="0.20"><span id="motion-threshold-value">0.20</span>
                  </div>
                </div>
                <div class="control-column">
                  <label>Synth Engine</label>
                  <select id="synth-engine-select"></select>
                  <label>Max Notes</label>
                  <div class="slider-container">
                    <input id="max-notes-slider" type="range" min="1" max="64" value="16"><span id="max-notes-value">16</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div class="devpanel-row two-col">
            <div class="devpanel-section performance-section">
              <h2 class="section-header">
                <span>Performance Controls</span>
                <span class="section-header-spacer"></span>
                <button class="collapse-btn" data-target="performance-controls-content" aria-expanded="true" title="Collapse Performance Controls">-</button>
              </h2>
              <div id="performance-controls-content" class="section-content">
                <div class="performance-grid">
                  <div class="control-column">
                    <label>FPS Mode</label>
                    <select id="fps-mode-select">
                      <option value="auto">Auto (Adaptive)</option>
                      <option value="manual">Manual</option>
                    </select>
                    <label>Target FPS (Manual)</label>
                    <div class="slider-container">
                      <input id="target-fps-slider" type="range" min="4" max="30" step="1" value="15">
                      <span id="target-fps-value">15</span>
                    </div>
                  </div>
                  <div class="control-column">
                    <label>Frame Skip Rate</label>
                    <div class="slider-container">
                      <input id="frame-skip-slider" type="range" min="1" max="4" step="1" value="1">
                      <span id="frame-skip-value">1</span>
                    </div>
                    <label>Resolution Scale</label>
                    <div class="slider-container">
                      <input id="resolution-scale-slider" type="range" min="0.25" max="1.0" step="0.25" value="1.0">
                      <span id="resolution-scale-value">1.0</span>
                    </div>
                  </div>
                </div>
                <div class="performance-actions">
                  <button data-action="resetThrottling" type="button">Reset Throttling</button>
                  <button data-action="applyThrottling" type="button">Apply Manual Throttling</button>
                </div>
              </div>
            </div>

            <div class="devpanel-section ingest-section">
              <h2 class="section-header">
                <span>Performance Analytics</span>
                <button class="collapse-btn" data-target="ingest-content" aria-expanded="true" title="Collapse Analytics">-</button>
              </h2>
              <div id="ingest-content" class="section-content">
                <div class="ingest-grid">
                  <div class="control-column">
                    <label class="inline-checkbox"><input id="ingest-enabled-checkbox" type="checkbox" checked> <span>Analytics Enabled</span></label>
                    <label class="inline-checkbox"><input id="battery-optimization-checkbox" type="checkbox" checked> <span>Battery Optimization</span></label>
                    <label>Max Events/Second</label>
                    <select id="ingest-rate-select">
                      <option value="1">Minimal (1/sec)</option>
                      <option value="2">Low Battery (2/sec)</option>
                      <option value="5">Low (5/sec)</option>
                      <option value="10" selected>Normal (10/sec)</option>
                      <option value="30">High (30/sec)</option>
                      <option value="60">Debug (60/sec)</option>
                    </select>
                  </div>
                  <div class="control-column">
                    <label>Event Categories</label>
                    <div class="category-toggles">
                      <label class="category-toggle">
                        <input type="checkbox" data-category="user_workflow" checked>
                        <span class="toggle-label">User Workflow</span>
                      </label>
                      <label class="category-toggle">
                        <input type="checkbox" data-category="auto_optimization" checked>
                        <span class="toggle-label">Auto Optimization</span>
                      </label>
                      <label class="category-toggle">
                        <input type="checkbox" data-category="performance_critical">
                        <span class="toggle-label">Performance Critical</span>
                      </label>
                      <label class="category-toggle">
                        <input type="checkbox" data-category="performance_settings">
                        <span class="toggle-label">Performance Settings</span>
                      </label>
                    </div>
                  </div>
                </div>
                <div class="ingest-actions">
                  <button data-action="updateIngestSettings" type="button">Apply Settings</button>
                  <button data-action="exportIngestLogs" type="button">Export Analytics</button>
                </div>
              </div>
            </div>
          </div>

          <div class="devpanel-section logs-section">
            <h2 class="section-header"><span>Live Logs</span></h2>
            <div class="section-content">
              <div class="log-controls">
                <button id="log-pause-btn" type="button">Pause</button>
                <button id="log-clear-btn" type="button">Clear</button>
                <button id="log-export-btn" type="button">Export</button>
              </div>
              <div id="devpanel-log-view"></div>
            </div>
          </div>
        </div>
      `;
    } catch (e) {
      return executeNonCriticalOperation('dev-panel', () => {
        throw e; // Re-throw to trigger fallback
      }, (error) => {
        const fallback = createMinimalFallback('dev-panel', error);
        
        // Add basic controls for core accessibility functions
        const basicControls = document.createElement('div');
        basicControls.innerHTML = `
          <div style="margin-top: 16px; padding: 12px; background: #f8f9fa; border-radius: 4px;">
            <h4 style="margin: 0 0 8px 0;">Basic Controls (Core Accessibility Unaffected)</h4>
            <button onclick="location.reload()" style="
              background: #007bff; 
              color: white; 
              border: none; 
              padding: 8px 16px; 
              border-radius: 4px; 
              margin-right: 8px;
              cursor: pointer;
            ">Reload App</button>
            <button onclick="console.log('Engine state:', window.engine?.getState())" style="
              background: #6c757d; 
              color: white; 
              border: none; 
              padding: 8px 16px; 
              border-radius: 4px;
              cursor: pointer;
            ">Log State</button>
          </div>
        `;
        
        fallback.appendChild(basicControls);
        panel.appendChild(fallback);
        return; // Don't continue initialization
      });
    }

    // 2) Define wiring function which will be called after CSS is loaded
    const wireUpUI = async () => {
      try {
        await setupUI(); // setupUI is declared below
        panel.style.display = 'flex';
      } catch (e) {
        console.error('Dev Panel setupUI failed during wiring', e);
      }
    };

    // 3) Load stylesheet and call wireUpUI once loaded (or immediately if already present)
    try {
      // Replace brittle candidate fallback logic with a single, deterministic loader
      function loadCss() {
        const cssId = 'acoustsee-dev-panel-css';
        if (document.getElementById(cssId)) {
          wireUpUI();
          return;
        }

        const base = (
          (_config && _config.basePath) ||
          ((_config && _config.importMetaUrl) ? new URL('.', _config.importMetaUrl).href : null) ||
          (typeof document !== 'undefined' ? document.baseURI : './')
        );

        const href = new URL('ui/dev-panel/dev-panel.css', base).href;

        const link = document.createElement('link');
        link.id = cssId;
        link.rel = 'stylesheet';
        link.href = href;
        try { console.debug && console.debug('Dev Panel: attempting to load CSS from', link.href); } catch (e) {}

        link.onload = () => {
          try { console.debug && console.debug('Dev Panel CSS loaded:', link.href); } catch (e) {}
          wireUpUI();
        };

        link.onerror = (e) => {
          try { console.error && console.error('Dev Panel: stylesheet failed to load', { path: link.href, error: e }); } catch (err) {}
          // attempt to wire up unstyled UI so functionality remains available
          wireUpUI();
        };

        document.head.appendChild(link);
      }

      // Invoke the loader
      loadCss();
    } catch (e) {
      console.warn('Exception loading dev-panel stylesheet', e);
      try { wireUpUI(); } catch (_) {}
    }
  };

  async function setupUI() {
    // This panel is now full-screen by default via its CSS.

    // --- Wire All Collapsible Sections (with special logic for worker chart) ---
    let workerChartRenderLoopId = null;
    try {
      // Prepare the chart rendering function once.
      const workerCanvas = panel.querySelector('#worker-explorer-canvas');
      const legendEl = panel.querySelector('#worker-explorer-legend');
      const { RingBuffer, scaleCanvasForDPR, drawMultiSparkline } = (await import('./worker-charts.js'));
      const workerDataBuffers = new Map();
      scaleCanvasForDPR(workerCanvas);

      const renderCharts = () => {
        if (!window.__acoustseeDevPanelGetWorkerStats) return;
        const stats = window.__acoustseeDevPanelGetWorkerStats();
        // Include aggregated stats from video worker
        if (window.__acoustseeWorkerStats) {
          window.__acoustseeWorkerStats.forEach((stat, id) => stats.push(stat));
        }
        const seriesMap = new Map();
        let legendHTML = '';
        stats.forEach((workerStat, i) => {
          if (!workerDataBuffers.has(workerStat.id)) {
            workerDataBuffers.set(workerStat.id, new RingBuffer(64));
          }
          const buffer = workerDataBuffers.get(workerStat.id);
          buffer.push(workerStat.last ? workerStat.last.util : 0);
          seriesMap.set(workerStat.id, buffer.toArray());
          const color = `hsl(${(i * 137) % 360}, 72%, 58%)`;
          legendHTML += `<span style="color: ${color}; margin-right: 10px;">■ ${workerStat.name || workerStat.id}</span>`;
        });
        if (legendEl) legendEl.innerHTML = legendHTML;
        drawMultiSparkline(workerCanvas, seriesMap);
      };

      // Create a rendering loop using requestAnimationFrame
      let lastRenderTime = 0;
      const renderLoop = (timestamp) => {
        // Limit rendering to ~4 FPS (once every 250ms)
        if (timestamp - lastRenderTime >= 250) {
          lastRenderTime = timestamp;
          renderCharts();
        }
        // Continue the loop
        workerChartRenderLoopId = requestAnimationFrame(renderLoop);
      };

      const startChart = () => {
        if (workerChartRenderLoopId === null) {
          lastRenderTime = performance.now();
          workerChartRenderLoopId = requestAnimationFrame(renderLoop);
        }
      };
      const stopChart = () => {
        if (workerChartRenderLoopId !== null) {
          cancelAnimationFrame(workerChartRenderLoopId);
          workerChartRenderLoopId = null;
        }
      };

      // Set up click handlers for all collapsible section headers
      panel.querySelectorAll('.section-header').forEach(headerEl => {
        const sectionEl = headerEl.closest('.devpanel-section');
        const btn = headerEl.querySelector('.collapse-btn');
        if (!btn) return;
        if (btn.getAttribute('aria-expanded') === 'false') sectionEl.classList.add('collapsed');

        // Only the button toggles collapse, not the whole header
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const isNowCollapsed = sectionEl.classList.toggle('collapsed');
          btn.textContent = isNowCollapsed ? '+' : '-';
          btn.setAttribute('aria-expanded', String(!isNowCollapsed));
          if (sectionEl.classList.contains('worker-section')) {
            isNowCollapsed ? stopChart() : startChart();
          }
          if (sectionEl.classList.contains('video-section')) {
            const previewToggle = panel.querySelector('#devpanel-preview-toggle');
            const wantsPreview = previewToggle && previewToggle.checked;
            if (isNowCollapsed) {
              if (typeof panel.__stopPreview === 'function') panel.__stopPreview();
            } else if (wantsPreview && typeof panel.__startPreview === 'function') {
              panel.__startPreview(4);
            }
          }
        });
      });
      
      // Starts the worker chart if it's visible on initial load.
      const workerSection = panel.querySelector('#worker-explorer-container');
      if (workerSection && !workerSection.classList.contains('collapsed')) {
        // Add a small delay to ensure workers are registered and data is available
        setTimeout(() => {
          startChart();
        }, 500);
      }

      // Also use Page Visibility API to globally pause the chart
      document.addEventListener('visibilitychange', () => {
        // Find the worker section element safely.
        const workerSection = panel.querySelector('#worker-explorer-container'); // <-- CORRECT SELECTOR
        if (!workerSection) return; // Defensive check

        if (document.hidden) {
          stopChart();
        } else if (!workerSection.classList.contains('collapsed')) { 
          // Only restart if it was supposed to be running
          startChart();
        }
      });

      // Start chart when processing begins (workers become active)
      engine.onStateChange && engine.onStateChange(state => {
        const workerSection = panel.querySelector('#worker-explorer-container');
        if (workerSection && !workerSection.classList.contains('collapsed')) {
          if (state.isProcessing && workerChartRenderLoopId === null) {
            // Processing started and chart isn't running - start it
            startChart();
          } else if (!state.isProcessing && workerChartRenderLoopId !== null) {
            // Processing stopped - optionally keep chart running to show final data
            stopChart(); // Uncomment if you want chart to stop when processing stops
          }
        }
      });

    } catch (e) { console.error('Failed to wire collapse buttons or worker chart', e); }

    // --- Populate Version Subtitle ---
    try {
      const subtitle = panel.querySelector('#devpanel-subtitle');
      const metaVer = document.querySelector('meta[name="acoustsee-version"]')?.getAttribute('content');
      const ver = metaVer || window.ACOUSTSEE_VERSION || window.ACOUSTSEE_APP_VERSION || BUILD_VERSION;
      subtitle.textContent = `Build: ${ver} | Audio: ${AUDIO_VERSION || 'n/a'} | Video: ${VIDEO_VERSION || 'n/a'} | UI: ${UI_VERSION || 'n/a'} | Utils: ${UTILS_VERSION || 'n/a'}`;
    } catch (e) {}

    // --- Cost-Effective Processing Canvas Preview Wiring ---
    try {
      const pickProcessingCanvas = () =>
        (DOM && (DOM.frameCanvas || DOM.videoCanvas)) ||
        document.querySelector('canvas#frameCanvas, canvas#frame-canvas, canvas[data-role="frame-canvas"]');

      const previewCanvas = panel.querySelector('#devpanel-preview-canvas');
      const previewToggle = panel.querySelector('#devpanel-preview-toggle');

      panel.__previewInterval = null;
      panel.__previewRO = null;

      if (!previewCanvas || !previewToggle) {
        return;
      }

      const previewCtx = previewCanvas.getContext('2d', { alpha: false });
      panel.__previewCtx = previewCtx;
      previewCanvas.style.display = 'none';

      let activeSource = null;
      let loggedMissingSource = false;
      const MAX_WIDTH = 360;
      const MAX_HEIGHT = 270;

      const getSourceDimensions = (src) => {
        if (!src) return { width: 0, height: 0 };
        const width = src.videoWidth || src.width || src.clientWidth || 0;
        const height = src.videoHeight || src.height || src.clientHeight || 0;
        return { width, height };
      };

      const resizePreview = (src) => {
        try {
          if (!src || !previewCanvas) return;
          const { width: sw, height: sh } = getSourceDimensions(src);
          if (!sw || !sh) return;
          const parent = previewCanvas.parentElement;
          const widthLimit = Math.max(1, Math.min(MAX_WIDTH, parent?.clientWidth || MAX_WIDTH));
          const heightLimitSource = parent?.clientHeight || MAX_HEIGHT;
          const heightLimit = Math.max(1, Math.min(MAX_HEIGHT, heightLimitSource || MAX_HEIGHT));
          const ratio = Math.min(widthLimit / sw, heightLimit / sh, 1);
          const w = Math.max(1, Math.round(sw * ratio));
          const h = Math.max(1, Math.round(sh * ratio));
          previewCanvas.width = w;
          previewCanvas.height = h;
          previewCanvas.style.width = `${w}px`;
          previewCanvas.style.height = `${h}px`;
        } catch (_) {}
      };

      const detachSource = () => {
        if (panel.__previewRO) {
          try { panel.__previewRO.disconnect(); } catch (_) {}
        }
        panel.__previewRO = null;
        activeSource = null;
      };

      const resolvePreviewSource = () => {
        const candidates = [];
        if (DOM?.videoFeed) candidates.push(DOM.videoFeed);
        const docVideoFeed = document.querySelector('video#videoFeed');
        if (docVideoFeed && docVideoFeed !== DOM?.videoFeed) candidates.push(docVideoFeed);
        const processingCanvas = pickProcessingCanvas();
        if (processingCanvas) candidates.push(processingCanvas);

        for (const candidate of candidates) {
          const { width, height } = getSourceDimensions(candidate);
          const ready = typeof candidate.readyState === 'number' ? candidate.readyState >= 2 : true;
          if (ready && width > 0 && height > 0) {
            return candidate;
          }
        }
        return null;
      };

      const ensureSource = () => {
        const src = resolvePreviewSource();
        if (!src) {
          if (!loggedMissingSource) {
            structuredLog('DEBUG', 'dev-panel', { message: 'Preview source not ready yet' });
            loggedMissingSource = true;
          }
          return null;
        }

        loggedMissingSource = false;

        if (src !== activeSource) {
          detachSource();
          activeSource = src;
          resizePreview(src);
          try {
            panel.__previewRO = new ResizeObserver(() => resizePreview(src));
            panel.__previewRO.observe(src);
          } catch (_) {}
        }

        return src;
      };

      const drawFrame = () => {
        const src = ensureSource();
        if (!src || !previewCtx) return;
        const { width, height } = getSourceDimensions(src);
        if (!width || !height) return;
        if (previewCanvas.width === 0 || previewCanvas.height === 0) {
          resizePreview(src);
        }
        try {
          previewCtx.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
          previewCtx.drawImage(src, 0, 0, previewCanvas.width, previewCanvas.height);
        } catch (_) {}
      };

      const startPreview = (fps = 4) => {
        if (panel.__previewInterval) return;
        previewCanvas.style.display = 'block';
        ensureSource();
        const intervalMs = Math.max(1000 / fps, 200);
        panel.__previewInterval = setInterval(drawFrame, intervalMs);
      };

      const stopPreview = () => {
        if (panel.__previewInterval) {
          clearInterval(panel.__previewInterval);
          panel.__previewInterval = null;
        }
        detachSource();
        loggedMissingSource = false;
        if (previewCanvas && previewCtx) {
          previewCtx.clearRect(0, 0, previewCanvas.width || 0, previewCanvas.height || 0);
        }
        if (previewCanvas) {
          previewCanvas.style.display = 'none';
        }
      };

      panel.__startPreview = startPreview;
      panel.__stopPreview = stopPreview;

      const handleVideoReady = () => {
        if (!DOM?.videoFeed) return;
        if (previewToggle.checked) {
          resizePreview(DOM.videoFeed);
          if (!panel.__previewInterval) startPreview(4);
        }
      };

      if (DOM?.videoFeed) {
        try {
          DOM.videoFeed.addEventListener('loadedmetadata', handleVideoReady, { passive: true });
          DOM.videoFeed.addEventListener('playing', handleVideoReady, { passive: true });
        } catch (_) {}
        panel.__detachPreviewVideoEvents = () => {
          try { DOM.videoFeed.removeEventListener('loadedmetadata', handleVideoReady); } catch (_) {}
          try { DOM.videoFeed.removeEventListener('playing', handleVideoReady); } catch (_) {}
        };
      } else {
        panel.__detachPreviewVideoEvents = () => {};
      }

      previewToggle.addEventListener('change', (e) => {
        if (e.target.checked) startPreview(4);
        else stopPreview();
      }, { passive: true });

      setTimeout(() => {
        if (previewToggle.checked) startPreview(4);
      }, 600);

      engine.onStateChange((state) => {
        if (!state) return;
        if (state.isProcessing && previewToggle.checked && !panel.__previewInterval) {
          startPreview(4);
        }
      });

    } catch (e) { console.error('Failed to wire processing preview', e); }

    // --- Wire Core Action Buttons & Renderer ---
    try {
      const actionsModule = createAndWireActions(panel, engine, DOM, skipDiagnostics);
      if (actionsModule && typeof actionsModule.dispose === 'function') {
        panel.__devActionsDispose = actionsModule.dispose;
      }
      initializeDevPanelRenderer(engine, DOM);
    } catch (e) {
      console.error('initializeDevPanel: createAndWireActions/Renderer failed', e);
    }

    // --- Wire Log Viewer Controls ---
    const logView = panel.querySelector('#devpanel-log-view');
    setLogView(logView);
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

    // --- Dynamically Populate Grid and Synth Dropdowns from Central State ---
    try {
      const state = engine.getState(); // Get the current application state

      // Populate Grid Type Select
      const gridSelect = panel.querySelector('#grid-type-select');
      if (gridSelect && Array.isArray(state.availableGrids)) {
        gridSelect.innerHTML = ''; // Clear any existing options
        state.availableGrids.forEach(grid => {
          const option = document.createElement('option');
          option.value = grid.id;
          // Use the user-friendly name from meta if available, otherwise use the ID
          option.textContent = (grid.meta && grid.meta.name) || grid.id;
          gridSelect.appendChild(option);
        });
        // Set the initial value from the state
        if (state.gridType) {
          gridSelect.value = state.gridType;
        }
      }

      // Populate Synth Engine Select
      const synthSelect = panel.querySelector('#synth-engine-select');
      if (synthSelect && Array.isArray(state.availableEngines)) {
        synthSelect.innerHTML = ''; // Clear any existing options
        state.availableEngines.forEach(engineMeta => {
          const option = document.createElement('option');
          option.value = engineMeta.id;
          // The structure from available-synths.js is slightly different
          option.textContent = (engineMeta.meta && engineMeta.meta.name) || engineMeta.id;
          synthSelect.appendChild(option);
        });
        // Set the initial value from the state
        if (state.synthesisEngine) {
          synthSelect.value = state.synthesisEngine;
        }
      }
    } catch (e) {
      structuredLog('ERROR', 'Failed to dynamically populate dropdowns from state', { error: e.message });
    }

    // --- Initialize Visual State Inspector ---
    try {
      const stateSection = panel.querySelector('#state-content');
      if (stateSection) {
        // Create new visual state inspector
        const stateInspector = new StateInspector(stateSection, engine);
        // Store reference for cleanup
        panel.__stateInspector = stateInspector;
        // If header filter exists, forward its input to internal filter
        const externalFilter = panel.querySelector('#state-filter-external');
        if (externalFilter && typeof stateInspector.filterState === 'function') {
          externalFilter.addEventListener('input', (e) => {
            stateInspector.filterState(e.target.value.toLowerCase());
          });
        }
        // NOTE: removed standalone video size label. Video dimensions are now
        // pushed to engine state by media-commands and rendered inside the
        // State Inspector (group: Video Settings) as `videoSize`.
        structuredLog('INFO', 'dev-panel', 'Visual state inspector initialized');
      }
    } catch (e) {
      structuredLog('ERROR', 'dev-panel', 'Failed to initialize state inspector', { error: e.message });
      // Fallback to simple text display
      const stateSection = panel.querySelector('#state-content');
      if (stateSection) {
        stateSection.innerHTML = '<div style="color: #e74c3c; padding: 8px;">State inspector failed to load. Check console for details.</div>';
      }
    }

    // --- Control Synchronization ---
    const gridTypeSelect = panel.querySelector('#grid-type-select');
    const synthEngineSelect = panel.querySelector('#synth-engine-select');
    const modeSelect = panel.querySelector('#mode-select');
    const maxNotesSlider = panel.querySelector('#max-notes-slider');
    const maxNotesValue = panel.querySelector('#max-notes-value');
    const motionThresholdSlider = panel.querySelector('#motion-threshold-slider');
    const motionThresholdValue = panel.querySelector('#motion-threshold-value');
    const ingestRateSelect = panel.querySelector('#ingest-rate-select');
    const ingestEnabledCheckbox = panel.querySelector('#ingest-enabled-checkbox');
    const batteryOptimizationCheckbox = panel.querySelector('#battery-optimization-checkbox');
    const ingestCategoryToggles = panel.querySelectorAll('.category-toggle input[type="checkbox"]');

    // Sync controls with state changes
    engine.onStateChange(state => {
      try {
        if (gridTypeSelect) gridTypeSelect.value = state.gridType;
        if (synthEngineSelect) synthEngineSelect.value = state.synthesisEngine;
        if (modeSelect) modeSelect.value = state.currentMode;
        if (maxNotesSlider) maxNotesSlider.value = state.maxNotes;
        if (maxNotesValue) maxNotesValue.textContent = state.maxNotes;
        if (motionThresholdSlider) motionThresholdSlider.value = state.motionThreshold;
        if (motionThresholdValue) motionThresholdValue.textContent = state.motionThreshold;
        // Update ingest controls
        if (ingestEnabledCheckbox) ingestEnabledCheckbox.checked = state.ingestEnabled;
        if (batteryOptimizationCheckbox) batteryOptimizationCheckbox.checked = state.ingestPreferences?.useIdleCallback || false;
        if (ingestRateSelect) ingestRateSelect.value = state.ingestPreferences?.maxEventsPerSecond || 10;
        // Update category toggle selection
        if (ingestCategoryToggles && state.ingestCategories) {
          const enabledCategories = Object.keys(state.ingestCategories);
          ingestCategoryToggles.forEach(toggle => {
            toggle.checked = enabledCategories.includes(toggle.dataset.category);
          });
        }
      } catch(e) {}
    });

    setOutputCallback((level, text) => debugLog(level, text));
  }

  // --- Self-Activation Wiring ---
  // The Dev Panel listens for the 'app:poweredOn' event. This establishes a
  // clear contract: if the engine does not support `on`, fail fast and show
  // an explicit error in the panel for developers.
  try {
    if (!engine || typeof engine.on !== 'function') {
      throw new Error('Engine does not support the required event emitter interface (`on` method).');
    }

    let unsubscribe = null;
    const activationListener = () => {
      try {
        onAppPoweredOn();
      } catch (e) {
        console.warn('Dev Panel activation failed', e);
      }
      try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (_) {}
    };

    unsubscribe = engine.on('app:poweredOn', activationListener);
  } catch (err) {
    console.error('CRITICAL: Dev Panel self-activation wiring failed.', err);
    // Provide visible feedback in the panel so developers notice immediately.
    try {
      panel.style.display = 'block';
      panel.style.padding = '16px';
      panel.style.background = '#fff6f6';
      panel.style.border = '2px solid #d00';
      panel.textContent = `Dev Panel failed to initialize: ${err.message}. See console for details.`;
    } catch (e) {
      console.error('Failed to display error in dev panel DOM', e);
    }
  }

  // Add cleanup handler for state inspector
  const originalRemove = panel.remove;
  panel.remove = function() {
    try {
      if (this.__stateInspector && typeof this.__stateInspector.dispose === 'function') {
        this.__stateInspector.dispose();
      }
    } catch (_) {}
    try {
      if (typeof this.__stopPreview === 'function') {
        this.__stopPreview();
      }
      if (typeof this.__detachPreviewVideoEvents === 'function') {
        this.__detachPreviewVideoEvents();
      }
    } catch (_) {}
    return originalRemove.call(this);
  };
}

// Register initializer in the ui-registry for other modules to access later under the canonical name
try { registerComponent && registerComponent('dev-panel', initializeDevPanel); } catch (e) {}
