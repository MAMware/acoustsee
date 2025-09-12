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
import { processFrameWithState } from './video/frame-processor.js'; //R12925: duplicated file source
import { enableFrameWorker } from './video/frame-processor.js'; //R12925: duplicated file source
import { loadAvailableGrids } from './video/grids/available-grids.js';
import { addSessionError, startHealthChecker } from './utils/performance.js';
import { initializeDebugUI } from './ui/debug-ui.js'; //R12925: looks alike to deboug-panel.js 
import { initializeAccessibleUI } from './ui/accessible-ui.js'; //R12925: i dont like this name, touch-gesture-ui.js might be better
import { showDebugPanel } from './ui/debug-panel.js';


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

    // --- UI LOADER LOGIC ---
    const urlParams = new URLSearchParams(window.location.search);
    const isDebugMode = urlParams.get('debug') === 'true';

    if (isDebugMode) {
      document.body.classList.add('debug-mode');
      // In debug mode via URL param, instantiate the debug UI in a passive state:
      // - autoOpen: false -> don't show heavy panel UI by default
      // - skipDiagnostics: true -> avoid running device/audio diagnostics automatically
      initializeDebugUI(engine, DOM, { autoOpen: false, skipDiagnostics: true });
      structuredLog('INFO', 'Initialized in passive Debug UI mode.');
    } else {
      document.body.classList.add('accessible-mode');
      initializeAccessibleUI(engine, DOM);
      structuredLog('INFO', 'Initialized in Accessible UI mode.');
    }
    
    // --- Start frame worker if configured to run by default ---
    try {
      if (settings.enableFrameWorker) enableFrameWorker(true);
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
      DOM.powerOn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        DOM.powerOn.disabled = true;
        const origLabel = DOM.powerOn.querySelector('.power-label')?.textContent || DOM.powerOn.textContent || 'Power On';
       
        try {
          // 1. Show "Initializing..." feedback immediately
          const initLabel = await getText('powerOn.initializing', {}).catch(() => 'Initializing...');
          if (DOM.powerOn.querySelector('.power-label')) {
            DOM.powerOn.querySelector('.power-label').textContent = initLabel;
          } else {
            DOM.powerOn.textContent = initLabel;
          }
         
          // 2. Attempt to unlock and initialize audio within the user gesture.
          // Set a transient, explicit flag to indicate this unlock was initiated
          // by the Power button. This prevents other UI interactions (for
          // example debug-panel taps) from being treated as the main power
          // gesture and accidentally unlocking the AudioContext.
          try { window.__acoustseePowerGesture = true; } catch (e) {}
          const unlocked = await audioManager.unlockAudio(ev);
          if (!unlocked) {
            // This is a hard failure to unlock the context.
            throw new Error('AudioContext could not be unlocked.');
          }

          // 3. Once unlocked, initialize the rest of the audio graph.
          await audioManager.initialize();
          await initializeAudio(audioManager.context);
         
          // 4. Success! Transition to the main UI.
          if (DOM.splashScreen) DOM.splashScreen.style.display = 'none';
          if (DOM.mainContainer) DOM.mainContainer.style.display = 'block';
          DOM.powerOn.setAttribute('aria-pressed', 'true');

          const onMsg = await getText('audioOn').catch(() => 'Audio enabled');
          speakText(onMsg);
          try { trackFeatureUse('power-on', { success: true }); } catch (e) {}

          // --- NEW LOGIC: SHOW DEBUG PANEL ON POWER ON ---
          // After a successful audio unlock, check if we're in debug mode
          // via the URL query param and show the debug panel immediately.
          try {
            const urlParams = new URLSearchParams(window.location.search);
            const isDebugModeNow = urlParams.get('debug') === 'true';
            if (isDebugModeNow && typeof showDebugPanel === 'function') {
              showDebugPanel({ waitForSplash: false });
            }
          } catch (e) {
            console.warn('showDebugPanel failed or not available', e);
          }
          // --- END NEW LOGIC ---

  } catch (err) {
          // 5. --- New critical feedback logic ---
          addSessionError({ message: 'power-on-failed', error: err?.message || String(err) });
          structuredLog('ERROR', 'Power on handler failed', { error: err?.message || String(err) });
         
          // Inform the user what happened and allow them to retry.
          const failMsg = await getText('audio.unavailable').catch(() => 'Audio unavailable. Tap to try again.');
          announceMessage(failMsg);
          speakText(failMsg);

          // Reset the button to its original state so the user can click again.
          if (DOM.powerOn.querySelector('.power-label')) {
            DOM.powerOn.querySelector('.power-label').textContent = origLabel;
          } else {
            DOM.powerOn.textContent = origLabel;
          }
          DOM.powerOn.disabled = false;
        } finally {
          // Clear the transient power gesture flag to avoid leaking it to other code.
          try { window.__acoustseePowerGesture = false; } catch (e) {}
        }
      }, { once: false });
    }

    // Video -> Canvas sizing
    (function setupFrameCapture() {
      // ... (This function remains unchanged, no need to copy it again) ...
    })();
    
    settings._frameProcessor = processFrameWithState;

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