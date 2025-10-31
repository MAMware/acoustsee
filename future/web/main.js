// File: web/main.js
// Main application entry point, called by boot.js.
// This module orchestrates the initialization of all major subsystems:
// the core engine, UI, audio pipeline, and video pipeline. It loads initial
// configurations and wires up the primary user interaction (the power-on button).
//
// Architecture:
// - Uses modern browser features (async/await, Web Workers, Web Audio).
// - Follows a modular, event-driven pattern managed by the core engine.
// TODO R311025 it seems we have two ingest.js, one at core and other at utils, this is a archituctre smell to me, also we might check consolidating the logging, analytics and performance

import { createEngine } from './core/engine.js';
import { createEventBus } from './core/event-bus.js';
import { initializeAnalytics } from './core/event-bus-analytics.js';
import { settings } from './core/state.js';
import { structuredLog, loggingConfig, initializeLogging } from './utils/logging.js';
import { 
  AccessibilityError, 
  showCriticalError, 
  isCriticalSystem 
} from './utils/error-handling.js';
import { trackFeatureUse, emergencyTrack, pingIngest } from './core/ingest.js';
import { getText, initializeLanguageIfNeeded, speakText, announceMessage, setLanguage, translatePage } from './utils/utils.js';
import AudioManager from './audio/audio-manager.js';
import { initializeAudio, bindAudioManager as bindAudioProcessor, registerAudioListeners } from './audio/audio-processor.js';
import { loadAvailableGrids } from './video/grids/available-grids.js';
import { addSessionError, startHealthChecker } from './utils/performance.js';
import { getComponent } from './ui/ui-registry.js';
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
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };
  try {
    // Validate DOM early
    validateDOM();

    // STEP 0: Create the engine first (required by all command handlers)
    const baseEngine = createEngine();
    
    // Wrap engine with smart ingest interceptor that leverages existing performance data
    const engine = createIngestInterceptor(baseEngine);
    
    // Make engine globally available for UI components
    window.engine = engine;

    // STEP 0.5: Create unified EventBus for logging and command tracking
    // Must be created after engine but before initializing subsystems that need it
    const eventBus = createEventBus({
      state: settings,
      maxEvents: 200
    });
    
    // Initialize logging module with EventBus
    initializeLogging(eventBus);
    
    // Inject EventBus into engine for command tracking
    engine.setEventBus(eventBus);
    
    // Initialize analytics subscribers (replaces direct ingest tracking)
    initializeAnalytics(eventBus, settings);
    
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
        settings.availableGrids = grids;
        // Set a default grid if one isn't already set
        if (!settings.gridType) {
          settings.gridType = grids[0].id;
        }
        structuredLog('INFO', 'init: Video grids loaded successfully', { count: grids.length, default: settings.gridType });
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
    structuredLog('INFO', 'init: Configurations loaded', {
      gridType: settings.gridType,
      synthesisEngine: settings.synthesisEngine,
      language: settings.language
    });

    // Ensure language is initialized before UI translation
    initializeLanguageIfNeeded(settings);
    try {
      await setLanguage(settings.language, settings);
      translatePage(document, settings);
    } catch (e) {
      structuredLog('WARN', 'setLanguage/translatePage failed', { error: e?.message || String(e) });
    }

    // This check will now run AFTER grids are loaded, so the warning should disappear.
    if (!settings.gridType || !settings.synthesisEngine || !settings.language) {
      const missing = [];
      if (!settings.gridType) missing.push('grids');
      if (!settings.synthesisEngine) missing.push('engines');
      if (!settings.language) missing.push('languages');
      const msg = await getText('initMissingConfigs', { missing: missing.join(', ') }, settings);
      announceMessage(msg);
  if (settings.ttsEnabled) speakText(settings, msg, 'tts');
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

    // --- UI LOADER LOGIC (dynamic import to avoid duplicate initialization) ---
    const isDebugMode = logLevelFromUrl ? logLevelFromUrl === 'debug' || urlParams.get('debug') === 'true' : urlParams.get('debug') === 'true';
    
    // Import UI context factory for standardized initialization
    const { createUIContext } = await import('./ui/ui-context.js');
    
    // Create standardized UI context (plug-and-play contract)
    const uiContext = createUIContext({
      engine,
      DOM,
      eventBus,
      settings,
      basePath,
      importMetaUrl: import.meta.url
    });
    
    if (isDebugMode) {
      // userAgent has been disabled (commented out) even in debug mode as per MAMware request, it seem they do add any usefull info
      // loggingConfig.includeUserAgent = true;
      document.body.classList.add('dev-panel-mode');
      try {
        // Import the module so it can register itself and listen for lifecycle events.
        await import('./ui/dev-panel/dev-panel.js');
        structuredLog('INFO', 'Dev Panel module loaded. Initializing via registry.');
        try {
          const devPanelInitializer = getComponent('dev-panel');
          if (typeof devPanelInitializer === 'function') {
            // Pass standardized uiContext
            devPanelInitializer(uiContext);
            structuredLog('INFO', 'Dev Panel initialized via registry with standardized context.');
          } else {
            structuredLog('ERROR', 'Dev Panel module loaded but did not register an initializer.');
          }
        } catch (e) {
          structuredLog('ERROR', 'Dev Panel initialization via registry failed', { error: e?.message || String(e) });
        }
      } catch (e) { structuredLog('WARN', 'Failed to load dev panel UI', { error: e?.message || String(e) }); }
    } else {
      document.body.classList.add('accessible-mode');
      try {
        const mod = await import('./ui/touch-gestures/touch-gestures-ui.js');
        if (mod && typeof mod.initializeAccessibleUI === 'function') {
          // Pass standardized uiContext (supports legacy signature too)
          mod.initializeAccessibleUI(uiContext);
          structuredLog('INFO', 'Initialized in Accessible UI mode with standardized context.');
        }
      } catch (e) { structuredLog('WARN', 'Failed to load accessible UI', { error: e?.message || String(e) }); }
    }
    
    // Console overrides
    function safeStructuredLog(level, message, data = {}, persist = true, sample = true) {
      const tempLog = console.log;
      const tempWarn = console.warn;
      const tempError = console.error;
      let threw = false;
      try {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;
        structuredLog(level, message, data, persist, sample);
        trackFeatureUse(level, { message, ...data });
      } catch (err) {
        threw = true;
        console.log = tempLog;
        console.warn = tempWarn;
        console.error = tempError;
        originalConsole.error('safeStructuredLog error:', err);
      } finally {
        if (!threw) {
          console.log = tempLog;
          console.warn = tempWarn;
          console.error = tempError;
        }
      }
    }

    console.log = (...args) => {
      originalConsole.log.apply(console, args);
      if (settings.debugLogging) safeStructuredLog('INFO', 'Console log', { args }, false);
    };
    console.warn = (...args) => {
      originalConsole.warn.apply(console, args);
      if (settings.debugLogging) safeStructuredLog('WARN', 'Console warn', { args }, false);
    };
    console.error = (...args) => {
      originalConsole.error.apply(console, args);
      safeStructuredLog('ERROR', 'Console error', { args }, false);
    };

    // --- Audio manager and gated startup (user gesture required) ---
  const audioManager = new AudioManager();
  DOM.audioManager = audioManager;
  try { bindAudioProcessor(audioManager); } catch (e) { console.warn('bindAudioProcessor failed', e); }

    if (DOM.powerOn) {
      // Helper: unlock audio and initialize audio subsystems inside user gesture
      async function handleAudioUnlock(event, traceId) {
        // Show initializing feedback
        const initLabel = await getText('powerOn.initializing', {}, settings).catch(() => 'Initializing...');
        if (DOM.powerOn.querySelector('.power-label')) {
          DOM.powerOn.querySelector('.power-label').textContent = initLabel;
        } else {
          DOM.powerOn.textContent = initLabel;
        }

        try { window.__acoustseePowerGesture = true; } catch (e) {}
        const unlocked = await audioManager.unlockAudio(event);
        if (!unlocked) throw new Error('AudioContext could not be unlocked.');

        await audioManager.initialize();
        try {
          // Initialize audio processor using dependency injection via a config object.
          const audioApi = await initializeAudio({ audioManager, maxNotes: settings.maxNotes });
          // Attach the initialized audio API onto the engine for consumers.
          engine.audioApi = audioApi;
          // Register audio listeners for object and BPM cues
          registerAudioListeners(engine);
          structuredLog('INFO', 'main', 'Audio system initialized', { traceId });
        } catch (initErr) {
          // Handle critical audio system failures appropriately
          if (initErr instanceof AccessibilityError) {
            showCriticalError(
              'Audio System Failed',
              initErr.message,
              { 
                error: initErr.message,
                code: initErr.code,
                context: initErr.context,
                troubleshooting: 'Audio is required for visual-to-audio conversion',
                traceId
              }
            );
            throw initErr; // Re-throw to prevent incomplete initialization
          } else {
            structuredLog('ERROR', 'initializeAudio failed', { error: initErr?.message || String(initErr), traceId });
            throw initErr;
          }
        }
      }

      // Helper: show main UI and optional debug panel R17925 why optional debug panel? dont we have a ?debug=true param to show it?
      async function transitionToMainUI(traceId) {
        if (DOM.splashScreen) DOM.splashScreen.style.display = 'none';
        if (DOM.mainContainer) DOM.mainContainer.style.display = 'block';
        DOM.powerOn.setAttribute('aria-pressed', 'true');
        const onMsg = await getText('audioOn', {}, settings).catch(() => 'Audio enabled');
  speakText(settings, onMsg, 'tts');
        try { trackFeatureUse('power-on', { success: true, traceId }); } catch (e) {}

        try {
          // Dev panel is initialized at startup when ?debug=true. No autoOpen needed here.
          // No direct action required here; the Dev Panel manages its own visibility
          // via the engine lifecycle event. main.js should not assume UI state.
        } catch (e) { console.warn('showing debugUI failed', e); }
        structuredLog('INFO', 'main', 'Transitioned to main UI', { traceId });
      }

      // Helper: centralize error handling and UI reset for power-on failures
      async function handlePowerOnError(error, originalLabel, traceId) {
        addSessionError({ message: 'power-on-failed', error: error?.message || String(error), traceId });
        structuredLog('ERROR', 'Power on handler failed', { error: error?.message || String(error), traceId });
        const failMsg = await getText('audio.unavailable', {}, settings).catch(() => 'Audio unavailable. Tap to try again.');
        announceMessage(failMsg);
  speakText(settings, failMsg, 'tts');
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
        structuredLog('INFO', 'main', 'Power-on button clicked', { traceId });
        
        try {
          await handleAudioUnlock(ev, traceId);
            // Emit global lifecycle event so UI modules can self-activate
            try { engine.emit && engine.emit('app:poweredOn', { traceId }); } catch (e) { structuredLog('WARN', 'engine.emit failed', { error: e?.message, traceId }); }
            await transitionToMainUI(traceId);
        } catch (err) {
          await handlePowerOnError(err, origLabel, traceId);
        } finally {
          try { window.__acoustseePowerGesture = false; } catch (e) {}
        }
      }, { once: false });
    }

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
    originalConsole.error('init error:', err.message);
      try {
  const errorText = await getText('init.tts.error', {}, settings);
  speakText(settings, errorText, 'tts');
      const initFail = await getTextCached('init.failed', { specificMessage }, settings).catch(() => `Initialization failed: ${specificMessage}. Check console for details.`);
      announceMessage(initFail);
    } catch (ttsErr) {
      originalConsole.error('TTS error:', ttsErr.message);
      const initFail = await getTextCached('init.failed', { specificMessage }, settings).catch(() => `Initialization failed: ${specificMessage}. Check console for details.`);
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