// File: web/main.js
import { setupUIController } from './ui/ui-controller.js';
import { createEventDispatcher } from './core/dispatcher.js';
import { settings, setAutoFpsBenchmark } from './core/state.js';
import { structuredLog } from './utils/logging.js';
import { setDOM } from './core/context.js';
import { trackFeatureUse } from './core/telemetry.js';
import { getText, initializeLanguageIfNeeded, speakText, announceMessage } from './utils/utils.js';
import { initializeAudio } from './audio/audio-processor.js';
import AudioManager from './audio/audio-manager.js';
import { bindAudioManager as bindAudioProcessor } from './audio/audio-processor.js';
import { processFrameWithState } from './video/frame-processor.js';
import { getPreferredIntervalMs } from './utils/performance.js';

// --- SESSION HEALTH MONITORING STATE ---
const sessionErrors = [];
const HEALTH_CHECK_INTERVAL_MS = 60 * 1000; // Check every 60 seconds
const ERROR_THRESHOLD = 5; // Alert if more than 5 errors
const ERROR_TIMEFRAME_MS = 2 * 60 * 1000; // Look at last 2 minutes
const MAX_BUFFER_SIZE = 100; // Prevent memory leaks

function addSessionError(errorPayload) {
  sessionErrors.push({
    ...errorPayload,
    timestamp: Date.now()
  });
  // Cap buffer size
  if (sessionErrors.length > MAX_BUFFER_SIZE) sessionErrors.shift();
}

// --- HEALTH CHECKER ---
setInterval(() => {
  const now = Date.now();
  // Only consider errors from the last ERROR_TIMEFRAME_MS
  const recentErrors = sessionErrors.filter(e => now - e.timestamp < ERROR_TIMEFRAME_MS);

  // Count repeated error messages
  const errorCounts = {};
  for (const err of recentErrors) {
    errorCounts[err.message] = (errorCounts[err.message] || 0) + 1;
  }
  const repeated = Object.entries(errorCounts).filter(([msg, count]) => count > 2);

  if (recentErrors.length > ERROR_THRESHOLD || repeated.length > 0) {
    trackFeatureUse('session-health-degraded', {
      errorCount: recentErrors.length,
      repeatedErrors: repeated,
      sample: recentErrors.slice(-5).map(e => e.message),
      timeframeMinutes: ERROR_TIMEFRAME_MS / (60 * 1000),
      lastErrorMessage: recentErrors[recentErrors.length - 1]?.message
    });
    // Clear buffer after reporting
    sessionErrors.length = 0;
  }
}, HEALTH_CHECK_INTERVAL_MS);
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

    // Ensure language is initialized before translating
    initializeLanguageIfNeeded();
 
    
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
        // Continue with best-effort: set fallback
        if (setAria) {
          el.setAttribute('aria-label', baseKey);
          announceMessage(baseKey);
        }
        if (shouldSetText) {
          el.textContent = baseKey;
          announceMessage(baseKey);
          speakText(baseKey);
        }
      }
    }
    if (setupErrors.length > 0) {
      structuredLog('WARN', 'UI setup had partial failures', { errors: setupErrors });
    }

    const { dispatchEvent } = await createEventDispatcher(DOM);
    setupUIController({ dispatchEvent, DOM });

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
        try {
          // Visual transition: hide splash, show main container
          if (DOM.splashScreen) DOM.splashScreen.style.display = 'none';
          if (DOM.mainContainer) DOM.mainContainer.style.display = '';

          // Attempt to unlock audio in the context of the user gesture.
          const unlocked = await audioManager.unlockAudio(ev);
          if (unlocked) {
            try {
              await audioManager.initialize();
              // Ensure audio-processor initializes with the manager's context
              try { await initializeAudio(audioManager.context); } catch(e){}
              await audioManager.resume();
            } catch (inner) {
              addSessionError({ message: 'audio-init-failed', error: inner?.message || String(inner) });
              structuredLog('ERROR', 'Audio initialization failed after unlock', { error: inner?.message || String(inner) });
              announceMessage('Audio initialization failed. You may need to tap again.');
            }
            structuredLog('INFO', 'Startup: audio unlocked and initialized');
            try { trackFeatureUse('power-on', { success: true }); } catch(e){}
          } else {
            announceMessage('Audio unavailable. Tap to try again.');
            try { trackFeatureUse('power-on', { success: false }); } catch(e){}
          }
          // Mark button pressed state for accessibility
          DOM.powerOn.setAttribute('aria-pressed', 'true');
        } catch (err) {
          addSessionError({ message: 'power-on-failed', error: err?.message || String(err) });
          structuredLog('ERROR', 'Power on handler failed', { error: err?.message || String(err) });
          announceMessage('Startup failed. Check console for details.');
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
    
    /**
     * Lightweight processFrame wrapper - keep DOM/canvas guards here and
     * delegate the heavy frame-mapping logic to `video/frame-processor.js`.
     * This keeps main.js focused on orchestration while the frame-processor
     * owns pixel-level analysis (Single Responsibility Principle).
     */
    async function processFrame() {
      const video = DOM.videoFeed;
      const canvas = DOM.frameCanvas;
      if (!video || !canvas) return null;
      if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
      const w = video.videoWidth || canvas.width;
      const h = video.videoHeight || canvas.height;
      if (w === 0 || h === 0) return null;
      const ctx = canvas.getContext('2d');
      try { ctx.drawImage(video, 0, 0, w, h); } catch (e) { return null; }
      const img = ctx.getImageData(0, 0, w, h);
      return processFrameWithState(img.data, w, h);
    }

    // Adaptive scheduler: combined rate-limit + single-run lock + one pending
    let _processingFrame = false;
    let _pendingFrame = false;
    let _lastFrameTs = 0;

    const DEFAULT_TARGET_FPS = 15;

    async function computeAutoInterval() {
      return computeAutoIntervalBenchmark(DOM.videoFeed, DOM.frameCanvas, processFrameWithState, DEFAULT_TARGET_FPS);
    }

    // Expose the frame processor so update-interval helper can call it when
    // running a DOM benchmark. This is a pragmatic bridge; the helper prefers
    // a direct function param but can fall back to this.
    settings._frameProcessor = processFrameWithState;

    async function getTargetIntervalMs() {
      const cfg = settings || {};
      if (cfg.autoFPS) return getPreferredIntervalMs();
      const targetFPS = Number(cfg.updateInterval) || DEFAULT_TARGET_FPS;
      return 1000 / targetFPS;
    }

    async function scheduleProcessFrame() {
      const now = Date.now();
      const MIN_INTERVAL_MS = await getTargetIntervalMs();

      if (_processingFrame) {
        _pendingFrame = true;
        return;
      }

      if (now - _lastFrameTs < MIN_INTERVAL_MS) {
        _pendingFrame = true;
        return;
      }

      _processingFrame = true;
      _lastFrameTs = now;

      try {
        const result = await processFrame();
        try {
          if (typeof dispatchEvent === 'function') dispatchEvent('processFrame', { payload: result || {} });
        } catch (e) {
          addSessionError({ message: 'dispatch-after-schedule-failed', error: e?.message || String(e) });
        }
      } catch (err) {
        addSessionError({ message: 'scheduleProcessFrame-failed', error: err?.message || String(err) });
      } finally {
        _processingFrame = false;
        if (_pendingFrame) {
          _pendingFrame = false;
          setTimeout(() => { try { scheduleProcessFrame(); } catch (e) { /* ignore */ } }, 0);
        }
      }
    }

    // Expose both for compatibility and the preferred scheduler
    DOM.processFrame = processFrame;
    window.processFrame = processFrame;
    DOM.scheduleProcessFrame = scheduleProcessFrame;
    window.scheduleProcessFrame = scheduleProcessFrame;
    const TELEMETRY_ENDPOINT = 'https://acoustsee-analytics.mamware.workers.dev'; 

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
        // send to telemetry worker
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
    dispatchEvent('updateUI', { settingsMode: false, streamActive: false, micActive: false });
    structuredLog('INFO', 'init: UI setup complete');
    
    // --- Camera toggle helper bound to overlay button (#button1) ---
    (function setupCameraToggle() {
      const btn = DOM.button1;
      const video = DOM.videoFeed;
      let cameraStream = null;

      if (!btn || !video) return;

      async function startCamera() {
        try {
          // Ask for camera permission and prefer environment-facing if available
          const constraints = { video: { facingMode: 'environment' }, audio: false };
          const stream = await navigator.mediaDevices.getUserMedia(constraints);
          cameraStream = stream;
          video.srcObject = stream;
          // Play the video element if not auto-playing
          try { await video.play(); } catch (e) { /* play may be blocked until user interacts */ }
          btn.setAttribute('aria-pressed', 'true');
          const stopLabel = btn.querySelector('.button-text');
          if (stopLabel) stopLabel.textContent = 'Stop';
          // Start frame capture loop if helper provided
          DOM._startCameraFrameCapture && DOM._startCameraFrameCapture();
          trackFeatureUse('camera-start', { timestamp: Date.now() });

          // Run the auto-FPS runtime benchmark once per session after camera start.
          // computeAutoInterval() persists the benchmark via setAutoFpsBenchmark.
          (async () => {
            try {
              if (settings.autoFPS && !DOM._autoFpsBenchRun) {
                DOM._autoFpsBenchRun = true;
                const intervalMs = await computeAutoInterval();
                if (intervalMs && Number.isFinite(intervalMs)) {
                  const fps = Math.max(8, Math.min(30, Math.round(1000 / intervalMs)));
                  settings.updateInterval = fps; // store FPS as the updateInterval
                  structuredLog('INFO', 'auto-fps-benchmark-complete', { intervalMs, fps });
                  try { if (typeof dispatchEvent === 'function') dispatchEvent('updateUI', { autoFpsBenchmark: settings.autoFpsBenchmark }); } catch(e){}
                }
              }
            } catch (e) {
              addSessionError({ message: 'auto-fps-benchmark-failed', error: e?.message || String(e) });
            }
          })();
        } catch (e) {
          addSessionError({ message: 'start-camera-failed', error: e?.message || String(e) });
          structuredLog('ERROR', 'Failed to start camera', { error: e?.message || String(e) });
          announceMessage('Unable to access camera.');
        }
      }

      function stopCamera() {
        try {
          if (cameraStream) {
            cameraStream.getTracks().forEach(t => t.stop());
            cameraStream = null;
          }
          video.pause();
          video.srcObject = null;
          btn.setAttribute('aria-pressed', 'false');
          const startLabel = btn.querySelector('.button-text');
          if (startLabel) startLabel.textContent = 'Start';
          DOM._stopCameraFrameCapture && DOM._stopCameraFrameCapture();
          trackFeatureUse('camera-stop', { timestamp: Date.now() });
        } catch (e) {
          addSessionError({ message: 'stop-camera-failed', error: e?.message || String(e) });
          structuredLog('WARN', 'Failed to fully stop camera', { error: e?.message || String(e) });
        }
      }

      btn.addEventListener('click', async (ev) => {
        ev.preventDefault();
        const pressed = btn.getAttribute('aria-pressed') === 'true';
        if (pressed) {
          stopCamera();
        } else {
          await startCamera();
        }
      });
    })();
  } catch (err) {
    // --- EMERGENCY TELEMETRY BEACON ---
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
      announceMessage(`Initialization failed: ${specificMessage}. Check console for details.`);
    } catch (ttsErr) {
      originalConsole.error('TTS error:', ttsErr.message);
      announceMessage(`Initialization failed: ${specificMessage}. Check console for details.`);
    }
  }
}

// --- NEW: Emergency Telemetry Beacon ---
// This function has ZERO internal dependencies. It can run even if everything else is broken.
function emergencyTrack(eventName, errorPayload = {}) {
   const emergencyEndpoint = 'https://acoustsee-telemetry.mamware.workers.dev';
  try {
    // navigator.sendBeacon is the ideal tool for this. It's designed to be
    // non-blocking and likely to succeed even when a page is crashing or closing.
    if (navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify({
        event: eventName,
        payload: errorPayload,
        timestamp: Date.now(),
        isEmergency: true
      })], { type: 'application/json' });
      navigator.sendBeacon(emergencyEndpoint, blob);
    } else {
      // Fallback to a simple, non-blocking fetch for older browsers
      fetch(emergencyEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true, // Also helps ensure the request is sent
        body: JSON.stringify({
          event: eventName,
          payload: errorPayload,
          timestamp: Date.now(),
          isEmergency: true
        })
      });
    }
  } catch (e) {
    // If the emergency beacon itself fails, there's nothing more we can do.
    // We intentionally do not log this failure to avoid any risk of a recursive loop.
  }
}

// Adds uncaught error handler for global contexts
window.onerror = function (message, source, lineno, colno, error) {
  const errorPayload = { message, source, lineno, colno, stack: error ? error.stack : 'N/A' };
  structuredLog('ERROR', 'Uncaught global error', errorPayload);
  // send error telemetry
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
 * A simple, globally-accessible function to test the telemetry pipeline.
 * Call this from the browser's developer console to send a test event.
 * Usage: > pingTelemetry()
 */
function pingTelemetry() {
  const endpoint = 'https://acoustsee-telemetry.mamware.workers.dev'; // Use your new endpoint name
  const testPayload = {
    event: 'telemetry-ping',
    payload: {
      message: 'Ping from client at ' + new Date().toISOString(),
      randomId: Math.random().toString(36).substring(7)
    },
    timestamp: Date.now()
  };

  console.log('Pinging telemetry endpoint:', endpoint);
  console.log('Payload:', testPayload);

  fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(testPayload)
  })
  .then(response => {
    if (response.ok) {
      console.log('%cTelemetry Ping Succeeded!', 'color: green; font-weight: bold;');
      console.log('Status:', response.status);
      return response.text(); // Use .text() in case the response body is empty
    } else {
      console.error('%cTelemetry Ping Failed!', 'color: red; font-weight: bold;');
      console.error('Status:', response.status);
      return response.text().then(text => Promise.reject(new Error(text)));
    }
  })
  .then(responseText => {
    if (responseText) {
      console.log('Response Body:', responseText);
    }
  })
  .catch(error => {
    console.error('Fetch Error:', error);
    console.error('This could be a CORS issue, a network problem, or the endpoint is down.');
  });
}

// Attach the function to the window object to make it globally accessible from the console.
window.pingTelemetry = pingTelemetry;

console.log('Telemetry ping function is available. Type `pingTelemetry()` in the console to test.');
