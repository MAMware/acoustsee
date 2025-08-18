// File: web/main.js
import { createEngine } from './core/engine.js';
import { settings, setAutoFpsBenchmark } from './core/state.js';
import { structuredLog } from './utils/logging.js';
import { setDOM, setDispatchEvent } from './core/context.js';
import { trackFeatureUse, emergencyTrack, pingIngest } from './core/ingest.js';
import { getText, initializeLanguageIfNeeded, speakText, announceMessage, setLanguage, translatePage } from './utils/utils.js';
import { startCamera as mediaStartCamera, stopCamera as mediaStopCamera, isCameraActive } from './core/media-controller.js';
import { initializeAudio } from './audio/audio-processor.js';
import AudioManager from './audio/audio-manager.js';
import { bindAudioManager as bindAudioProcessor } from './audio/audio-processor.js';
import { processFrameWithState } from './video/frame-processor.js';
import { getPreferredIntervalMs, addSessionError, startHealthChecker } from './utils/performance.js';
import { initializeDebugUI } from './ui/debug-ui.js';
import { initializeAccessibleUI } from './ui/accessible-ui.js';
import { setupAudioControls } from './audio/audio-controls.js';

const HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const ERROR_THRESHOLD = 5; // Alert if more than 5 errors
const ERROR_TIMEFRAME_MS = 2 * 60 * 1000; // Look at last 2 minutes
// Translation cache for static keys
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
  // Add root for new UI panels
  uiPanelRoot: document.getElementById('ui-panel-root'),
};

// Initialize shared DOM context for modules that need it
setDOM(DOM);

// Custom Error class to attach metadata
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

async function init() {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };
  try {
    // Validate DOM early
    validateDOM();

    // configs are now loaded synchronously via import
    structuredLog('INFO', 'init: Configurations loaded', {
      gridType: settings.gridType,
      synthesisEngine: settings.synthesisEngine,
      language: settings.language
    });

    // Handle missing configuration gracefully
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

    // Ensure language is initialized and preloaded before UI translation
    initializeLanguageIfNeeded();
    try {
      await setLanguage(settings.language);
      translatePage(document);
    } catch (e) {
      structuredLog('WARN', 'setLanguage/translatePage failed', { error: e?.message || String(e) });
    }

    // --- Headless engine: instantiate and wire up ---
    const engine = createEngine();
    setDispatchEvent(engine.dispatch);

    // --- UI LOADER LOGIC ---
    const urlParams = new URLSearchParams(window.location.search);
    const isDebugMode = urlParams.get('debug') === 'true';

    if (isDebugMode) {
      document.body.classList.add('debug-mode');
      initializeDebugUI(engine, DOM);
      structuredLog('INFO', 'Initialized in Debug UI mode.');
    } else {
      document.body.classList.add('accessible-mode');
      initializeAccessibleUI(engine, DOM);
      structuredLog('INFO', 'Initialized in Accessible UI mode.');
    }

    // --- GLOBAL SETUPS (UI-independent) ---
    // Audio controls setup is global, as the splash screen is always present.
    setupAudioControls({ dispatchEvent: engine.dispatch, DOM });
 
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
        const origLabel = DOM.powerOn.textContent;
        try {
          try {
            const initLabel = await getTextCached('powerOn.initializing', {});
            if (initLabel) DOM.powerOn.textContent = initLabel;
          } catch (e) { /* best-effort */ }
          
          const unlocked = await audioManager.unlockAudio(ev);
          if (!unlocked) {
            const msg = await getTextCached('audio.unavailable', {}).catch(() => 'Audio unavailable. Tap to try again.');
            announceMessage(msg);
            try { trackFeatureUse('power-on', { success: false }); } catch (e) {}
            DOM.powerOn.disabled = false;
            DOM.powerOn.textContent = origLabel;
            return;
          }

          try {
            await audioManager.initialize();
            try { await initializeAudio(audioManager.context); } catch (e) { /* non-fatal */ }
            await audioManager.resume();
          } catch (inner) {
            addSessionError({ message: 'audio-init-failed', error: inner?.message || String(inner) });
            structuredLog('ERROR', 'Audio initialization failed after unlock', { error: inner?.message || String(inner) });
            const failMsg = await getTextCached('audio.initFailed', {}).catch(() => 'Audio initialization failed. You may need to tap again.');
            announceMessage(failMsg);
            DOM.powerOn.disabled = false;
            DOM.powerOn.textContent = origLabel;
            return;
          }

          if (DOM.splashScreen) DOM.splashScreen.style.display = 'none';
          if (DOM.mainContainer) DOM.mainContainer.style.display = 'block'; // Use block, not grid
          DOM.powerOn.setAttribute('aria-pressed', 'true');

          const onMsg = await getTextCached('audioOn').catch(() => null);
          if (onMsg) speakText(onMsg);
          try { if (engine && typeof engine.dispatch === 'function') engine.dispatch('updateUI', { settingsMode: false, streamActive: false, micActive: false }); } catch (e) {}
          try { trackFeatureUse('power-on', { success: true }); } catch (e) {}
        } catch (err) {
          addSessionError({ message: 'power-on-failed', error: err?.message || String(err) });
          structuredLog('ERROR', 'Power on handler failed', { error: err?.message || String(err) });
          const startupFailMsg = await getTextCached('startup.failed', {}).catch(() => 'Startup failed. Check console for details.');
          announceMessage(startupFailMsg);
          DOM.powerOn.disabled = false;
          DOM.powerOn.textContent = origLabel;
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

window.onerror = function (message, source, lineno, colno, error) {
  const errorPayload = { message, source, lineno, colno, stack: error ? error.stack : 'N/A' };
  structuredLog('ERROR', 'Uncaught global error', errorPayload);
  trackFeatureUse('globalError', errorPayload);
  addSessionError(errorPayload);
  if (settings?.debugLogging ?? true) {
    console.error(message);
    return false;
  }
  return true;
};

init();

window.addEventListener('pagehide', () => {
  trackFeatureUse('session-end', { duration: Math.round(performance.now() / 1000) });
});

window.pingIngest = pingIngest;
console.log('Ingest ping function is available. Type `pingIngest()` in the console to test.');