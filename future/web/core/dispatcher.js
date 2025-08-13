// File: web/core/dispatcher.js
/* @ts-nocheck */
import { settings, setAudioInterval, setStream, setMicStream, getLogs } from './state.js';
import { TTS_COOLDOWN_MS } from './constants.js';
import { getText, clearTranslationsCache, speakText } from '../utils/utils.js';
import { withErrorBoundary, debounce, rafThrottle } from '../utils/async.js';
import { initializeMicAudio, resizeOscillatorPool } from '../audio/audio-processor.js';
import { processFrameWithState, cleanupFrameProcessor } from '../video/frame-processor.js';
import { structuredLog } from '../utils/logging.js';
import { audioHandlers, toggleAudio } from './handlers/audio-handlers.js';
import { gridHandlers } from './handlers/grid-handlers.js';
import { saveSettings, loadSettings } from './handlers/settings-handlers.js';
import { startStop, toggleVideoSource } from './handlers/video-handlers.js';
import { toggleLanguage, updateFrameInterval } from './handlers/ui-handlers.js';
import { toggleDebug, emailDebug } from './handlers/debug-handlers.js';

// Reusable offscreen canvas for frame processing
let offscreenCanvas = null;
let offscreenCtx = null;

// Clear offscreen canvas on window resize
window.addEventListener('resize', debounce(() => {
  offscreenCanvas = null;
  offscreenCtx = null;
}, 200));

let _dispatcherFn = null;

export function setDispatcher(fn) {
  _dispatcherFn = fn;
}

export function dispatchEvent(eventName, payload) {
  if (_dispatcherFn) {
    structuredLog('DEBUG', `dispatchEvent: ${eventName}`, { payload });
    return _dispatcherFn(eventName, payload);
  } else {
    structuredLog('ERROR', 'dispatchEvent called before initialization', { eventName, payload });
  }
}

let lastTTSTime = 0;
const ttsCooldown = TTS_COOLDOWN_MS;
let fpsSamplerInterval = null;
let frameCount = 0;

export async function createEventDispatcher(domElements) {
  structuredLog('INFO', 'createEventDispatcher: Initializing event dispatcher', { domExists: !!domElements });
  if (!domElements) {
    structuredLog('ERROR', 'domElements is undefined in createEventDispatcher');
    return { dispatchEvent: () => structuredLog('ERROR', 'dispatchEvent not initialized due to undefined domElements') };
  }

  structuredLog('DEBUG', 'DOM elements received', {
    hasButton1: !!domElements.button1,
    hasButton2: !!domElements.button2,
    hasButton3: !!domElements.button3,
    hasButton4: !!domElements.button4,
    hasButton5: !!domElements.button5,
    hasButton6: !!domElements.button6,
    hasVideoFeed: !!domElements.videoFeed,
  });
  
  // Use the centrally loaded configurations from the settings object.
  const { availableGrids, availableEngines, availableLanguages } = settings;

  const browserInfo = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    parsedBrowserVersion: (() => {
      const browserVersionRegex = /Chrome\/([0-9.]+)|Firefox\/([0-9.]+)|Safari\/([0-9.]+)|Edg\/([0-9.]+)/;
      const m = navigator.userAgent.match(browserVersionRegex);
      return (m && (m[1] || m[2] || m[3] || m[4])) || 'Unknown';
    })(),
    hardwareConcurrency: navigator.hardwareConcurrency || 'N/A',
    deviceMemory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A',
    screen: `${screen.width}x${screen.height}`,
    audioContextState: typeof audioContext !== 'undefined' ? audioContext.state : 'Not initialized',
    streamActive: !!settings.stream,
    micActive: !!settings.micStream,
    currentFPSInterval: settings.updateInterval
  };
  structuredLog('INFO', 'Enhanced browser and app debug info', browserInfo);

  if (settings.debugLogging) {
    fpsSamplerInterval = setInterval(() => {
      if (settings.stream) {
        const avgFPS = frameCount / 10;
        structuredLog('DEBUG', 'Average FPS sample', { avgFPS, overSeconds: 10 });
        frameCount = 0;
      }
    }, 10000);
  }

  // Debounced version of updateUI to prevent rapid consecutive UI updates
  const debouncedUpdateUI = debounce(async ({ settingsMode, streamActive, micActive }) => {
    try {
      if (!domElements.button1 || !domElements.button2 || !domElements.button3 || !domElements.button4 || !domElements.button5 || !domElements.button6) {
        const missing = [
          !domElements.button1 && 'button1',
          !domElements.button2 && 'button2',
          !domElements.button3 && 'button3',
          !domElements.button4 && 'button4',
          !domElements.button5 && 'button5',
          !domElements.button6 && 'button6'
        ].filter(Boolean);
        structuredLog('ERROR', 'Missing critical DOM elements for UI update', { missing });
        dispatchEvent('logError', { message: 'Missing critical DOM elements for UI update' });
        return;
      }

      const currentTime = performance.now();
      const grid = availableGrids.find(g => g.id === settings.gridType);
      const engine = availableEngines.find(e => e.id === settings.synthesisEngine);
      const language = availableLanguages.find(l => l.id === settings.language);

      const button1Text = settingsMode
        ? await getText('button1.settings.text', { gridName: grid?.id || 'Grid' }, 'text')
        : await getText(`button1.normal.${streamActive ? 'stop' : 'start'}.text`, {}, 'text');
      const button1Aria = settingsMode
        ? await getText('button1.settings.aria', { gridType: settings.gridType }, 'aria')
        : await getText(`button1.normal.${streamActive ? 'stop' : 'start'}.aria`, {}, 'aria');
      if (settings.ttsEnabled) {
        const ttsMsg = await getText(
          `button1.tts.${settingsMode ? 'gridSelect' : 'startStop'}`,
          { state: settingsMode ? settings.gridType : (streamActive ? 'stopping' : 'starting') }
        );
        speakText(ttsMsg);
      }
      if (domElements.button1) {
        domElements.button1.textContent = button1Text;
        domElements.button1.setAttribute('aria-label', button1Aria);
      }
    } catch (err) {
      structuredLog('ERROR', 'updateUI error', { message: err.message, stack: err.stack });
      handlers.logError({ message: `UI update error: ${err.message}` });
    }
    lastTTSTime = performance.now();
    structuredLog('DEBUG', 'updateUI: UI updated', { settingsMode, streamActive, micActive });
  }, 100);

  const handlers = {
    updateUI: debouncedUpdateUI,
    // --- Performance: Reusable offscreen canvas for frame processing ---
    processFrame: (() => {
      return async () => {
        try {
          // Create or resize offscreen canvas if needed
          if (!offscreenCanvas ||
              offscreenCanvas.width !== DOM.videoFeed.videoWidth ||
              offscreenCanvas.height !== DOM.videoFeed.videoHeight) {
            offscreenCanvas = document.createElement('canvas');
            offscreenCanvas.width = DOM.videoFeed.videoWidth;
            offscreenCanvas.height = DOM.videoFeed.videoHeight;
            offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
            structuredLog('INFO', 'processFrame: Created/Resized offscreen canvas', {
              width: offscreenCanvas.width,
              height: offscreenCanvas.height
            });
          }
          // Draw current video frame into offscreen canvas
          offscreenCtx.drawImage(DOM.videoFeed, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
          // Read pixel data with error handling
          let frameData;
          try {
            frameData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height).data;
          } catch (err) {
            structuredLog('ERROR', 'processFrame getImageData failed', { message: err.message });
            // Fallback to empty frame buffer
            frameData = new Uint8ClampedArray(offscreenCanvas.width * offscreenCanvas.height * 4);
          }
          const { data: result, error } = await withErrorBoundary(
            processFrameWithState,
            frameData,
            DOM.videoFeed.videoWidth,
            DOM.videoFeed.videoHeight
          );
          if (error) {
            structuredLog('ERROR', 'processFrame handler error', { message: error.message, stack: error.stack });
            handlers.logError({ message: `Frame processing handler error: ${error.message}` });
            return;
          }
          if (!result) {
            structuredLog('WARN', 'processFrame: No result returned', {
              width: DOM.videoFeed?.videoWidth,
              height: DOM.videoFeed?.videoHeight
            });
            return;
          }
          structuredLog('DEBUG', 'processFrame result', {
            notesCount: result.notes?.length || 0,
            avgIntensity: result.avgIntensity
          });
          frameCount++;
        } catch (err) {
          structuredLog('ERROR', 'processFrame error', { message: err.message, stack: err.stack });
          handlers.logError({ message: `Frame processing error: ${err.message}` });
        }
      };
    })(),
 
    startStop: startStop,
    toggleVideoSource: toggleVideoSource,
    toggleAudio: toggleAudio,
    toggleLanguage: toggleLanguage,
    updateFrameInterval: updateFrameInterval,
    toggleDebug: toggleDebug,
    saveSettings: saveSettings,
    loadSettings: loadSettings,
    emailDebug: emailDebug,

    logError: ({ message }) => {
      structuredLog('ERROR', 'Error logged', { message });
    }
  };

  setDispatcher((eventName, payload = {}) => {
    if (handlers[eventName]) {
      try {
        structuredLog('DEBUG', `Dispatching event: ${eventName}`, { payload });
        handlers[eventName](payload);
      } catch (err) {
        structuredLog('ERROR', `Error in handler ${eventName}`, { message: err.message, stack: err.stack });
        handlers.logError({ message: `Handler ${eventName} error: ${err.message}` });
      }
    } else {
      structuredLog('ERROR', `No handler found for event: ${eventName}`);
      handlers.logError({ message: `No handler for event: ${eventName}` });
    }
  });

  structuredLog('INFO', 'createEventDispatcher: Dispatcher initialized');
  return { dispatchEvent };
}