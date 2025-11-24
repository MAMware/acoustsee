// File: web/ui/dev-panel/dev-panel.js (Renamed from debug-ui.js)

// Settings will be provided via initializer config to avoid implicit global coupling
let _config = {};
import { setOutputCallback, setLogLevel } from '../../utils/core-logger.js';
import { getAudioDiagnostics } from '../../audio/audio-processor.js';
import { debugLog, setLogView, clearLogs, exportLogs, setPaused, initializeFromRingBuffer } from '../log-viewer.js';
import { structuredLog } from '../../utils/logging.js';
import { executeNonCriticalOperation, createMinimalFallback } from '../../utils/error-handling.js';
import { injectEarlyLogsToDevPanel, markDevPanelInitTime } from '../../utils/early-logs.js'; // Phase 2A Task 2.2
import { createAndWireActions } from './dev-panel.actions.js';
import { applyLayoutAndBehaviors } from './dev-panel-layout.js';
import { initializeDevPanelRenderer } from './dev-panel-renderer.js'; // renamed for clarity
import { StateInspector } from './state-inspector.js';
import { initializeOrchestrationInspector } from '../orchestration-inspector.js'; // Phase 2A: Orchestration visibility
import { initEventBusViewer } from './eventbus-viewer.js'; // Phase 2: EventBus viewer
import { initializePreview } from './dev-panel-preview.js'; // Extracted preview logic
import { initializeChartController } from './dev-panel-chart-controller.js'; // Extracted chart logic
import { initializeCustomization } from './dev-panel-customization.js'; // Phase 4: Customization System
// Do not import core constants here; version info is read from engine state (buildInfo)
import { registerComponent } from '../ui-registry.js';

// Module loaded. Version information is read from engine.getState().buildInfo at runtime.
console.log('dev-panel module loaded. Version info will be read from engine state at runtime.');

export function initializeDevPanel(arg1, arg2) {
  // Support both signatures:
  //  - New (v0.10.0+): initializeDevPanel(uiContext)
  //  - Legacy: initializeDevPanel(engine, DOM, { eventBus, ... })
  
  let engine = null;
  let DOM = null;
  let eventBus = null;
  let generateTraceId = null;
  const skipDiagnostics = false;
  
  // Detect new signature (uiContext object with standardized properties)
  if (arg1 && arg1.engine && arg1.DOM && arg1.eventBus) {
    // New standardized signature
    engine = arg1.engine;
    DOM = arg1.DOM;
    eventBus = arg1.eventBus;
    generateTraceId = arg1.generateTraceId;
    _config = Object.assign({}, _config, {
      settings: arg1.settings,
      basePath: arg1.basePath,
      importMetaUrl: arg1.importMetaUrl
    });
  } else if (arg1 && typeof arg1.getState === 'function') {
    // Legacy signature: initializeDevPanel(engine, DOM, { eventBus, ... })
    engine = arg1;
    DOM = arg2 || (typeof window !== 'undefined' ? window.DOM : undefined);
    // Check if third argument has eventBus
    const thirdArg = arguments[2];
    if (thirdArg && thirdArg.eventBus) {
      eventBus = thirdArg.eventBus;
    }
  } else {
    // Old DI signature (deprecated)
    const cfg = arg1 || {};
    engine = cfg.engine || (cfg.engineDispatch ? { dispatch: cfg.engineDispatch, getState: cfg.getEngineState || (()=>({})), onStateChange: cfg.onStateChange || (()=>{}) } : null);
    DOM = cfg.dom || arg2 || (typeof window !== 'undefined' ? window.DOM : undefined);
    eventBus = cfg.eventBus || null;
  }
  
  // Ensure safe engine / DOM defaults to avoid crashing during migration
  engine = engine || { dispatch: () => {}, getState: () => ({}), onStateChange: () => {} };
  DOM = DOM || (typeof window !== 'undefined' ? window.DOM : undefined);
  // Merge config for use in internal helpers
  _config = Object.assign({}, _config, (typeof arg1 === 'object' && !arg1.getState) ? arg1 : (arg2 && typeof arg2 === 'object' ? arg2 : {}));
  console.log('initializeDevPanel called (visible)');
  
  // If eventBus is available, subscribe to it for unified event viewing
  if (eventBus) {
    console.log('Dev Panel: EventBus available, can add unified event viewer');
    // Future enhancement: Add a tab to view all EventBus events (logs + commands)
    // For now, the existing setOutputCallback still works via core-logger
  }

  const panel = document.createElement('div');
  panel.id = 'acoustsee-dev-panel';
  const root = (DOM && DOM.uiPanelRoot) || document.body;
  root.appendChild(panel);

  // Start hidden. Panel will be rendered, styled, and wired on activation.
  panel.style.display = 'none';

  // Activation handler: renders HTML, loads CSS, wires UI, and shows the panel.
  const onAppPoweredOn = async () => {
    console.log('Activating Dev Panel in response to app:poweredOn event.');

    // Enable DEBUG level logging for the dev panel
    setLogLevel('DEBUG');
    structuredLog('INFO', 'Dev Panel: Log level set to DEBUG');

    // 1) Fetch and render HTML structure from external template
    try {
      const resp = await fetch(new URL('./dev-panel.html', import.meta.url));
      if (!resp.ok) throw new Error(`Failed to fetch template: ${resp.status} ${resp.statusText}`);
      const html = await resp.text();
      panel.innerHTML = html;
    } catch (e) {
      // Preserve original fallback behavior using executeNonCriticalOperation
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
        // --- START NEW BLOCK: Touch Pad Wiring ---
        try {
          const padArea = panel.querySelector('#touch-pad-area'); // Use the correct ID
          if (padArea) {
            const durationSlider = panel.querySelector('#pad-duration');
            const durationValue = panel.querySelector('#pad-duration-value');
            let isPadActive = false;
            let padStartTime = null; // Track when touch/click started

            // Wire up slider display
            let _padDurationHandler = null;
            if (durationSlider && durationValue) {
              _padDurationHandler = (e) => { durationValue.textContent = parseFloat(e.target.value).toFixed(1); };
              durationSlider.addEventListener('input', _padDurationHandler);
            }

            const generateCuesFromPad = (e) => {
              try {
                if (!isPadActive) return;
                const state = engine.getState && engine.getState();
                const currentGrid = state && state.availableGrids && state.availableGrids.find(g => g.id === state.gridType);
                if (!currentGrid) return;

                const rect = padArea.getBoundingClientRect();
                const x = (e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX)) - rect.left;
                const y = (e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY)) - rect.top;

                const mockMotionResults = { movingRegions: [{ x: x, y: y, intensity: 100 }] };

                const gridOutput = currentGrid.mapFunction && currentGrid.mapFunction(null, rect.width, rect.height, null, mockMotionResults);
                if (gridOutput && gridOutput.cues && gridOutput.cues.length > 0) {
                  // If user set a pad duration, attach it to each generated cue
                  const padDur = durationSlider ? parseFloat(durationSlider.value) : undefined;
                  if (typeof padDur === 'number' && !Number.isNaN(padDur)) {
                    gridOutput.cues.forEach(c => { c.duration = c.duration || padDur; });
                    structuredLog('DEBUG', 'Touch Pad: Duration attached to cues', { duration: padDur, cueCount: gridOutput.cues.length });
                  }
                  engine.dispatch && engine.dispatch('audioPlayCues', { cues: gridOutput.cues });
                }
              } catch (err) { structuredLog('ERROR', 'Touch Pad generate error', { error: err?.message || String(err) }); }
            };

            const onPointerDown = (e) => {
              isPadActive = true;
              padStartTime = performance.now(); // Record start time
              try { padArea.setPointerCapture && padArea.setPointerCapture(e.pointerId); } catch (e) { structuredLog('WARN', 'Dev Panel: Failed to set pointer capture', { error: e?.message || String(e) }); }
              generateCuesFromPad(e);
            };

            const onPointerUp = (e) => {
              isPadActive = false;
              // Log the touch/click duration for debugging
              if (padStartTime !== null) {
                const duration = performance.now() - padStartTime;
                structuredLog('DEBUG', 'Touch Pad: Interaction ended', { 
                  interactionDuration: Math.round(duration), 
                  expectedNoteDuration: durationSlider ? parseFloat(durationSlider.value) : 'unknown' 
                });
                padStartTime = null;
              }
              try { padArea.releasePointerCapture && padArea.releasePointerCapture(e.pointerId); } catch (e) { structuredLog('WARN', 'Dev Panel: Failed to release pointer capture', { error: e?.message || String(e) }); }
              engine.dispatch && engine.dispatch('audioPlayCues', { cues: [] });
            };

            padArea.addEventListener('pointerdown', onPointerDown);
            padArea.addEventListener('pointermove', generateCuesFromPad);
            padArea.addEventListener('pointerup', onPointerUp);
            padArea.addEventListener('pointerleave', onPointerUp);

            // Store a cleanup function on the panel for the main dispose function
            panel.__touchPadCleanup = () => {
              try { padArea.removeEventListener('pointerdown', onPointerDown); } catch (e) { structuredLog('WARN', 'Dev Panel: Failed to remove pointerdown listener', { error: e?.message || String(e) }); }
              try { padArea.removeEventListener('pointermove', generateCuesFromPad); } catch (e) { structuredLog('WARN', 'Dev Panel: Failed to remove pointermove listener', { error: e?.message || String(e) }); }
              try { padArea.removeEventListener('pointerup', onPointerUp); } catch (e) { structuredLog('WARN', 'Dev Panel: Failed to remove pointerup listener', { error: e?.message || String(e) }); }
              try { padArea.removeEventListener('pointerleave', onPointerUp); } catch (e) { structuredLog('WARN', 'Dev Panel: Failed to remove pointerleave listener', { error: e?.message || String(e) }); }
              try { if (_padDurationHandler && durationSlider) durationSlider.removeEventListener('input', _padDurationHandler); } catch (e) { structuredLog('WARN', 'Dev Panel: Failed to remove duration slider listener', { error: e?.message || String(e) }); }
            };
            structuredLog('INFO', 'Touch Pad UI wired successfully.');
          } else {
            structuredLog('WARN', 'Touch Pad area (#touch-pad-area) not found in template.');
          }
        } catch (e) { console.error('Failed to wire Touch Pad', e); }
        // --- END NEW BLOCK ---

        // --- Apply Responsive Layout with Cleanup ---
        let layoutDispose = null;
        try {
          layoutDispose = applyLayoutAndBehaviors({ panel, DOM });
          if (layoutDispose && typeof layoutDispose === 'function') {
            panel.__layoutDispose = layoutDispose;
          }
        } catch (e) {
          console.error('Failed to apply layout and behaviors', e);
        }

        // --- Initialize Customization System (Phase 4) ---
        let customizationDispose = null;
        try {
          customizationDispose = initializeCustomization(panel);
          if (customizationDispose && typeof customizationDispose === 'function') {
            panel.__customizationDispose = customizationDispose;
          }
        } catch (e) {
          console.error('Failed to initialize customization system', e);
        }

        await setupUI(); // setupUI is declared below
        panel.style.display = 'block'; // Use block display, not flex (flex causes layout issues)
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
        try { console.debug && console.debug('Dev Panel: attempting to load CSS from', link.href); } catch (e) { structuredLog('DEBUG', 'Dev Panel: CSS load debug logging failed', { href: link.href, error: e?.message || String(e) }); }

        let _devPanelCssHandled = false;
        let _devPanelCssTimeoutId = null;
        function _handleCssReady() {
          if (_devPanelCssHandled) return;
          _devPanelCssHandled = true;
          try { console.debug && console.debug('Dev Panel CSS loaded or fallback:', link.href); } catch (e) { structuredLog('DEBUG', 'Dev Panel: CSS load debug logging failed', { href: link.href, error: e?.message || String(e) }); }
          // Clear safety timeout if still pending
          try { if (_devPanelCssTimeoutId) clearTimeout(_devPanelCssTimeoutId); } catch (e) {}
          wireUpUI();
        }

        link.onload = _handleCssReady;
        // If CSS fails to load, still proceed to wire the UI after logging a warning.
        link.onerror = () => {
          structuredLog('WARN', 'Dev Panel: CSS failed to load, proceeding without stylesheet', { href: link.href });
          // Give the browser a short moment, then continue initialization without CSS
          setTimeout(() => _handleCssReady(), 50);
        };

        link.onerror = (e) => {
          try { console.error && console.error('Dev Panel: stylesheet failed to load', { path: link.href, error: e }); } catch (err) {}
          // attempt to wire up unstyled UI so functionality remains available
          wireUpUI();
        };

        document.head.appendChild(link);
        // Safety timeout: if neither onload nor onerror fired within 3s, proceed anyway.
        _devPanelCssTimeoutId = setTimeout(() => {
          if (_devPanelCssHandled) return;
          try { structuredLog('DEBUG', 'Dev Panel: CSS load timeout, proceeding without stylesheet', { href: link.href }); } catch (e) {}
          try { _handleCssReady(); } catch (e) { console.error('Dev Panel: wireUpUI after timeout failed', e); }
        }, 3000);
      }

      // Invoke the loader
      loadCss();
    } catch (e) {
      console.warn('Exception loading dev-panel stylesheet', e);
      try { wireUpUI(); } catch (e) { structuredLog('ERROR', 'Dev Panel: Failed to wire up UI', { error: e?.message || String(e) }); }
    }
  };

  async function setupUI() {
    // This panel is now full-screen by default via its CSS.

    // --- Initialize Worker Performance Chart Controller ---
    let chartController = null;
    try {
      chartController = await initializeChartController(panel, engine);
      if (chartController && typeof chartController.dispose === 'function') {
        panel.__chartControllerDispose = chartController.dispose;
      }
    } catch (e) {
      console.error('Failed to initialize chart controller', e);
    }

    // --- Wire All Collapsible Sections ---
    try {
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
            // Use chart controller API
            if (chartController) {
              isNowCollapsed ? chartController.stop() : chartController.start();
            }
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
    } catch (e) { console.error('Failed to wire collapse buttons', e); }

    // --- Populate Version Subtitle ---
    try {
      const subtitle = panel.querySelector('#devpanel-subtitle');
      const metaVer = document.querySelector('meta[name="acoustsee-version"]')?.getAttribute('content');
      const buildInfo = engine.getState().buildInfo || {};
      const ver = metaVer || window.ACOUSTSEE_VERSION || window.ACOUSTSEE_APP_VERSION || buildInfo.version || 'unknown';
      subtitle.textContent = `Build: ${ver} | Audio: ${buildInfo.audio_version || 'n/a'} | Video: ${buildInfo.video_version || 'n/a'} | UI: ${buildInfo.ui_version || 'n/a'} | Utils: ${buildInfo.utils_version || 'n/a'}`;
    } catch (e) { structuredLog('WARN', 'Dev Panel: Failed to set version subtitle', { error: e?.message || String(e) }); }

    // --- Populate Build Info ---
    try {
      const applyBuildInfo = (info) => {
        const buildInfoEl = panel.querySelector('#devpanel-buildinfo');
        if (!buildInfoEl) return;
        const commit = info.commit || info.BUILD_COMMIT || 'unknown';
        const branch = info.branch || info.BUILD_BRANCH || 'unknown';
        const timestamp = info.timestamp || info.BUILD_TIMESTAMP || 'unknown';
        const shortTime = timestamp !== 'unknown' ? new Date(timestamp).toLocaleString() : 'unknown';
        buildInfoEl.textContent = `Commit: ${commit} | Branch: ${branch} | Built: ${shortTime}`;
        buildInfoEl.title = `Full timestamp: ${timestamp}`;
      };
      // Prefer engine state (populated in main.js)
      if (engine.getState().buildInfo) {
        applyBuildInfo(engine.getState().buildInfo);
      } else if (window.__ACOUSTSEE_BUILD) {
        applyBuildInfo(window.__ACOUSTSEE_BUILD);
      } else {
        import('../../core/constants.js').then(constants => applyBuildInfo(constants));
      }
    } catch (e) {
      console.warn('Failed to load build info for dev panel', e);
    }

    // --- Cost-Effective Processing Canvas Preview Wiring ---
    // Use extracted logic
    try {
      const previewModule = initializePreview(panel, DOM, engine);
      if (previewModule && typeof previewModule.dispose === 'function') {
        panel.__previewDispose = previewModule.dispose;
      }
    } catch (e) {
      console.error('Failed to initialize preview module wiring', e);
    }

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
    
    // Initialize log-viewer from ring buffer to show all logs before dev panel init
    try {
      const backfilledCount = initializeFromRingBuffer();
      structuredLog('DEBUG', 'dev-panel', {
        message: 'Log viewer initialized from ring buffer',
        count: backfilledCount
      });
    } catch (err) {
      structuredLog('WARN', 'dev-panel', {
        message: 'Failed to initialize log viewer from ring buffer',
        error: err?.message || String(err)
      });
    }
    
    // --- Inject Early Logs (Phase 2A Task 2.2) ---
    try {
      markDevPanelInitTime();
      const earlyLogCount = await injectEarlyLogsToDevPanel(logView);
      structuredLog('INFO', 'dev-panel', { 
        message: 'Early logs injected to dev panel',
        count: earlyLogCount 
      });
    } catch (err) {
      structuredLog('WARN', 'dev-panel', { 
        message: 'Failed to inject early logs',
        error: err?.message || String(err)
      });
      // Continue - this is non-critical
    }
    
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

    // --- Wire Density Controls ---
    try {
      const DENSITY_STORAGE_KEY = 'acoustsee-dev-panel-density';
      const densityRadios = panel.querySelectorAll('input[name="density"]');
      
      // Load saved density preference
      const savedDensity = localStorage.getItem(DENSITY_STORAGE_KEY);
      if (savedDensity) {
        const radio = panel.querySelector(`input[name="density"][value="${savedDensity}"]`);
        if (radio) {
          radio.checked = true;
          document.documentElement.style.setProperty('--density', savedDensity);
          structuredLog('INFO', 'Dev Panel: Loaded density preference', { density: savedDensity });
        }
      }
      
      // Handle density changes
      densityRadios.forEach(radio => {
        radio.addEventListener('change', (e) => {
          const newDensity = e.target.value;
          document.documentElement.style.setProperty('--density', newDensity);
          localStorage.setItem(DENSITY_STORAGE_KEY, newDensity);
          structuredLog('INFO', 'Dev Panel: Density changed', { density: newDensity });
        });
      });
      
      structuredLog('INFO', 'Dev Panel: Density controls initialized');
    } catch (e) {
      structuredLog('WARN', 'Dev Panel: Failed to initialize density controls', { error: e?.message || String(e) });
    }

    // --- Wire Logging Configuration Controls ---
    const { loggingConfig } = await import('../../utils/logging.js');
    const logLevelSelect = panel.querySelector('#log-level-select');
    const loggingApplyBtn = panel.querySelector('#logging-apply-btn');
    const metadataToggle = panel.querySelector('#logging-metadata-toggle');
    const stackToggle = panel.querySelector('#logging-stack-toggle');

    if (logLevelSelect && loggingApplyBtn) {
      loggingApplyBtn.addEventListener('click', () => {
        try {
          const newLogLevel = logLevelSelect.value;
          setLogLevel(newLogLevel);
          loggingConfig.includeMetadata = metadataToggle.checked;
          loggingConfig.includeStack = stackToggle.checked;
          structuredLog('INFO', 'Dev Panel: Logging configuration applied', {
            logLevel: newLogLevel,
            includeMetadata: metadataToggle.checked,
            includeStack: stackToggle.checked
          });
        } catch (e) {
          structuredLog('ERROR', 'Dev Panel: Failed to apply logging config', { error: e?.message });
        }
      });
    }

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
        structuredLog('INFO', 'dev-panel', { message: 'Visual state inspector initialized' });
      }
    } catch (e) {
      structuredLog('ERROR', 'dev-panel', { message: 'Failed to initialize state inspector', error: e.message });
      // Fallback to simple text display
      const stateSection = panel.querySelector('#state-content');
      if (stateSection) {
        stateSection.innerHTML = '<div style="color: #e74c3c; padding: 8px;">State inspector failed to load. Check console for details.</div>';
      }
    }

    // --- Initialize OrchestrationInspector (Phase 2A) ---
    try {
      const orchestrationSection = panel.querySelector('#orchestration-content');
      if (orchestrationSection) {
        // Initialize the orchestration inspector component
        // Pass orchestrationSection as the target DOM root
        const orchestrationInspector = initializeOrchestrationInspector(engine, { uiPanelRoot: orchestrationSection }, {});
        // Store reference for cleanup
        panel.__orchestrationInspector = orchestrationInspector;
        structuredLog('INFO', 'dev-panel', { message: 'OrchestrationInspector initialized' });
      }
    } catch (e) {
      structuredLog('ERROR', 'dev-panel', { message: 'Failed to initialize orchestration inspector', error: e.message });
      // Fallback error message
      const orchestrationSection = panel.querySelector('#orchestration-content');
      if (orchestrationSection) {
        orchestrationSection.innerHTML = '<div style="color: #e74c3c; padding: 8px;">Orchestration inspector failed to load. Check console for details.</div>';
      }
    }

    // --- Initialize EventBus Viewer (Phase 2) ---
    try {
      const eventBusDOM = {
        'eventbus-viewer-container': panel.querySelector('#eventbus-viewer-container'),
        'eventbus-metrics-container': panel.querySelector('#eventbus-metrics-container'),
        'eventbus-event-list': panel.querySelector('#eventbus-event-list'),
        'eventbus-correlation-view': panel.querySelector('#eventbus-correlation-view'),
        'eventbus-filter-type': panel.querySelector('#eventbus-filter-type'),
        'eventbus-filter-category': panel.querySelector('#eventbus-filter-category'),
        'eventbus-filter-frames': panel.querySelector('#eventbus-filter-frames'),
        'eventbus-refresh-btn': panel.querySelector('#eventbus-refresh-btn'),
        'eventbus-auto-refresh': panel.querySelector('#eventbus-auto-refresh'),
        'eventbus-clear-btn': panel.querySelector('#eventbus-clear-btn'),
        'eventbus-export-btn': panel.querySelector('#eventbus-export-btn'),
        'eventbus-event-count': panel.querySelector('#eventbus-event-count')
      };
      
      const eventBusViewerDispose = initEventBusViewer(engine, eventBusDOM);
      // Store reference for cleanup
      panel.__eventBusViewerDispose = eventBusViewerDispose;
      structuredLog('INFO', 'dev-panel', { message: 'EventBus Viewer initialized' });
    } catch (e) {
      structuredLog('ERROR', 'dev-panel', { message: 'Failed to initialize EventBus viewer', error: e.message });
      // Fallback error message
      const eventBusContainer = panel.querySelector('#eventbus-viewer-container');
      if (eventBusContainer) {
        eventBusContainer.innerHTML = '<div style="color: #e74c3c; padding: 8px;">EventBus viewer failed to load. Check console for details.</div>';
      }
    }

    // --- Control Synchronization ---
    const gridTypeSelect = panel.querySelector('#grid-type-select');
    const synthEngineSelect = panel.querySelector('#synth-engine-select');
    const modeSelect = panel.querySelector('#mode-select');
    const fpsModeSelect = panel.querySelector('#fps-mode-select');
    const powerProfileSelect = panel.querySelector('#power-profile-select');
    const maxNotesSlider = panel.querySelector('#max-notes-slider');
    const maxNotesValue = panel.querySelector('#max-notes-value');
    const motionThresholdSlider = panel.querySelector('#motion-threshold-slider');
    const motionThresholdValue = panel.querySelector('#motion-threshold-value');
    const ingestRateSelect = panel.querySelector('#ingest-rate-select');
    const ingestEnabledCheckbox = panel.querySelector('#ingest-enabled-checkbox');
    const batteryOptimizationCheckbox = panel.querySelector('#battery-optimization-checkbox');
    const ingestCategoryToggles = panel.querySelectorAll('.category-toggle input[type="checkbox"]');

    // Video worker debug toggles (dev-only, do not affect manifest)
    const toggleFastMotion = panel.querySelector('#worker-toggle-fast-motion');
    const toggleFastGrid = panel.querySelector('#worker-toggle-fast-grid');
    const togglePanMapper = panel.querySelector('#worker-toggle-pan-mapper');

    const applyWorkerDebugConfig = () => {
      if (!engine || !engine.dispatch) return;
      const enabled = {
        'fast-motion-worker': !!(toggleFastMotion && toggleFastMotion.checked),
        'fast-grid-aggregator': !!(toggleFastGrid && toggleFastGrid.checked),
        'pan-intensity-mapper': !!(togglePanMapper && togglePanMapper.checked),
      };
      try {
        engine.dispatch('updateVideoWorkerDebugConfig', { enabled });
        structuredLog('DEBUG', 'DevPanel: updated video worker debug config', enabled);
      } catch (e) {
        console.warn('DevPanel: failed to dispatch updateVideoWorkerDebugConfig', e);
      }
    };

    toggleFastMotion && toggleFastMotion.addEventListener('change', applyWorkerDebugConfig);
    toggleFastGrid && toggleFastGrid.addEventListener('change', applyWorkerDebugConfig);
    togglePanMapper && togglePanMapper.addEventListener('change', applyWorkerDebugConfig);
    
    // CORE-15: Motion Detection Tuning controls
    const motionStepSlider = panel.querySelector('#motion-step-slider');
    const motionStepValue = panel.querySelector('#motion-step-value');
    const motionThresholdTuningSlider = panel.querySelector('#motion-threshold-tuning-slider');
    const motionThresholdTuningValue = panel.querySelector('#motion-threshold-tuning-value');
    const motionMaxRegionsSlider = panel.querySelector('#motion-maxregions-slider');
    const motionMaxRegionsValue = panel.querySelector('#motion-maxregions-value');
    const motionWindowSizeSlider = panel.querySelector('#motion-windowsize-slider');
    const motionWindowSizeValue = panel.querySelector('#motion-windowsize-value');
    const motionAdaptiveToggle = panel.querySelector('#motion-adaptive-toggle');
    const motionSmoothingSlider = panel.querySelector('#motion-smoothing-slider');
    const motionSmoothingValue = panel.querySelector('#motion-smoothing-value');
    const motionMinHeadroomSlider = panel.querySelector('#motion-minheadroom-slider');
    const motionMinHeadroomValue = panel.querySelector('#motion-minheadroom-value');
    const motionStrategySelect = panel.querySelector('#motion-strategy-select');
    const depthStrategySelect = panel.querySelector('#depth-strategy-select');
    const telemetryRecentMax = panel.querySelector('#telemetry-recent-max');
    const telemetryEffectiveMax = panel.querySelector('#telemetry-effective-max');
    const telemetryClippingRate = panel.querySelector('#telemetry-clipping-rate');
    const telemetryRegions = panel.querySelector('#telemetry-regions');
    const deltaPanMean = panel.querySelector('#delta-pan-mean');
    const deltaPanZero = panel.querySelector('#delta-pan-zero');
    const deltaIntensityMean = panel.querySelector('#delta-intensity-mean');
    const deltaIntensityZero = panel.querySelector('#delta-intensity-zero');
    const deltaHistogramPanContainer = panel.querySelector('#delta-histogram-pan');
    const deltaHistogramIntensityContainer = panel.querySelector('#delta-histogram-intensity');
    const HISTOGRAM_BIN_COUNT = 16;
    const deltaHistogramConfig = {
      pan: { container: deltaHistogramPanContainer, bars: [] },
      intensity: { container: deltaHistogramIntensityContainer, bars: [] }
    };

    function ensureHistogramBars(axis) {
      const config = deltaHistogramConfig[axis];
      if (!config || !config.container) return null;
      if (config.bars.length === 0) {
        config.container.innerHTML = '';
        for (let i = 0; i < HISTOGRAM_BIN_COUNT; i++) {
          const bar = document.createElement('span');
          bar.className = 'delta-histogram-bar';
          bar.style.flex = '1';
          bar.style.borderRadius = '2px';
          bar.style.backgroundColor = '#2c3e50';
          bar.style.transition = 'height 120ms ease, background-color 120ms ease';
          config.container.appendChild(bar);
          config.bars.push(bar);
        }
      }
      return config;
    }

    function renderHistogram(axis, counts = []) {
      const config = ensureHistogramBars(axis);
      if (!config) return;
      const bars = config.bars;
      const maxCount = counts.length > 0 ? Math.max(...counts, 1) : 1;
      bars.forEach((bar, idx) => {
        const value = counts[idx] || 0;
        const ratio = maxCount ? value / maxCount : 0;
        const height = Math.max(4, ratio * 32);
        bar.style.height = `${height}px`;
        if (value === 0) {
          bar.style.backgroundColor = '#2c3e50';
        } else if (ratio > 0.7) {
          bar.style.backgroundColor = '#e74c3c';
        } else if (ratio > 0.3) {
          bar.style.backgroundColor = '#f39c12';
        } else {
          bar.style.backgroundColor = '#1abc9c';
        }
        bar.title = value.toString();
      });
    }

    // Sync controls with state changes
    engine.onStateChange(state => {
      try {
        if (gridTypeSelect) gridTypeSelect.value = state.gridType;
        if (synthEngineSelect) synthEngineSelect.value = state.synthesisEngine;
        if (modeSelect) modeSelect.value = state.currentMode;
        if (depthStrategySelect) depthStrategySelect.value = state.depthPath;
        if (fpsModeSelect) fpsModeSelect.value = state.autoFPS ? 'auto' : 'manual';
        if (powerProfileSelect) powerProfileSelect.value = state.settings?.qualityProfileOverride || state.orchestration?.qualityProfile?.name || 'auto';
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
        
        // CORE-15: Sync motion detection controls
        if (state.motionDetection) {
          if (motionStepSlider) motionStepSlider.value = state.motionDetection.step;
          if (motionStepValue) motionStepValue.textContent = state.motionDetection.step;
          if (motionThresholdTuningSlider) motionThresholdTuningSlider.value = state.motionDetection.threshold;
          if (motionThresholdTuningValue) motionThresholdTuningValue.textContent = state.motionDetection.threshold;
          if (motionMaxRegionsSlider) motionMaxRegionsSlider.value = state.motionDetection.maxRegions;
          if (motionMaxRegionsValue) motionMaxRegionsValue.textContent = state.motionDetection.maxRegions;
          if (motionWindowSizeSlider) motionWindowSizeSlider.value = state.motionDetection.windowSize;
          if (motionWindowSizeValue) motionWindowSizeValue.textContent = state.motionDetection.windowSize;
          if (motionAdaptiveToggle) motionAdaptiveToggle.checked = state.motionDetection.adaptiveEnabled;
          if (motionSmoothingSlider) motionSmoothingSlider.value = state.motionDetection.smoothing;
          if (motionSmoothingValue) motionSmoothingValue.textContent = state.motionDetection.smoothing.toFixed(2);
          if (motionMinHeadroomSlider) motionMinHeadroomSlider.value = state.motionDetection.minHeadroom;
          if (motionMinHeadroomValue) motionMinHeadroomValue.textContent = state.motionDetection.minHeadroom.toFixed(2);
          if (motionStrategySelect) motionStrategySelect.value = state.motionDetection.strategy;
        }
        // Throttle UI sync
        if (state.frameProviderThrottle) {
          const skip = state.frameProviderThrottle.skipRate || 1;
          const scale = state.frameProviderThrottle.scale || 1.0;
          const skipSlider = panel.querySelector('#frame-skip-slider');
          const scaleSlider = panel.querySelector('#resolution-scale-slider');
          const skipValueEl = panel.querySelector('#frame-skip-value');
          const scaleValueEl = panel.querySelector('#resolution-scale-value');
          if (skipSlider) skipSlider.value = String(skip);
          if (scaleSlider) scaleSlider.value = String(scale);
          if (skipValueEl) skipValueEl.textContent = String(skip);
          if (scaleValueEl) scaleValueEl.textContent = String(scale);
        }
        
        // CORE-15: Update normalization telemetry display R151125C15ingest
        if (state.normalizationTelemetry) {
          if (telemetryRecentMax) telemetryRecentMax.textContent = state.normalizationTelemetry.recentMax.toFixed(2);
          if (telemetryEffectiveMax) telemetryEffectiveMax.textContent = state.normalizationTelemetry.effectiveMax.toFixed(2);
          if (telemetryClippingRate) telemetryClippingRate.textContent = (state.normalizationTelemetry.clippingRate * 100).toFixed(1) + '%';
          if (telemetryRegions) {
            // Extract region count from last frame result if available
            // For now, show frameCount as a proxy
            telemetryRegions.textContent = state.normalizationTelemetry.frameCount || 0;
          }
        }

        // Effective throttle values (FPS & Worker Throttle)
        const effectiveFpsEl = panel.querySelector('#effective-fps');
        const effectiveSkipEl = panel.querySelector('#effective-skip');
        const effectiveScaleEl = panel.querySelector('#effective-scale');
        if (effectiveFpsEl) effectiveFpsEl.textContent = Math.round(1000 / (state.settings?.updateInterval || (state.orchestration?.qualityProfile?.fpsTarget ? Math.round(1000 / state.orchestration.qualityProfile.fpsTarget) : 1000/10)));
        if (effectiveSkipEl) effectiveSkipEl.textContent = (state.frameProviderThrottle?.skipRate || 1).toString();
        if (effectiveScaleEl) effectiveScaleEl.textContent = (state.frameProviderThrottle?.scale || 1.0).toString();
        // Stall telemetry (pipeline stability)
        if (state.stallStats) {
          const stallAgeEl = document.getElementById('stall-last-cue-age');
          const stallUnchangedEl = document.getElementById('stall-unchanged-frames');
          const stallDetectedEl = document.getElementById('stall-detected');
          const stallCountEl = document.getElementById('stall-count');
          if (stallAgeEl) {
            const age = state.stallStats.lastAudioCueTs ? (Date.now() - state.stallStats.lastAudioCueTs) : 0;
            stallAgeEl.textContent = age.toString();
          }
            if (stallUnchangedEl) stallUnchangedEl.textContent = state.stallStats.unchangedPanFrames;
            if (stallDetectedEl) stallDetectedEl.textContent = state.stallStats.stallDetected ? 'true' : 'false';
            if (stallCountEl) stallCountEl.textContent = state.stallStats.stallCount;
        }
        if (state.stallStats?.deltaSnapshot) {
          const snapshot = state.stallStats.deltaSnapshot;
          renderHistogram('pan', snapshot.pan);
          renderHistogram('intensity', snapshot.intensity);
          if (deltaPanMean) deltaPanMean.textContent = snapshot.meanPanDelta.toFixed(3);
          if (deltaPanZero) deltaPanZero.textContent = snapshot.zeroPanStreak.toString();
          if (deltaIntensityMean) deltaIntensityMean.textContent = snapshot.meanIntensityDelta.toFixed(3);
          if (deltaIntensityZero) deltaIntensityZero.textContent = snapshot.zeroIntensityStreak.toString();
        }
        // Update missing translations display (if present)
        try {
          const missingContainer = panel.querySelector('#i18n-missing-list');
          const missingSummary = panel.querySelector('#i18n-missing-summary');
          const missing = Array.isArray(state.missingTranslations) ? state.missingTranslations : [];
          if (missingContainer) {
            if (missing.length === 0) {
              missingContainer.innerHTML = '<div style="color:#7f8c8d">None</div>';
            } else {
              missingContainer.innerHTML = '';
              missing.forEach(k => {
                const el = document.createElement('div');
                el.textContent = k;
                missingContainer.appendChild(el);
              });
            }
          }
          if (missingSummary) {
            missingSummary.textContent = missing.length === 0 ? 'No missing translations detected.' : `${missing.length} missing translation(s)`;
          }
        } catch (e) { structuredLog('WARN', 'Dev Panel: Failed to update missing translations display', { error: e?.message || String(e) }); }
      } catch(e) { structuredLog('WARN', 'Dev Panel: Failed to update delta stats display', { error: e?.message || String(e) }); }
    });

    // Add change listeners for selects
    if (fpsModeSelect) {
      fpsModeSelect.addEventListener('change', (e) => {
        const enabled = e.target.value === 'auto';
        const traceId = generateTraceId ? generateTraceId() : null;
        engine.dispatch('setAutoFps', { enabled }, { traceId });
      });
    }
    if (gridTypeSelect) {
      gridTypeSelect.addEventListener('change', (e) => {
        console.log('=== GRID DROPDOWN CHANGE EVENT FIRED ===');
        const selectedValue = e.target.value;
        const optionsCount = e.target.options.length;
        const selectedIndex = e.target.selectedIndex;
        const selectedOption = e.target.options[selectedIndex];
        
        // Generate traceId for user action
        const traceId = generateTraceId ? generateTraceId() : null;
        
        structuredLog('DEBUG', 'Grid dropdown changed', {
          selectedValue,
          selectedIndex,
          optionsCount,
          optionValue: selectedOption?.value,
          optionText: selectedOption?.textContent,
          traceId
        });
        
        const payloadToSend = { gridType: selectedValue };
        structuredLog('DEBUG', 'About to dispatch setGridType', { payload: payloadToSend, traceId });
        engine.dispatch('setGridType', payloadToSend, { traceId });
      });
    }
    if (synthEngineSelect) {
      synthEngineSelect.addEventListener('change', (e) => {
        console.log('=== SYNTH DROPDOWN CHANGE EVENT FIRED ===');
        const selectedValue = e.target.value;
        const optionsCount = e.target.options.length;
        const selectedIndex = e.target.selectedIndex;
        const selectedOption = e.target.options[selectedIndex];
        
        // Generate traceId for user action
        const traceId = generateTraceId ? generateTraceId() : null;
        
        structuredLog('DEBUG', 'Synth dropdown changed', {
          selectedValue,
          selectedIndex,
          optionsCount,
          optionValue: selectedOption?.value,
          optionText: selectedOption?.textContent,
          traceId
        });
        
        const payloadToSend = { synthesisEngine: selectedValue };
        structuredLog('DEBUG', 'About to dispatch setSynthEngine', { payload: payloadToSend, traceId });
        engine.dispatch('setSynthEngine', payloadToSend, { traceId });
      });
    }

    if (modeSelect) {
      modeSelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        const traceId = generateTraceId ? generateTraceId() : null;
        structuredLog('DEBUG', 'Mode dropdown changed', { mode: selectedValue, traceId });
        engine.dispatch('setMode', { mode: selectedValue }, { traceId });
      });
    }

    if (depthStrategySelect) {
      depthStrategySelect.addEventListener('change', (e) => {
        const selectedValue = e.target.value;
        const traceId = generateTraceId ? generateTraceId() : null;
        structuredLog('DEBUG', 'Depth strategy dropdown changed', { path: selectedValue, traceId });
        engine.dispatch('setDepthPath', { path: selectedValue }, { traceId });
      });
    }
    
    // Add event listeners for Max Notes and Motion Threshold sliders
    if (maxNotesSlider) {
      maxNotesSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        if (maxNotesValue) maxNotesValue.textContent = value;
        structuredLog('DEBUG', 'Max notes slider changed', { value });
        engine.dispatch('setMaxNotes', { maxNotes: value });
      });
    }
    
    if (motionThresholdSlider) {
      motionThresholdSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        if (motionThresholdValue) motionThresholdValue.textContent = value;
        const traceId = generateTraceId ? generateTraceId() : null;
        structuredLog('DEBUG', 'Motion threshold slider changed', { value, traceId });
        engine.dispatch('setMotionThreshold', { motionThreshold: value }, { traceId });
      });
    }
    
    // CORE-15: Motion Detection Tuning listeners
    if (motionStepSlider) {
      motionStepSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        if (motionStepValue) motionStepValue.textContent = value;
        engine.dispatch('updateMotionDetection', { params: { step: value } });
      });
    }
    
    if (motionThresholdTuningSlider) {
      motionThresholdTuningSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (motionThresholdTuningValue) motionThresholdTuningValue.textContent = value;
        engine.dispatch('updateMotionDetection', { params: { threshold: value } });
      });
    }
    
    if (motionMaxRegionsSlider) {
      motionMaxRegionsSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        if (motionMaxRegionsValue) motionMaxRegionsValue.textContent = value;
        engine.dispatch('updateMotionDetection', { params: { maxRegions: value } });
      });
    }
    
    if (motionWindowSizeSlider) {
      motionWindowSizeSlider.addEventListener('input', (e) => {
        const value = parseInt(e.target.value, 10);
        if (motionWindowSizeValue) motionWindowSizeValue.textContent = value;
        engine.dispatch('updateMotionDetection', { params: { windowSize: value } });
      });
    }
    
    if (motionAdaptiveToggle) {
      motionAdaptiveToggle.addEventListener('change', (e) => {
        engine.dispatch('updateMotionDetection', { params: { adaptiveEnabled: e.target.checked } });
      });
    }
    
    if (motionSmoothingSlider) {
      motionSmoothingSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (motionSmoothingValue) motionSmoothingValue.textContent = value.toFixed(2);
        engine.dispatch('updateMotionDetection', { params: { smoothing: value } });
      });
    }
    
    if (motionMinHeadroomSlider) {
      motionMinHeadroomSlider.addEventListener('input', (e) => {
        const value = parseFloat(e.target.value);
        if (motionMinHeadroomValue) motionMinHeadroomValue.textContent = value.toFixed(2);
        engine.dispatch('updateMotionDetection', { params: { minHeadroom: value } });
      });
    }
    
    if (motionStrategySelect) {
      motionStrategySelect.addEventListener('change', (e) => {
        engine.dispatch('updateMotionDetection', { params: { strategy: e.target.value } });
      });
    }
    
    // Add event listeners for Performance Analytics controls
    if (ingestEnabledCheckbox) {
      ingestEnabledCheckbox.addEventListener('change', (e) => {
        console.log('=== INGEST ENABLED CHECKBOX CHANGED ===');
        const traceId = generateTraceId ? generateTraceId() : null;
        structuredLog('DEBUG', 'Ingest enabled changed', { checked: e.target.checked, traceId });
        engine.dispatch('setIngestEnabled', { enabled: e.target.checked }, { traceId });
      });
    }
    
    if (batteryOptimizationCheckbox) {
      batteryOptimizationCheckbox.addEventListener('change', (e) => {
        console.log('=== BATTERY OPTIMIZATION CHECKBOX CHANGED ===');
        const traceId = generateTraceId ? generateTraceId() : null;
        structuredLog('DEBUG', 'Battery optimization changed', { checked: e.target.checked, traceId });
        engine.dispatch('setIngestPreferences', { 
          preferences: { useIdleCallback: e.target.checked }
        }, { traceId });
      });
    }
    
    if (ingestRateSelect) {
      ingestRateSelect.addEventListener('change', (e) => {
        console.log('=== INGEST RATE SELECT CHANGED ===');
        const rate = parseInt(e.target.value);
        const traceId = generateTraceId ? generateTraceId() : null;
        structuredLog('DEBUG', 'Ingest rate changed', { 
          selectedValue: e.target.value,
          parsedRate: rate,
          traceId
        });
        engine.dispatch('setIngestPreferences', { 
          preferences: { maxEventsPerSecond: rate }
        }, { traceId });
      });
    }
    
    // Add listeners for category toggles
    if (ingestCategoryToggles) {
      ingestCategoryToggles.forEach(toggle => {
        toggle.addEventListener('change', (e) => {
          console.log('=== CATEGORY TOGGLE CHANGED ===');
          const category = e.target.dataset.category;
          const checked = e.target.checked;
          structuredLog('DEBUG', 'Category toggle changed', { category, checked });
          
          // This is more complex - categories need to be managed carefully
          // For now, just log it. The "Apply Settings" button will handle the full update
        });
      });
    }

    // --- Wire High-Frequency Payload Capping Controls ---
    try {
      const capToggle = panel.querySelector('#cap-high-freq-payloads-toggle');
      const capAudioCuesSlider = panel.querySelector('#cap-audio-cues-slider');
      const capAudioCuesValue = panel.querySelector('#cap-audio-cues-value');
      const capMotionRegionsSlider = panel.querySelector('#cap-motion-regions-slider');
      const capMotionRegionsValue = panel.querySelector('#cap-motion-regions-value');
      const capFlowObjectsSlider = panel.querySelector('#cap-flow-objects-slider');
      const capFlowObjectsValue = panel.querySelector('#cap-flow-objects-value');
      const capDepthRegionsSlider = panel.querySelector('#cap-depth-regions-slider');
      const capDepthRegionsValue = panel.querySelector('#cap-depth-regions-value');

      // Initialize window.__audioSeeDebug if not already present
      if (!window.__audioSeeDebug) {
        window.__audioSeeDebug = {};
      }

      // Apply initial values from window.__audioSeeDebug if present
      const initialCapEnabled = window.__audioSeeDebug.capHighFreqPayloads !== false;
      if (capToggle) capToggle.checked = initialCapEnabled;

      const initialLimits = window.__audioSeeDebug.payloadLimits || {};
      if (capAudioCuesSlider) {
        capAudioCuesSlider.value = initialLimits.audioCuesLimit || 50;
        if (capAudioCuesValue) capAudioCuesValue.textContent = capAudioCuesSlider.value;
      }
      if (capMotionRegionsSlider) {
        capMotionRegionsSlider.value = initialLimits.motionRegionsLimit || 100;
        if (capMotionRegionsValue) capMotionRegionsValue.textContent = capMotionRegionsSlider.value;
      }
      if (capFlowObjectsSlider) {
        capFlowObjectsSlider.value = initialLimits.flowObjectsLimit || 50;
        if (capFlowObjectsValue) capFlowObjectsValue.textContent = capFlowObjectsSlider.value;
      }
      if (capDepthRegionsSlider) {
        capDepthRegionsSlider.value = initialLimits.depthRegionsLimit || 50;
        if (capDepthRegionsValue) capDepthRegionsValue.textContent = capDepthRegionsSlider.value;
      }

      // Wire toggle for enabling/disabling capping
      if (capToggle) {
        capToggle.addEventListener('change', (e) => {
          window.__audioSeeDebug.capHighFreqPayloads = e.target.checked;
          structuredLog('INFO', 'High-frequency payload capping toggled', { enabled: e.target.checked });
        }, { passive: true });
      }

      // Wire sliders to update limits
      const updateLimits = () => {
        if (!window.__audioSeeDebug.payloadLimits) {
          window.__audioSeeDebug.payloadLimits = {};
        }
        if (capAudioCuesSlider) {
          const val = parseInt(capAudioCuesSlider.value, 10);
          window.__audioSeeDebug.payloadLimits.audioCuesLimit = val;
          if (capAudioCuesValue) capAudioCuesValue.textContent = val;
        }
        if (capMotionRegionsSlider) {
          const val = parseInt(capMotionRegionsSlider.value, 10);
          window.__audioSeeDebug.payloadLimits.motionRegionsLimit = val;
          if (capMotionRegionsValue) capMotionRegionsValue.textContent = val;
        }
        if (capFlowObjectsSlider) {
          const val = parseInt(capFlowObjectsSlider.value, 10);
          window.__audioSeeDebug.payloadLimits.flowObjectsLimit = val;
          if (capFlowObjectsValue) capFlowObjectsValue.textContent = val;
        }
        if (capDepthRegionsSlider) {
          const val = parseInt(capDepthRegionsSlider.value, 10);
          window.__audioSeeDebug.payloadLimits.depthRegionsLimit = val;
          if (capDepthRegionsValue) capDepthRegionsValue.textContent = val;
        }
        structuredLog('DEBUG', 'Payload limits updated', { limits: window.__audioSeeDebug.payloadLimits });
      };

      if (capAudioCuesSlider) capAudioCuesSlider.addEventListener('input', updateLimits, { passive: true });
      if (capMotionRegionsSlider) capMotionRegionsSlider.addEventListener('input', updateLimits, { passive: true });
      if (capFlowObjectsSlider) capFlowObjectsSlider.addEventListener('input', updateLimits, { passive: true });
      if (capDepthRegionsSlider) capDepthRegionsSlider.addEventListener('input', updateLimits, { passive: true });

    } catch (e) {
      structuredLog('WARN', 'Failed to wire high-frequency payload capping controls', { error: e?.message || String(e) });
    }

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
      try { if (typeof unsubscribe === 'function') unsubscribe(); } catch (e) { structuredLog('WARN', 'Dev Panel: Failed to unsubscribe from app:poweredOn', { error: e?.message || String(e) }); }
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

  // Consolidated disposer - return a dispose() function that cleans up everything
  return {
    dispose() {
      structuredLog('INFO', 'Disposing Dev Panel...');

      // 1. Dispose of StateInspector
      try {
        if (panel.__stateInspector && typeof panel.__stateInspector.dispose === 'function') {
          panel.__stateInspector.dispose();
        }
      } catch (e) { /* swallow */ }

      // 1.5. Dispose of OrchestrationInspector (Phase 2A)
      try {
        if (panel.__orchestrationInspector && typeof panel.__orchestrationInspector.dispose === 'function') {
          panel.__orchestrationInspector.dispose();
        }
      } catch (e) { /* swallow */ }

      // 1.6. Dispose of EventBus Viewer (Phase 2)
      try {
        if (panel.__eventBusViewerDispose && typeof panel.__eventBusViewerDispose === 'function') {
          panel.__eventBusViewerDispose();
        }
      } catch (e) { /* swallow */ }

      // 2. Dispose of wired actions from dev-panel.actions.js
      try {
        if (panel.__devActionsDispose && typeof panel.__devActionsDispose === 'function') {
          panel.__devActionsDispose();
        }
      } catch (e) { /* swallow */ }

      // 3. Stop the video preview and clean up its resources
      // CHANGED: Delegate to the module-provided disposal function
      if (panel.__previewDispose) {
        panel.__previewDispose();
      }

      // 4. Stop the worker chart rendering loop
      // CHANGED: Delegate to the chart controller's disposal function
      try {
        if (panel.__chartControllerDispose && typeof panel.__chartControllerDispose === 'function') {
          panel.__chartControllerDispose();
        }
      } catch (e) { /* swallow */ }

      // 5. Clean up the log viewer callback
      try { setOutputCallback(null); } catch (e) { /* swallow */ }

      // 6. Touch Pad cleanup if present
      try {
        if (typeof panel.__touchPadCleanup === 'function') {
          panel.__touchPadCleanup();
        }
      } catch (e) { /* swallow */ }

      // 7. Layout cleanup (fixes memory leak)
      try {
        if (typeof panel.__layoutDispose === 'function') {
          panel.__layoutDispose();
        }
      } catch (e) { /* swallow */ }

      // 8. Customization system cleanup (Phase 4)
      try {
        if (typeof panel.__customizationDispose === 'function') {
          panel.__customizationDispose();
        }
      } catch (e) { /* swallow */ }

      // 9. Remove panel node from DOM
      try {
        if (panel && panel.parentNode) panel.parentNode.removeChild(panel);
      } catch (e) { /* swallow */ }

      structuredLog('INFO', 'Dev Panel disposed successfully.');
    }
  };
}

// Register initializer in the ui-registry for other modules to access later under the canonical name
try { registerComponent && registerComponent('dev-panel', initializeDevPanel); } catch (e) { structuredLog('WARN', 'Dev Panel: Failed to register component in UI registry', { error: e?.message || String(e) }); }
