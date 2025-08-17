// File: web/main.js
import { setupUIController } from './ui/ui-controller.js';
import { createEngine } from './core/engine.js';
import { setupInputMapper } from './ui/ui-input-mapper.js';
import { setupUIRenderer } from './ui/ui-renderer.js';
import { setupUIEffectsHandler } from './ui/ui-effects-handler.js';
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
  button2: document.getElementById('button2'),
  button3: document.getElementById('button3'),
  button4: document.getElementById('button4'),
  button5: document.getElementById('button5'),
  button6: document.getElementById('button6'),
  powerOn: document.getElementById('powerOn'),
  splashScreen: document.getElementById('splashScreen'),
  mainContainer: document.getElementById('mainContainer'),
  debugPanel: document.getElementById('debugPanel'),
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
  const requiredIds = ['videoFeed', 'button1', 'button2', 'button3', 'button4', 'button5', 'button6', 'powerOn', 'splashScreen', 'mainContainer', 'debugPanel', 'frameCanvas'];
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

    // Wait for configs to fully load and defaults to be set
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
 
    
    // Set aria and text for all relevant elements deriving from ID (with translation cache)
    const staticElements = [
      { el: DOM.splashScreen, baseKey: 'splashScreen', setText: false, setAria: false }, // Non-interactive, no aria/text
      { el: DOM.mainContainer, baseKey: 'mainContainer', setText: false, setAria: false },
      { el: DOM.powerOn, baseKey: 'powerOn', setText: true, setAria: true },
      { el: DOM.videoFeed, baseKey: 'videoFeed', setText: false, setAria: true },
      { el: DOM.frameCanvas, baseKey: 'frameCanvas', setText: false, setAria: false }, // Hidden, no aria
      { el: DOM.debugPanel, baseKey: 'debugPanel', setText: false, setAria: true },
      { el: DOM.button1, baseKey: 'button1', setText: true, setAria: true },
      { el: DOM.button2, baseKey: 'button2', setText: true, setAria: true },
      { el: DOM.button3, baseKey: 'button3', setText: true, setAria: true },
      { el: DOM.button4, baseKey: 'button4', setText: true, setAria: true },
      { el: DOM.button5, baseKey: 'button5', setText: true, setAria: true },
      { el: DOM.button6, baseKey: 'button6', setText: true, setAria: true },
    ];
    const setupErrors = [];
    for (const { el, baseKey, setText: shouldSetText, setAria } of staticElements) {
      if (!el) continue;  // Validation already threw; no need for warn here
      try {
        if (setAria) {
          const ariaText = await getTextCached(`${baseKey}.aria`, {});
          el.setAttribute('aria-label', ariaText);
          announceMessage(ariaText); // Announce if needed
        }
        if (shouldSetText) {
          const text = await getTextCached(`${baseKey}.text`, {});
          el.textContent = text;
          announceMessage(text);
          speakText(text); // Speak if TTS enabled
        }
      } catch (textErr) {
        setupErrors.push({ baseKey, message: textErr.message });
        // Continue with best-effort: attempt localized fallbacks, then raw key
        if (setAria) {
          const fallbackAria = await getTextCached(`${baseKey}.aria`, {}).catch(() => baseKey);
          el.setAttribute('aria-label', fallbackAria);
          announceMessage(fallbackAria);
        }
        if (shouldSetText) {
          const fallbackText = await getTextCached(`${baseKey}.text`, {}).catch(() => baseKey);
          el.textContent = fallbackText;
          announceMessage(fallbackText);
          speakText(fallbackText);
        }
      }
    }
    if (setupErrors.length > 0) {
      structuredLog('WARN', 'UI setup had partial failures', { errors: setupErrors });
    }

  setupUIController({ DOM });

    // --- Headless engine: instantiate and wire a thin UI input mapper ---
    const engine = createEngine();
    try {
      // Expose engine.dispatch via shared context for legacy modules that call getDispatchEvent()
      try { setDispatchEvent(engine.dispatch); } catch (e) {}
      setupInputMapper(DOM, engine);
      // UI renderer subscribes to engine state and updates DOM presentation
      try { setupUIRenderer(DOM, engine); } catch (e) { structuredLog('WARN', 'setupUIRenderer failed', { error: e?.message || String(e) }); }
      try { setupUIEffectsHandler(engine, DOM); } catch (e) { structuredLog('WARN', 'setupUIEffectsHandler failed', { error: e?.message || String(e) }); }
    } catch (e) {
      structuredLog('WARN', 'setupInputMapper failed', { error: e?.message || String(e) });
    }

  // Engine owns state notifications and UI rendering; no bridge to legacy dispatcher required.
  // engine.onStateChange subscribers (UI renderer) will update DOM as needed.

    // --- Audio manager and gated startup (user gesture required) ---
    // Create a shared AudioManager and expose it on the DOM for other modules.
  const audioManager = new AudioManager();
  DOM.audioManager = audioManager;
  // Let the audio-processor bind to the shared manager so it receives events
  try { bindAudioProcessor(audioManager); } catch (e) { console.warn('bindAudioProcessor failed', e); }

    // Power-on button: a single, clear user gesture to unlock audio and show main UI.
    if (DOM.powerOn) {
      DOM.powerOn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        // Disable while attempting to initialize to avoid duplicate gestures
        DOM.powerOn.disabled = true;
        const origLabel = DOM.powerOn.textContent;
        try {
          // Show a localized "initializing" label if available
          try {
            const initLabel = await getTextCached('powerOn.initializing', {});
            if (initLabel) DOM.powerOn.textContent = initLabel;
          } catch (e) { /* best-effort */ }

          // Attempt to unlock audio within the user gesture
          const unlocked = await audioManager.unlockAudio(ev);
          if (!unlocked) {
            // Keep splash visible; inform user and allow retry
            const msg = await getTextCached('audio.unavailable', {}).catch(() => 'Audio unavailable. Tap to try again.');
            announceMessage(msg);
            try { trackFeatureUse('power-on', { success: false }); } catch (e) {}
            DOM.powerOn.disabled = false;
            DOM.powerOn.textContent = origLabel;
            return;
          }

          // Initialize audio graph and processor now that we have user gesture
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

          // All good — reveal main UI
          if (DOM.splashScreen) DOM.splashScreen.style.display = 'none';
          if (DOM.mainContainer) DOM.mainContainer.style.display = '';
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

    // --- Video -> Canvas sizing and frame capture helper ---
    // Ensure the hidden canvas matches the incoming video stream size so
    // frame processing (drawImage, pixel reads, ML, etc.) works and does
    // not operate on a 0x0 surface.
    (function setupFrameCapture() {
      const video = DOM.videoFeed;
      const canvas = DOM.frameCanvas;
      if (!video || !canvas) return; // defensive

      let frameLoopId = null;
      let running = false;

      function resizeCanvasToVideo() {
        // Use natural video dimensions when available, otherwise use sensible defaults
        const w = video.videoWidth || 640;
        const h = video.videoHeight || 480;
        if (canvas.width !== w || canvas.height !== h) {
          canvas.width = w;
          canvas.height = h;
        }
        canvas.style.display = 'none'; // keep visually hidden but usable
        canvas.setAttribute('aria-hidden', 'true');
      }

      function startLoop() {
        if (running) return;
        try {
          resizeCanvasToVideo();
          const ctx = canvas.getContext('2d');
          running = true;
          (function loop() {
            if (!running) return;
            try {
              if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0) {
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                // Non-blocking: let the dedicated frame-processor run and
                // notify other modules via the dispatcher when ready.
                try {
                  if (DOM.scheduleProcessFrame && typeof DOM.scheduleProcessFrame === 'function') {
                    // fire-and-forget scheduling; the scheduler will dispatch
                    // processFrame events when a result is ready.
                    DOM.scheduleProcessFrame().catch(err => {
                      addSessionError({ message: 'scheduleProcessFrame-failed', error: err?.message || String(err) });
                    });
                  }
                } catch (e) {
                  addSessionError({ message: 'frame-callback-failed', error: e?.message || String(e) });
                }
              }
            } catch (e) {
              // Add to session errors for health monitoring but don't crash the loop
              addSessionError({ message: 'frame-draw-error', error: e?.message || String(e) });
            }
            frameLoopId = requestAnimationFrame(loop);
          })();
        } catch (e) {
          addSessionError({ message: 'start-frame-loop-failed', error: e?.message || String(e) });
        }
      }

      function stopLoop() {
        running = false;
        if (frameLoopId != null) {
          cancelAnimationFrame(frameLoopId);
          frameLoopId = null;
        }
      }

      // When metadata is available, ensure the canvas is sized correctly
      video.addEventListener('loadedmetadata', () => {
        try { resizeCanvasToVideo(); } catch (e) { addSessionError({ message: 'resize-on-metadata-failed', error: e?.message || String(e) }); }
      });

      // Start drawing when the video plays; stop when paused or ended
      video.addEventListener('play', startLoop);
      video.addEventListener('playing', startLoop);
      video.addEventListener('pause', stopLoop);
      video.addEventListener('ended', stopLoop);

  // Expose simple controls on DOM for other modules (safe no-op if missing)
  // Named explicitly for camera/frame capture to avoid confusion with network streams
  DOM._startCameraFrameCapture = startLoop;
  DOM._stopCameraFrameCapture = stopLoop;
    })();
    
  // Note: frame processing and scheduling has been migrated into the
  // headless engine (core/engine.js) as `startProcessing` / `stopProcessing`
  // and the `processFrame` command. This keeps orchestration inside the
  // engine; main.js no longer owns scheduling logic. The frame-processor
  // implementation continues to live in `video/frame-processor.js`.
  // For backward compatibility, keep a reference to the low-level frame
  // processor implementation on settings if other helpers need it.
  settings._frameProcessor = processFrameWithState;

  // translatePage moved to utils.utils and reused here

  // Helper: get a user-friendly language name for a language id
  function languageNameFor(langId) {
    try {
      // Use Intl.DisplayNames when available to localize names
      if (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function') {
        // Ask for language display name in the current language if possible
        const display = new Intl.DisplayNames([settings.language || 'en-US'], { type: 'language' });
        // Intl expects BCP47 language, prefer the primary subtag
        const tag = langId.split('-')[0];
        const name = display.of(tag);
        if (name) return name;
      }
    } catch (e) {
      // ignore and fallback to id
    }
    return langId;
  }

  // Language rendering and cycling have been migrated into the headless
  // engine (`core/engine.js`) and the UI renderer/mapper
  // (`ui/ui-input-mapper.js` and `ui/ui-renderer.js`).

  // Legacy inline DOM handler for language has been migrated to the headless
  // engine + UI mapper. The renderer will update labels automatically.
  // (See web/ui/ui-input-mapper.js and web/ui/ui-renderer.js)

    // Console overrides moved here to break circular dependency
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
  // send to ingest worker
  trackFeatureUse(level, { message, ...data });
      } catch (err) {
        threw = true;
        // Restore temp overrides immediately if structuredLog throws
        console.log = tempLog;
        console.warn = tempWarn;
        console.error = tempError;
        // Optionally log the error using originalConsole
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

  // Force initial UI update for dynamic content
  try { if (engine && typeof engine.dispatch === 'function') engine.dispatch('updateUI', { settingsMode: false, streamActive: false, micActive: false }); } catch (e) {}
    structuredLog('INFO', 'init: UI setup complete');
    // Start health checker (aggregates session errors and reports via ingest)
    const stopHealthChecker = startHealthChecker({
      reportFn: trackFeatureUse,
      intervalMs: HEALTH_CHECK_INTERVAL_MS,
      errorThreshold: ERROR_THRESHOLD,
      timeframeMs: ERROR_TIMEFRAME_MS
    });
    
  // Camera control and Auto-FPS behavior migrated to headless engine + UI mapper.
  // Use `engine.dispatch('startCamera'|'stopCamera'|'toggleCamera', { videoEl: DOM.videoFeed })`
  // and `engine.dispatch('toggleAutoFps')`. The renderer updates button labels.
  } catch (err) {
    // --- EMERGENCY INGEST BEACON ---
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
    } else if (err.data?.language === null) {
      specificMessage = 'Language configuration failed to initialize';
    } // Add more categories as needed
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

// Adds uncaught error handler for global contexts
window.onerror = function (message, source, lineno, colno, error) {
  const errorPayload = { message, source, lineno, colno, stack: error ? error.stack : 'N/A' };
  structuredLog('ERROR', 'Uncaught global error', errorPayload);
  // send error ingest
  trackFeatureUse('globalError', errorPayload);
  addSessionError(errorPayload); // <-- Add to buffer for health monitoring
  if (settings?.debugLogging ?? true) {  // Safe check; default to true if settings null (pre-init)
    console.error(message); // Allow bubbling in debug mode
    return false; // Let browser handle
  }
  return true; // Suppress in production
};

init();

// Track session end and duration on pagehide
window.addEventListener('pagehide', () => {
  trackFeatureUse('session-end', { duration: Math.round(performance.now() / 1000) });
});

/**
 * A simple, globally-accessible function to test the ingest pipeline.
 * Call this from the browser's developer console to send a test event.
 * Usage: > ping()
 */
// Attach the imported pingIngest to the window for console testing.
window.pingIngest = pingIngest;

console.log('Ingest ping function is available. Type `pingIngest()` in the console to test.');
