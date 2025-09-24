// File: web/main.js
// Main entry point for the web application.
// Initializes the UI, audio, video processing, and core engine.
// Handles configuration loading, error reporting, and user interactions.
// Extensive use of async/await to ensure proper sequencing of initialization steps.
// REQUIRES: modern browser with ES6+ support, Fetch API, Web Audio API, Web Workers.
// Note: This file can be quite large due to the comprehensive initialization logic.
// REVIEW: 2025-09-12=R12925: Check the claims from the comment above are still accurate.
// R12925:Wouldnt the imports look better by not duplicating when they come from the same file?

import { createEngine } from './core/engine.js';
import { settings } from './core/state.js';
import { structuredLog } from './utils/logging.js';
import { setDOM, setDispatchEvent } from './core/context.js';
import { trackFeatureUse, emergencyTrack, pingIngest } from './core/ingest.js';
import { getText, initializeLanguageIfNeeded, speakText, announceMessage, setLanguage, translatePage } from './utils/utils.js'; //R12925: looks like we do much of the same here
import { initializeAudio } from './audio/audio-processor.js'; //R12925: duplicated file source
import AudioManager from './audio/audio-manager.js';
import { bindAudioManager as bindAudioProcessor } from './audio/audio-processor.js'; //R12925: duplicated file source
import { enableFrameWorker } from './video/frame-processor.js'; //R12925: duplicated file source
import { loadAvailableGrids } from './video/grids/available-grids.js';
import { addSessionError, startHealthChecker } from './utils/performance.js';
import { getComponent } from './ui/ui-registry.js';
// UI modules are loaded dynamically below to ensure only one UI initializes
// at runtime (debug vs accessible). Dynamic import prevents duplicate IDs
// and avoids initializing both UIs in the same session.


const HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const ERROR_THRESHOLD = 5; // Alert if more than 5 errors
const ERROR_TIMEFRAME_MS = 2 * 60 * 1000; // Look at last 2 minutes
const translationCache = {};

// Cached getText wrapper
async function getTextCached(key, params = {}) {
  const cacheKey = JSON.stringify({ key, params });
  if (translationCache[cacheKey]) return translationCache[cacheKey];
  const result = await getText(key, params);
  translationCache[cacheKey] = result;
  return result;
}

const DOM = {
  videoFeed: document.getElementById('videoFeed'),
  frameCanvas: document.getElementById('frameCanvas'),  
  button1: document.getElementById('button1'),
  powerOn: document.getElementById('powerOn'),
  splashScreen: document.getElementById('splashScreen'),
  mainContainer: document.getElementById('mainContainer'),
  debugPanel: document.getElementById('debugPanel'),
    uiPanelRoot: document.getElementById('ui-panel-root'),
};

setDOM(DOM);

/*
  Runtime basePath detection

  Why this exists:
  - When the app is hosted in a subdirectory (for example on GitHub Pages
    under https://<org>.github.io/acoustsee/), simple root-relative paths
    like `/ui/dev-panel/dev-panel.css` will not include the deeper
    repository path segment (for example `/acoustsee/future/web/`) and will
    therefore 404. This has historically caused worker and stylesheet MIME
    errors because the server returned HTML instead of the expected file.

  - To make the app resilient to being deployed under different base paths
    (root, repo subpath, or other nested folders), we compute a `basePath`
    at runtime from the script element that loaded the bootloader (usually
    `boot.js`) and use it as the anchor for constructing dynamic asset URLs
    (workers, dynamically-loaded CSS, etc.).

  How it works:
  - We inspect the DOM to find the <script> element which loaded `boot.js`.
    The script's `src` contains the actual URL used to fetch the app bundle
    and therefore reveals the app's hosting path (for example
    `https://.../acoustsee/future/web/boot.js`). We extract the directory
    portion and use it as `basePath`.

  - Callers that load assets dynamically should accept a `basePath` or
    allow the initializer to pass a `workerBaseUrl` / `basePath` through
    their config. Example: `enableFrameWorker(true, { workerBaseUrl: basePath + 'video/' })`.

  - This logic intentionally prefers the boot script's location because the
    boot script is the most reliable anchor for the app's deployment root
    and works for variations such as `/past/web/`, `/present/web/`, and
    `/future/web/`.

  NOTE: This is a runtime compatibility shim — build-time bundlers that
  produce absolute import.meta URLs may still provide import.meta.url to
  modules, but relying on import.meta alone is not safe for all test or
  runtime environments (some test runners strip it). The boot-script
  derived basePath is robust across those environments.
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

    // STEP 2: Now that all configs are loaded, log and check them.
    structuredLog('INFO', 'init: Configurations loaded', {
      gridType: settings.gridType,
      synthesisEngine: settings.synthesisEngine,
      language: settings.language
    });

    // Ensure language is initialized before UI translation
    initializeLanguageIfNeeded();
    try {
      await setLanguage(settings.language);
      translatePage(document);
    } catch (e) {
      structuredLog('WARN', 'setLanguage/translatePage failed', { error: e?.message || String(e) });
    }

    // This check will now run AFTER grids are loaded, so the warning should disappear.
    if (!settings.gridType || !settings.synthesisEngine || !settings.language) {
      const missing = [];
      if (!settings.gridType) missing.push('grids');
      if (!settings.synthesisEngine) missing.push('engines');
      if (!settings.language) missing.push('languages');
      const msg = await getText('initMissingConfigs', { missing: missing.join(', ') });
      announceMessage(msg);
      if (settings.ttsEnabled) speakText(msg);
      structuredLog('WARN', 'Partial configs; proceeding with limitations', { missing });
    }

    // --- Headless engine: instantiate and wire up ---
    const engine = createEngine();
    setDispatchEvent(engine.dispatch);

    // --- UI LOADER LOGIC (dynamic import to avoid duplicate initialization) ---
    const urlParams = new URLSearchParams(window.location.search);
    const isDebugMode = urlParams.get('debug') === 'true';
    if (isDebugMode) {
      document.body.classList.add('dev-panel-mode');
      try {
        // Import the module so it can register itself and listen for lifecycle events.
        await import('./ui/dev-panel/dev-panel.js');
        structuredLog('INFO', 'Dev Panel module loaded. Initializing via registry.');
        try {
          const devPanelInitializer = getComponent('dev-panel');
          if (typeof devPanelInitializer === 'function') {
            devPanelInitializer(engine, DOM, { importMetaUrl: import.meta.url, settings, basePath });
            structuredLog('INFO', 'Dev Panel initialized via registry.');
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
          mod.initializeAccessibleUI(engine, DOM);
          structuredLog('INFO', 'Initialized in Accessible UI mode.');
        }
      } catch (e) { structuredLog('WARN', 'Failed to load accessible UI', { error: e?.message || String(e) }); }
    }
    
    // --- Start frame worker if configured to run by default ---
    try {
      if (settings.enableFrameWorker) {
        // Pass a workerBaseUrl derived from the basePath so the frame-processor
        // can resolve the correct worker URL regardless of hosting location.
        try {
          enableFrameWorker(true, { workerBaseUrl: basePath + 'video/' });
        } catch (e) {
          // Fallback to previous call if anything unexpected happens
          enableFrameWorker(true);
        }
      }
    } catch (e) {
      structuredLog('WARN', 'enableFrameWorker failed', { error: e?.message || String(e) });
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
      async function handleAudioUnlock(event) {
        // Show initializing feedback
        const initLabel = await getText('powerOn.initializing', {}).catch(() => 'Initializing...');
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
          const audioApi = await initializeAudio({ audioManager, maxNotes: settings.maxNotes, engineDispatch: engine.dispatch });
          try { const { setAudioApi } = await import('./audio/audio-processor.js'); setAudioApi(audioApi); } catch(e) {}
        } catch (initErr) {
          structuredLog('ERROR', 'initializeAudio failed', { error: initErr?.message || String(initErr) });
          throw initErr;
        }
      }

      // Helper: show main UI and optional debug panel R17925 why optional debug panel? dont we have a ?debug=true param to show it?
      async function transitionToMainUI() {
        if (DOM.splashScreen) DOM.splashScreen.style.display = 'none';
        if (DOM.mainContainer) DOM.mainContainer.style.display = 'block';
        DOM.powerOn.setAttribute('aria-pressed', 'true');
        const onMsg = await getText('audioOn').catch(() => 'Audio enabled');
        speakText(onMsg);
        try { trackFeatureUse('power-on', { success: true }); } catch (e) {}

        try {
          // Dev panel is initialized at startup when ?debug=true. No autoOpen needed here.
          // No direct action required here; the Dev Panel manages its own visibility
          // via the engine lifecycle event. main.js should not assume UI state.
        } catch (e) { console.warn('showing debugUI failed', e); }
      }

      // Helper: centralize error handling and UI reset for power-on failures
      async function handlePowerOnError(error, originalLabel) {
        addSessionError({ message: 'power-on-failed', error: error?.message || String(error) });
        structuredLog('ERROR', 'Power on handler failed', { error: error?.message || String(error) });
        const failMsg = await getText('audio.unavailable').catch(() => 'Audio unavailable. Tap to try again.');
        announceMessage(failMsg);
        speakText(failMsg);
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
        try {
          await handleAudioUnlock(ev);
            // Emit global lifecycle event so UI modules can self-activate
            try { engine.emit && engine.emit('app:poweredOn'); } catch (e) { structuredLog('WARN', 'engine.emit failed', { error: e?.message }); }
            await transitionToMainUI();
        } catch (err) {
          await handlePowerOnError(err, origLabel);
        } finally {
          try { window.__acoustseePowerGesture = false; } catch (e) {}
        }
      }, { once: false });
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
      const errorText = await getText('init.tts.error');
      speakText(errorText);
      const initFail = await getTextCached('init.failed', { specificMessage }).catch(() => `Initialization failed: ${specificMessage}. Check console for details.`);
      announceMessage(initFail);
    } catch (ttsErr) {
      originalConsole.error('TTS error:', ttsErr.message);
      const initFail = await getTextCached('init.failed', { specificMessage }).catch(() => `Initialization failed: ${specificMessage}. Check console for details.`);
      announceMessage(initFail);
    }
  }
}

// NOTE: init() is exported. Bootloader will import and call init() so startup errors
// are caught and reported by the centralized boot error handlers.

window.addEventListener('pagehide', () => {
  trackFeatureUse('session-end', { duration: Math.round(performance.now() / 1000) });
});

window.pingIngest = pingIngest;
console.log('Ingest ping function is available. Type `pingIngest()` in the console to test.');