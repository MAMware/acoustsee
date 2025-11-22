// File: web/main.js
// Main application entry point, called by boot.js.
// This module orchestrates the initialization of all major subsystems:
// the core engine, UI, audio pipeline, and video pipeline. It loads initial
// configurations and wires up the primary user interaction (the power-on button).
// Build constants (ensure always available even if boot build log fails)
import * as buildConstants from './core/constants.js';
//
// Architecture:
// - Uses modern browser features (async/await, Web Workers, Web Audio).
// - Follows a modular, event-driven pattern managed by the core engine.
// TODO R311025 it seems we have two ingest.js, one at core and other at utils, this is a archituctre smell to me, also we might check consolidating the logging, analytics and performance

import { createEngine } from './core/engine.js';
import { createEventBus } from './core/event-bus.js';
import { initializeAnalytics } from './core/event-bus-analytics.js';
import { AnalyticsBatcher } from './core/analytics-batcher.js';
import { structuredLog, loggingConfig, initializeLogging } from './utils/logging.js';
import { generateTraceId } from './utils/trace-id.js';
import { 
  AccessibilityError, 
  showCriticalError, 
  isCriticalSystem 
} from './utils/error-handling.js';
import { trackFeatureUse, emergencyTrack, pingIngest } from './core/ingest.js';
import { getText, initializeLanguage, speakText, announceMessage, setLanguage, translatePage } from './utils/utils.js';
import AudioManager from './audio/audio-manager.js';
import { initializeAudio, bindAudioManager as bindAudioProcessor, registerAudioListeners } from './audio/audio-processor.js';
import { loadAvailableGrids } from './video/grids/available-grids.js';
import { addSessionError, startHealthChecker } from './utils/performance.js';
import { getComponent } from './ui/ui-registry.js';
import { AVAILABLE_UIS, getUIEntry, loadUIById } from './ui/ui-manifest.js';
import { createIngestInterceptor, setupIngestErrorTracking } from './utils/ingest.js';
import { detectAllCapabilities, generateCapabilityReport } from './core/capability-detector.js';

// UI modules are loaded dynamically below to ensure only one UI initializes
// at runtime (debug vs accessible). Dynamic import prevents duplicate IDs
// and avoids initializing both UIs in the same session.


const HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const ERROR_THRESHOLD = 5; // Alert if more than 5 errors
const ERROR_TIMEFRAME_MS = 2 * 60 * 1000; // Look at last 2 minutes
const translationCache = {};

// Cached getText wrapper
async function getTextCached(key, params = {}, state) {
  const cacheKey = JSON.stringify({ key, params });
  if (translationCache[cacheKey]) return translationCache[cacheKey];
  const result = await getText(key, params, state);
  translationCache[cacheKey] = result;
  return result;
}

const DOM = {
  videoFeed: document.getElementById('videoFeed'),
  frameCanvas: document.getElementById('frameCanvas'),  
  button1: document.getElementById('button1'),
  powerOn: document.getElementById('powerOn'),
  exportEarlyLogsBtn: document.getElementById('exportEarlyLogsBtn'), // Phase 2A Task 2.2
  splashScreen: document.getElementById('splashScreen'),
  mainContainer: document.getElementById('mainContainer'),
  debugPanel: document.getElementById('debugPanel'),
    uiPanelRoot: document.getElementById('ui-panel-root'),
};

/*
  Runtime Base Path Detection

  PROBLEM: When this application is hosted in a subdirectory (e.g., on GitHub Pages),
  simple root-relative paths like '/video/workers/motion-worker.js' will fail
  because they don't include the repository path segment, leading to 404 errors.

  SOLUTION: This code determines the application's true root path at runtime
  by finding the <script> tag that loaded `boot.js` and extracting its
  directory. This gives us a reliable `basePath`.

  USAGE: This `basePath` is passed during initialization to modules that need to
  load other files dynamically. It serves as a robust fallback when modern
  features like `import.meta.url` are unavailable in certain environments.
*/

let basePath = './';
try {
  // Prefer the script element that loaded boot.js
  const bootScript = document.querySelector('script[src*="boot.js"]');
  if (bootScript && bootScript.src) {
    const src = bootScript.src;
    basePath = src.substring(0, src.lastIndexOf('/') + 1);
  } else if (document.currentScript && document.currentScript.src) {
    const src = document.currentScript.src;
    basePath = src.substring(0, src.lastIndexOf('/') + 1);
  }
  console.log('Application base path established:', basePath);
} catch (e) {
  console.warn('Could not determine base path automatically, falling back to "./"');
}

// Make basePath available globally for utils.js and other modules that need it
window.__ACOUSTSEE_BASE_PATH__ = basePath;

class CustomError extends Error {
  constructor(message, data = {}) {
    super(message);
    this.data = data;
  }
}

// Helper to validate DOM elements
function validateDOM() {
  const requiredIds = ['videoFeed', 'powerOn', 'splashScreen', 'mainContainer', 'frameCanvas'];
  const missing = requiredIds.filter(id => !DOM[id]);
  if (missing.length > 0) {
    throw new CustomError('Missing DOM elements', { missing });
  }
}

export async function init() {
  try {
    // Validate DOM early
    validateDOM();

    // STEP 0: Create the engine first (required by all command handlers)
    const baseEngine = createEngine();
    
    // Wrap engine with smart ingest interceptor that leverages existing performance data
    const engine = createIngestInterceptor(baseEngine);
    
    // Make engine globally available for UI components
    window.engine = engine;
  
    // Get engine state
    const state = engine.getState();
    
    // Attach build info onto state for downstream UI/dev panel consumption
    const buildInfo = {
      commit: buildConstants.BUILD_COMMIT || 'unknown',
      branch: buildConstants.BUILD_BRANCH || 'unknown',
      timestamp: buildConstants.BUILD_TIMESTAMP || 'unknown',
      version: buildConstants.BUILD_VERSION || 'unknown',
      audio_version: buildConstants.AUDIO_VERSION || 'unknown',
      video_version: buildConstants.VIDEO_VERSION || 'unknown',
      ui_version: buildConstants.UI_VERSION || 'unknown',
      utils_version: buildConstants.UTILS_VERSION || 'unknown'
    };
    engine.setState({ buildInfo });
    // Expose globally as fallback for dev panel
    window.__ACOUSTSEE_BUILD = buildInfo;
    console.log('%c🔧 Build Info (main.js)', 'font-weight:bold;color:#0ea5e9;', buildInfo);
    structuredLog('INFO', 'buildInfo', buildInfo);

    // STEP 0.5: Create unified EventBus for logging and command tracking
    // Must be created after engine but before initializing subsystems that need it
    const eventBus = createEventBus({
      state: state,
      maxEvents: 500
    });
    
    // Initialize logging module with EventBus
    initializeLogging(eventBus);
    
    // Inject EventBus into engine for command tracking
    engine.setEventBus(eventBus);
    
    // STEP 0.6: Create analytics batcher (30-second batches, prevent 429 rate limiting)
    const analyticsBatcher = new AnalyticsBatcher(
      30000, // 30-second flush interval
      'https://acoustsee-analytics.mamware.workers.dev',
      { maxBatchSize: 1000, debugLogging: false } // R111125 why false?
    );
    
    // Make batcher globally available for ingest.js
    window.__audioSee = window.__audioSee || {};
    window.__audioSee.analyticsBatcher = analyticsBatcher;
    
    // Initialize analytics subscribers (replaces direct ingest tracking)
    initializeAnalytics(eventBus, state);
    
    // Wire worker logs to EventBus
    // Workers send { type: 'workerLog', log: { timestamp, level, message, metadata } }
    // This is a document-level handler for any worker that uses worker-logger.js
    const workerLogHandler = (event) => {
      if (event.data?.type === 'workerLog' && event.data.log) {
        const log = event.data.log;
        try {
          eventBus.emit({
            type: 'log',
            category: log.level,
            timestamp: new Date(log.timestamp).getTime(),
            data: {
              message: log.message,
              ...log.metadata,
              source: 'worker'
            },
            traceId: log.metadata?.traceId || null
          });
        } catch (err) {
          console.warn('Failed to emit worker log to EventBus:', err);
        }
      }
    };
    // Listen for messages from ALL workers
    window.addEventListener('message', workerLogHandler);
    
    // Make eventBus available for debugging
    if (window.location.search.includes('debug=true')) {
      window.eventBus = eventBus;
      structuredLog('DEBUG', 'EventBus created and exposed as window.eventBus', {});
    }

    // Setup ingest error tracking
    setupIngestErrorTracking();

    // STEP 1: Load all asynchronous resources 
    try {
      const grids = await loadAvailableGrids();
      if (grids && grids.length > 0) {
        engine.setState({ availableGrids: grids });
        // Set a default grid if one isn't already set
        const currentState = engine.getState();
        if (!currentState.gridType) {
          engine.setState({ gridType: grids[0].id });
        }
        structuredLog('INFO', 'init: Video grids loaded successfully', { count: grids.length, default: engine.getState().gridType });
      } else {
        structuredLog('WARN', 'init: No video grids were loaded.');
      }
    } catch (e) {
      structuredLog('ERROR', 'init: Failed to load video grids', { error: e?.message || String(e) });
    }

    // STEP 1A: Detect browser capabilities and update orchestration state
    try {
      const capabilities = detectAllCapabilities();
      engine.dispatch('updateOrchestration', { capabilities });
      structuredLog('INFO', 'init: Browser capabilities detected', {
        mediaStreamTrackProcessor: capabilities.mediaStreamTrackProcessor,
        canvas2D: capabilities.canvas2D,
        webGL: capabilities.webGL,
        webGPU: capabilities.webGPU,
        offscreenCanvas: capabilities.offscreenCanvas,
        wasm: capabilities.wasm,
      });
      // Log the full report if in debug mode
      if (window.location.search.includes('debug=true')) {
        const report = generateCapabilityReport(capabilities);
        structuredLog('DEBUG', 'Capability Report:\n' + report, {});
      }
    } catch (e) {
      structuredLog('WARN', 'init: Failed to detect capabilities', { error: e?.message || String(e) });
    }

    // STEP 2: Now that all configs are loaded, log and check them.
    let configState = engine.getState();
    structuredLog('INFO', 'init: Configurations loaded', {
      gridType: configState.gridType,
      synthesisEngine: configState.synthesisEngine,
      language: configState.language
    });

    // Ensure language is initialized before UI translation (await to avoid races)
    await initializeLanguage(configState, { persist: (partial) => engine.setState(partial) });
    try {
      await setLanguage(configState.language, configState);
      // After potential preload, persist any changes
      engine.setState({ language: configState.language, i18n: configState.i18n, missingTranslations: configState.missingTranslations });
      translatePage(document, configState);
      const postInitState = engine.getState();
      structuredLog('DEBUG', 'i18n initialization sync', {
        copyReady: configState.i18n?.ready,
        engineReady: postInitState.i18n?.ready,
        engineLanguage: postInitState.language
      });
    } catch (e) {
      structuredLog('WARN', 'setLanguage/translatePage failed', { error: e?.message || String(e) });
    }

    // Get FRESH state after async operations to ensure all mutations are visible
    configState = engine.getState();

    // This check will now run AFTER grids are loaded, so the warning should disappear.
    if (!configState.gridType || !configState.synthesisEngine || !configState.language) {
      const missing = [];
      if (!configState.gridType) missing.push('grids');
      if (!configState.synthesisEngine) missing.push('engines');
      if (!configState.language) missing.push('languages');
      
      try {
        const msg = await getText('initMissingConfigs', { missing: missing.join(', ') }, configState);
        if (msg && msg !== 'initMissingConfigs') { // Only announce if we got a real translation
          announceMessage(msg);
          if (configState.ttsEnabled) speakText(configState, msg, 'tts');
        } else {
          // Fallback when translation unavailable
          const fallbackMsg = `Initialization incomplete: ${missing.join(', ')}`;
          announceMessage(fallbackMsg);
          if (configState.ttsEnabled) speakText(configState, fallbackMsg, 'tts');
        }
      } catch (textErr) {
        // getText should not throw anymore, but keep catch for defensive programming
        structuredLog('ERROR', 'Failed to get initialization warning text', { error: textErr?.message, missing });
        const fallbackMsg = `Initialization incomplete: ${missing.join(', ')}`;
        if (configState.ttsEnabled) {
          speakText(configState, fallbackMsg, 'tts');
        }
      }
      structuredLog('WARN', 'Partial configs; proceeding with limitations', { missing });
    }

    // --- LOG LEVEL CONFIGURATION (from URL parameter) ---
    const urlParams = new URLSearchParams(window.location.search);
    const logLevelFromUrl = urlParams.get('logLevel');
    if (logLevelFromUrl) {
      const { setLogLevel } = await import('./utils/logging.js');
      setLogLevel(logLevelFromUrl);
      structuredLog('INFO', 'init: Log level set from URL', { logLevel: logLevelFromUrl });
    } else {
      // Default to INFO level (hide DEBUG logs)
      const { setLogLevel } = await import('./utils/logging.js');
      setLogLevel('INFO');
      structuredLog('INFO', 'init: Log level set to default', { logLevel: 'INFO' });
    }

    // --- UI LOADER LOGIC (simplified) ---
    // We deliberately ignore ?debug and ?ui parameters for now. All UI imports
    // are deferred until the user performs the global audio unlock (Power On).
    const { createUIContext } = await import('./ui/ui-context.js');

    // Create standardized UI context (plug-and-play contract)
    const uiContext = createUIContext({
      engine,
      DOM,
      eventBus,
      settings: engine.getState(),
      basePath,
      importMetaUrl: import.meta.url
    });

    let activeUIId = null;
    let activeUIDispose = null;

    async function activateUI(id) {
      try {
        // Prevent concurrent activations
        if (activateUI._inProgress) {
          structuredLog('WARN', 'activateUI: activation already in progress', { requested: id });
          return;
        }
        activateUI._inProgress = true;

        // Dispose currently active UI BEFORE loading the next one to avoid
        // overlapping listeners or DOM collisions.
        if (activeUIDispose) {
          try {
            activeUIDispose();
          } catch (e) {
            structuredLog('WARN', 'Previous UI dispose failed', { error: e?.message });
          }
          activeUIDispose = null;
          activeUIId = null;
        }

        // Clear any leftover UI DOM so new UI starts with a clean root
        try {
          if (uiContext && uiContext.DOM && uiContext.DOM.uiPanelRoot) {
            uiContext.DOM.uiPanelRoot.innerHTML = '';
          }
        } catch (e) { /* best-effort */ }

        const entry = getUIEntry(id);
        if (!entry) {
          structuredLog('WARN', 'activateUI: Unknown UI id', { id });
          activateUI._inProgress = false;
          return;
        }
        await loadUIById(id); // dynamic import triggers registration
        const initializer = getComponent(id);
        if (typeof initializer === 'function') {
          activeUIId = id;
          const disposeFn = initializer(uiContext);
          if (typeof disposeFn === 'function') activeUIDispose = disposeFn; else activeUIDispose = null;
          structuredLog('INFO', 'UI activated', { id });
          // Body mode class for styling isolation
          document.body.classList.remove('dev-panel-mode', 'accessible-mode');
          if (id === 'dev-panel') document.body.classList.add('dev-panel-mode');
          if (id === 'touch-gestures') document.body.classList.add('accessible-mode');
        } else {
          structuredLog('ERROR', 'UI module did not register initializer', { id });
        }
        activateUI._inProgress = false;
      } catch (e) {
        structuredLog('ERROR', 'Failed to activate UI', { id, error: e?.message || String(e) });
        activateUI._inProgress = false;
      }
    }

    // Populate selector now (UI activation deferred until Power On)
    const selector = document.getElementById('uiSelector');
    if (selector) {
      selector.innerHTML = '';
      AVAILABLE_UIS.forEach(u => {
        const opt = document.createElement('option');
        opt.value = u.id;
        opt.textContent = u.label;
        selector.appendChild(opt);
      });
      // Default selection
      selector.value = 'touch-gestures';
    }
    
    // ⚠️ ANTI-PATTERN REMOVED: Console Hijack
    // Previously: console.log/warn/error were monkey-patched to route through structuredLog.
    // DANGER: This creates a feedback loop. If structuredLog throws an error, it might try to log
    // that error to console, which calls the override again → Infinite Loop / Stack Overflow.
    // PERFORMANCE: Every innocent console.log becomes a heavy serialization operation, causing
    // the 25MB log bomb issue we experienced.
    // FIX: Use structuredLog EXPLICITLY where needed. Leave native console for browser debugging.
    // Modules that need structured logging should import structuredLog directly and call it.
    // The EventBus now handles all high-frequency events safely with capping and sampling.

    // --- Audio manager and gated startup (user gesture required) ---
  // PRODUCTION GRADE: Create AudioManager NOW. AudioContext is created immediately.
  // The context starts in 'suspended' state. Power-on button will resume it.
  const audioManager = new AudioManager();
  DOM.audioManager = audioManager;
  
  // Verify AudioContext was created successfully
  if (!audioManager.context) {
    throw new Error('CRITICAL: AudioContext not created. This application requires Web Audio API.');
  }
  
  structuredLog('INFO', 'AudioContext created at startup', { 
    state: audioManager.context.state,
    sampleRate: audioManager.context.sampleRate
  });
  
  // Store audioManager separately; audioApi will be assigned AFTER synthesis init
  engine.audioManager = audioManager;
  structuredLog('INFO', 'AudioManager stored on engine; audioApi deferred until initialization', {
    audioContextState: audioManager.context.state
  });
  
  try { 
    bindAudioProcessor(audioManager);
    structuredLog('INFO', 'Audio processor bound to manager', {});
  } catch (e) { 
    console.warn('bindAudioProcessor failed', e);
    structuredLog('ERROR', 'Failed to bind audio processor', { error: e?.message || String(e) });
    throw e; // Fatal - audio is required
  }

    if (DOM.powerOn) {
      // Helper: unlock audio and initialize audio subsystems inside user gesture
  async function handleAudioUnlock(userEvent) {
    const currentState = engine.getState();

    // Announce initialization (language is optional, fallback available)
    try {
      const initLabel = await getText('powerOn.initializing', {}, currentState);
      if (initLabel && initLabel !== 'powerOn.initializing') {
        announceMessage(initLabel);
        if (currentState.ttsEnabled) speakText(currentState, initLabel, 'tts');
      } else {
        announceMessage('Initializing audio...');
        if (currentState.ttsEnabled) speakText(currentState, 'Initializing audio...', 'tts');
      }
    } catch (textErr) {
      structuredLog('DEBUG', 'handleAudioUnlock: getText unavailable, using fallback', { error: textErr?.message || String(textErr) });
      announceMessage('Initializing audio...');
      if (currentState.ttsEnabled) speakText(currentState, 'Initializing audio...', 'tts');
    }

    // STEP 1: Resume AudioContext (browser requires user gesture)
    // AudioContext already exists (created at app startup), just needs to be resumed
    const unlocked = await audioManager.unlockAudio(userEvent);
    if (!unlocked) {
      throw new Error('Failed to unlock audio. Browser blocked the AudioContext resume.');
    }
    structuredLog('INFO', 'handleAudioUnlock: AudioContext resumed successfully', { 
      state: audioManager.context.state 
    });

    // STEP 2: Initialize the audio synthesis system
    // Create oscillator pool, gain nodes, audio graph
    // MUST happen inside user gesture (browser security requirement)
    let audioApiSurface = null;
    try {
      audioApiSurface = await initializeAudio({ audioManager, maxNotes: currentState.maxNotes || 32 });
      // Assign the returned synthesis surface (playCues, resizeOscillatorPool, setSelectedSynthEngine)
      engine.audioApi = audioApiSurface;
      structuredLog('INFO', 'handleAudioUnlock: Audio synthesis system initialized & audioApi assigned', {
        maxNotes: currentState.maxNotes || 32,
        hasPlayCues: typeof audioApiSurface?.playCues === 'function'
      });
    } catch (e) {
      structuredLog('ERROR', 'handleAudioUnlock: Audio synthesis initialization failed', {
        error: e?.message || String(e)
      });
      throw new Error('Failed to initialize audio synthesis: ' + (e?.message || String(e)));
    }

    // STEP 3: Verify audio system is fully operational
    if (!engine.audioApi || typeof engine.audioApi.playCues !== 'function' || !audioManager.context || audioManager.context.state !== 'running') {
      throw new Error(`Audio system not operational: audioApi=${!!engine.audioApi}, playCuesFn=${typeof engine.audioApi?.playCues}, context=${!!audioManager.context}, state=${audioManager.context?.state}`);
    }

    structuredLog('INFO', 'handleAudioUnlock: COMPLETE - Audio system ready', {
      contextState: audioManager.context.state,
      sampleRate: audioManager.context.sampleRate
    });
  }      // Helper: show main UI and optional debug panel R17925 why optional debug panel? dont we have a ?debug=true param to show it?
      async function transitionToMainUI(traceId) {
        if (DOM.splashScreen) DOM.splashScreen.style.display = 'none';
        // Leave decisions about showing/hiding `mainContainer` to the active UI.
        // The bootstrap should not enforce UI-specific DOM behavior — UIs should
        // opt-in to show the main application container if they need it.
        DOM.powerOn.setAttribute('aria-pressed', 'true');
        const uiState = engine.getState();
        const onMsg = await getText('audioOn', {}, uiState).catch(() => 'Audio enabled');
        speakText(uiState, onMsg, 'tts');
        try { trackFeatureUse('power-on', { success: true, traceId }); } catch (e) {}
        structuredLog('INFO', 'Transitioned to main UI', {}, true, true, { traceId });
      }

      // Helper: centralize error handling and UI reset for power-on failures
      async function handlePowerOnError(error, originalLabel, traceId) {
        addSessionError({ message: 'power-on-failed', error: error?.message || String(error), traceId });
        structuredLog('ERROR', 'Power on handler failed', { error: error?.message || String(error), traceId });
        const failState = engine.getState();
        const failMsg = await getText('audio.unavailable', {}, failState).catch(() => 'Audio unavailable. Tap to try again.');
        announceMessage(failMsg);
  speakText(failState, failMsg, 'tts');
        if (DOM.powerOn.querySelector('.power-label')) {
          DOM.powerOn.querySelector('.power-label').textContent = originalLabel;
        } else {
          DOM.powerOn.textContent = originalLabel;
        }
        DOM.powerOn.disabled = false;
      }

      DOM.powerOn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        DOM.powerOn.disabled = true;
        const origLabel = DOM.powerOn.querySelector('.power-label')?.textContent || DOM.powerOn.textContent || 'Power On';
        
        // Generate traceId for user action (power-on)
        const traceId = generateTraceId();
        structuredLog('INFO', 'Power-on button clicked', {}, true, true, { traceId });
        
        try {
          // 1) Unlock audio (user gesture required)
          await handleAudioUnlock(ev, traceId);
          // 2) Determine chosen UI from selector (default to touch-gestures)
          const selectorEl = document.getElementById('uiSelector');
          const chosen = selectorEl && selectorEl.value ? selectorEl.value : 'touch-gestures';
          // 3) Import & initialize chosen UI BEFORE emitting poweredOn so listeners receive the event
          await activateUI(chosen);
          // 4) Emit global lifecycle event so UI modules can react
          try { engine.emit && engine.emit('app:poweredOn', { traceId }); } catch (e) { structuredLog('WARN', 'engine.emit failed', { error: e?.message, traceId }); }
          // 5) Transition visuals
          await transitionToMainUI(traceId);
        } catch (err) {
          await handlePowerOnError(err, origLabel, traceId);
        } finally {
          try { window.__acoustseePowerGesture = false; } catch (e) {}
        }
      }, { once: false });
    }

    // Expose for debugging / potential runtime UI switching
    window.__activateUI = activateUI;
    window.__getActiveUI = () => activeUIId;
    window.__disposeActiveUI = () => { if (activeUIDispose) { try { activeUIDispose(); } catch(e){} activeUIDispose = null; activeUIId = null; } };

    // Initialize Persistent Floating Export Button (Phase 2A Task 2.2 Enhancement)
    // Creates an always-on-top button that persists regardless of UI state
    try {
      const { initializeFloatingExportButton } = await import('./utils/floating-export-btn.js');
      window.__floatingExportBtn = await initializeFloatingExportButton(engine, DOM);
      structuredLog('DEBUG', 'init', {
        message: 'Floating export button initialized',
        type: 'persistent-overlay',
        always_on_top: true
      });
    } catch (err) {
      structuredLog('WARN', 'init', {
        message: 'Failed to initialize floating export button',
        error: err?.message || String(err)
      });
      // Fallback: keep splash-screen button as backup if this fails
      if (DOM.exportEarlyLogsBtn) {
        DOM.exportEarlyLogsBtn.addEventListener('click', async (ev) => {
          ev.preventDefault();
          try {
            DOM.exportEarlyLogsBtn.disabled = true;
            const origText = DOM.exportEarlyLogsBtn.textContent;
            DOM.exportEarlyLogsBtn.textContent = '⏳ Exporting...';
            
            // Dynamically import early-logs utility
            const { downloadEarlyLogsAsJson, getEarlyLogsSummary } = await import('./utils/early-logs.js');
            
            // Get summary for user feedback
            const summary = await getEarlyLogsSummary();
            structuredLog('INFO', 'init', { 
              message: 'User triggered early logs export (fallback)',
              logsCount: summary.total 
            });
            
            // Trigger download
            await downloadEarlyLogsAsJson();
            
            DOM.exportEarlyLogsBtn.textContent = '✓ Exported';
            setTimeout(() => {
              if (DOM.exportEarlyLogsBtn) {
                DOM.exportEarlyLogsBtn.textContent = origText;
                DOM.exportEarlyLogsBtn.disabled = false;
              }
            }, 2000);
          } catch (err) {
            structuredLog('ERROR', 'init', { 
              message: 'Failed to export early logs (fallback)',
              error: err?.message || String(err)
            });
            DOM.exportEarlyLogsBtn.textContent = '✗ Failed';
            DOM.exportEarlyLogsBtn.disabled = false;
            setTimeout(() => {
              if (DOM.exportEarlyLogsBtn) {
                DOM.exportEarlyLogsBtn.textContent = origText;
              }
            }, 2000);
          }
        });
      }
    }

    // Video -> Canvas sizing
    (function setupFrameCapture() {
      // ... (This function remains unchanged, no need to copy it again) ...
    })();
    
    // Video pipeline initialization moved to startProcessing command handler
    // to ensure MediaStream is available before initializing

    structuredLog('INFO', 'init: UI setup complete');
    const stopHealthChecker = startHealthChecker({
      reportFn: trackFeatureUse,
      intervalMs: HEALTH_CHECK_INTERVAL_MS,
      errorThreshold: ERROR_THRESHOLD,
      timeframeMs: ERROR_TIMEFRAME_MS
    });
    
  } catch (err) {
    // Handle critical accessibility errors with appropriate UI
    if (err instanceof AccessibilityError) {
      emergencyTrack('accessibility-system-failure', {
        code: err.code,
        message: err.message,
        context: err.context || {}
      });
      
      showCriticalError(
        'AcoustSee Initialization Failed',
        err.message,
        {
          error: err.message,
          code: err.code,
          context: err.context,
          troubleshooting: 'Core accessibility systems failed to start'
        }
      );
      
      structuredLog('ERROR', 'CRITICAL: Accessibility system failed', {
        code: err.code,
        message: err.message,
        context: err.context,
        stack: err.stack
      });
      
      return; // Don't proceed with normal error handling
    }
    
    // Handle other initialization errors
    emergencyTrack('init-failure', {
      message: err.message,
      stack: err.stack,
      data: err.data || {}
    });
    let errorMessage = err.message;
    let errorData = err instanceof CustomError ? err.data : {};
    let specificMessage = errorMessage;
    if (err.data?.missing) {
      specificMessage = `Missing DOM elements: ${err.data.missing.join(', ')}`;
    }
    structuredLog('ERROR', 'init error', { message: specificMessage, data: errorData, stack: err.stack });
    console.error('init error:', err.message);
      try {
  const errorState = engine.getState();
  const errorText = await getText('init.tts.error', {}, errorState);
  speakText(errorState, errorText, 'tts');
      const initFail = await getTextCached('init.failed', { specificMessage }, errorState).catch(() => `Initialization failed: ${specificMessage}. Check console for details.`);
      announceMessage(initFail);
    } catch (ttsErr) {
      console.error('TTS error:', ttsErr.message);
      const ttsCatchState = engine.getState();
      const initFail = await getTextCached('init.failed', { specificMessage }, ttsCatchState).catch(() => `Initialization failed: ${specificMessage}. Check console for details.`);
      announceMessage(initFail);
    }
  }
}

// Global error handler for unhandled AccessibilityErrors
window.addEventListener('error', (event) => {
  const error = event.error;
  if (error instanceof AccessibilityError) {
    event.preventDefault(); // Prevent default error handling
    
    showCriticalError(
      'Accessibility System Error',
      error.message,
      {
        error: error.message,
        code: error.code,
        context: error.context,
        location: `${event.filename}:${event.lineno}:${event.colno}`
      }
    );
    
    structuredLog('ERROR', 'CRITICAL: Unhandled accessibility error', {
      code: error.code,
      message: error.message,
      context: error.context,
      location: `${event.filename}:${event.lineno}:${event.colno}`,
      stack: error.stack
    });
    
    emergencyTrack('unhandled-accessibility-error', {
      code: error.code,
      message: error.message,
      context: error.context || {}
    });
  }
});

// Global promise rejection handler for unhandled AccessibilityErrors
window.addEventListener('unhandledrejection', (event) => {
  const error = event.reason;
  if (error instanceof AccessibilityError) {
    event.preventDefault(); // Prevent default promise rejection handling
    
    showCriticalError(
      'Accessibility System Promise Failure',
      error.message,
      {
        error: error.message,
        code: error.code,
        context: error.context,
        type: 'Promise Rejection'
      }
    );
    
    structuredLog('ERROR', 'CRITICAL: Unhandled accessibility promise rejection', {
      code: error.code,
      message: error.message,
      context: error.context,
      stack: error.stack
    });
    
    emergencyTrack('unhandled-accessibility-promise-rejection', {
      code: error.code,
      message: error.message,
      context: error.context || {}
    });
  }
});

// NOTE: init() is exported. Bootloader will import and call init() so startup errors
// are caught and reported by the centralized boot error handlers.

window.addEventListener('pagehide', () => {
  trackFeatureUse('session-end', { duration: Math.round(performance.now() / 1000) });
});

window.pingIngest = pingIngest;
console.log('Ingest ping function is available. Type `pingIngest()` in the console to test.');