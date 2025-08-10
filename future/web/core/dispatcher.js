// File: web/core/dispatcher.js
/* @ts-nocheck */
import { settings, setAudioInterval, setStream, setMicStream, getLogs } from './state.js';
import { TTS_COOLDOWN_MS } from './constants.js';
import { getText, clearTranslationsCache } from '../utils/utils.js';
import { withErrorBoundary, debounce, rafThrottle } from '../utils/async.js';
import { initializeMicAudio } from '../audio/audio-processor.js';
import { processFrameWithState, cleanupFrameProcessor } from '../video/frame-processor.js';
import { structuredLog } from '../utils/logging.js';

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
      if (currentTime - lastTTSTime >= ttsCooldown) {
        await getText(`button1.tts.${settingsMode ? 'gridSelect' : 'startStop'}`, {
          state: settingsMode ? settings.gridType : (streamActive ? 'stopping' : 'starting')
        });
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
      let frameCanvas = null;
      let frameCtx = null;
      let lastWidth = 0;
      let lastHeight = 0;
      // Debounced resize to handle orientation changes without jank
      const debouncedResize = debounce((newWidth, newHeight) => {
        frameCanvas.width = newWidth;
        frameCanvas.height = newHeight;
        lastWidth = newWidth;
        lastHeight = newHeight;
      }, 100);
      return async () => {
        try {
          if (!frameCanvas) {
            frameCanvas = document.createElement('canvas');
            frameCtx = frameCanvas.getContext('2d');
            domElements.frameCanvas = frameCanvas; // store for debugging
            // initial size
              const initW = DOM.videoFeed.videoWidth;
              const initH = DOM.videoFeed.videoHeight;
              frameCanvas.width = initW;
              frameCanvas.height = initH;
              lastWidth = initW;
              lastHeight = initH;
          }
          // Resize if video dimensions change (debounced)
          const curW = DOM.videoFeed.videoWidth;
          const curH = DOM.videoFeed.videoHeight;
          if (curW !== lastWidth || curH !== lastHeight) {
            debouncedResize(curW, curH);
          }
          frameCtx.drawImage(DOM.videoFeed, 0, 0, frameCanvas.width, frameCanvas.height);
          const frameData = frameCtx.getImageData(0, 0, frameCanvas.width, frameCanvas.height).data;
          const { data: result, error } = await withErrorBoundary(processFrameWithState, frameData, DOM.videoFeed.videoWidth, DOM.videoFeed.videoHeight);
          if (error) {
            structuredLog('ERROR', 'processFrame handler error', { message: error.message, stack: error.stack });
            handlers.logError({ message: `Frame processing handler error: ${error.message}` });
            return;
          }
          if (!result) {
            structuredLog('WARN', 'processFrame: No result returned', { width: DOM.videoFeed?.videoWidth, height: DOM.videoFeed?.videoHeight });
            return;
          }
          structuredLog('DEBUG', 'processFrame result', { notesCount: result.notes?.length || 0, avgIntensity: result.avgIntensity });
          frameCount++;
        } catch (err) {
          structuredLog('ERROR', 'processFrame error', { message: err.message, stack: err.stack });
          handlers.logError({ message: `Frame processing error: ${err.message}` });
        }
      };
    })(),

  startStop: async ({ settingsMode }) => {
      try {
        if (settingsMode) {
          const currentIndex = availableGrids.findIndex(g => g.id === settings.gridType);
          const nextIndex = (currentIndex + 1) % availableGrids.length;
          settings.gridType = availableGrids[nextIndex].id;
          await getText('button1.tts.gridSelect', { state: settings.gridType });
        } else {
          if (!settings.stream) {
            // first try user-facing video + no audio (audio toggled separately)
            let constraints = { video: { facingMode: 'user' }, audio: false };
            let stream;
            try {
              stream = await navigator.mediaDevices.getUserMedia(constraints);
            } catch (err) {
              structuredLog('WARN', 'getUserMedia(user) failed, retrying default video', { message: err.message });
              stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
            }
            DOM.videoFeed.srcObject = stream;
            await new Promise((resolve, reject) => {
              DOM.videoFeed.addEventListener('loadedmetadata', () => {
                if (DOM.videoFeed.videoWidth <= 0 || DOM.videoFeed.videoHeight <= 0) {
                  return reject(new Error('Invalid video dimensions after metadata'));
                }
                structuredLog('INFO', 'Video metadata loaded', { width: DOM.videoFeed.videoWidth, height: DOM.videoFeed.videoHeight });
                resolve();
              }, { once: true });
              DOM.videoFeed.addEventListener('error', reject, { once: true });
            });
            setStream(stream);
            // schedule frame processing
            const timerId = setInterval(() => dispatchEvent('processFrame'), settings.updateInterval);
            setAudioInterval(timerId);
            await getText('button1.tts.startStop', { state: 'starting' });
          } else {
            settings.stream.getVideoTracks().forEach(track => track.stop());
            setStream(null);
            await cleanupFrameProcessor();
            if (settings.micStream) {
              settings.micStream.getTracks().forEach(track => track.stop());
              setMicStream(null);
              initializeMicAudio(null);
            }
            clearInterval(settings.audioTimerId);
            setAudioInterval(null);
            if (fpsSamplerInterval) {
              clearInterval(fpsSamplerInterval);
              fpsSamplerInterval = null;
              structuredLog('INFO', 'FPS sampler cleared on stream stop');
            }
            await getText('button1.tts.startStop', { state: 'stopping' });
          }
          dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
        }
      } catch (err) {
        structuredLog('ERROR', 'startStop error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `Stream toggle error: ${err.message}` });
        await getText('button1.tts.cameraError');
      }
  },

  toggleAudio: async ({ settingsMode }) => {
      try {
        structuredLog('INFO', 'toggleAudio: Current mic state', { micActive: !!settings.micStream });
        if (settingsMode) {
          const currentIndex = availableEngines.findIndex(e => e.id === settings.synthesisEngine);
          const nextIndex = (currentIndex + 1) % availableEngines.length;
          settings.synthesisEngine = availableEngines[nextIndex].id;
          await getText('button2.tts.synthesisSelect', { state: settings.synthesisEngine });
        } else {
          if (!settings.micStream) {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            setMicStream(micStream);
            initializeMicAudio(micStream);
            await getText('button2.tts.micToggle', { state: 'turningOn' });
          } else {
            settings.micStream.getTracks().forEach(track => track.stop());
            setMicStream(null);
            initializeMicAudio(null);
            await getText('button2.tts.micToggle', { state: 'turningOff' });
          }
          dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
        }
      } catch (err) {
        structuredLog('ERROR', 'toggleAudio error', { message: err.message });
        handlers.logError({ message: `Mic toggle error: ${err.message}` });
        await getText('button2.tts.micError');
      }
    },

  toggleLanguage: async () => {
      try {
        const currentIndex = availableLanguages.findIndex(l => l.id === settings.language);
        const nextIndex = (currentIndex + 1) % availableLanguages.length;
        settings.language = availableLanguages[nextIndex].id;
        // Invalidate translation cache and cancel any ongoing speech
        clearTranslationsCache();
        if (window.speechSynthesis?.cancel) {
          window.speechSynthesis.cancel();
        }
        await getText('button3.tts.languageSelect', { state: settings.language });
        // Refresh UI elements for new language
        dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
      } catch (err) {
        structuredLog('ERROR', 'toggleLanguage error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `Language toggle error: ${err.message}` });
        await getText('button3.tts.languageError');
      }
    },

    toggleVideoSource: async () => {
      try {
        const oldStream = DOM.videoFeed?.srcObject;
        if (oldStream) {
          const currentVideoTrack = oldStream.getVideoTracks()[0];
          const currentFacingMode = currentVideoTrack.getSettings().facingMode || 'user';
          const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

          oldStream.getTracks().forEach(track => track.stop());
          await cleanupFrameProcessor();

          const newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: newFacingMode },
            audio: !!settings.micStream
          });
          // Set the new stream and ensure the video is playing
          DOM.videoFeed.srcObject = newStream;
          try {
            await DOM.videoFeed.play();
          } catch (playErr) {
            structuredLog('ERROR', 'toggleVideoSource: video play failed', { message: playErr.message, stack: playErr.stack });
          }
          // Wait for metadata to load with error handling and timeout
          const metadataPromise = new Promise((resolve, reject) => {
            DOM.videoFeed.onloadedmetadata = resolve;
            DOM.videoFeed.onerror = reject;
          });
          const timeoutPromise = new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Video metadata loading timeout')), 5000)
          );
          await Promise.race([metadataPromise, timeoutPromise]);
          // Validate dimensions to avoid race conditions in frame processing
          if (DOM.videoFeed.videoWidth <= 0 || DOM.videoFeed.videoHeight <= 0) {
            throw new Error('Invalid video dimensions after metadata');
          }
          structuredLog('INFO', 'Video metadata loaded', { width: DOM.videoFeed.videoWidth, height: DOM.videoFeed.videoHeight });
          setStream(newStream);

          if (settings.micStream) {
            setMicStream(newStream);
            initializeMicAudio(newStream);
          }

          await getText('button3.tts.videoSourceSelect', { state: newFacingMode });
        } else {
          structuredLog('WARN', 'toggleVideoSource: No video track available');
          await getText('button3.tts.videoSourceError');
        }
      } catch (err) {
        structuredLog('ERROR', 'toggleVideoSource error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `Video source toggle error: ${err.message}` });
        await getText('button3.tts.videoSourceError');
      }
    },

    updateFrameInterval: async ({ interval }) => {
      try {
        settings.updateInterval = interval;
        if (settings.stream) {
          clearInterval(settings.audioTimerId);
          setAudioInterval(setInterval(() => {
            dispatchEvent('processFrame');
          }, settings.updateInterval));
        }
        await getText('button4.tts.fpsBtn', {
          fps: settings.autoFPS ? 'auto' : Math.round(1000 / settings.updateInterval)
        });
        dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
      } catch (err) {
        structuredLog('ERROR', 'updateFrameInterval error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `Frame interval update error: ${err.message}` });
        await getText('button4.tts.fpsError');
      }
    },

    toggleGrid: async () => {
      try {
        const currentIndex = availableGrids.findIndex(g => g.id === settings.gridType);
        const nextIndex = (currentIndex + 1) % availableGrids.length;
        settings.gridType = availableGrids[nextIndex].id;
        await getText('button1.tts.gridSelect', { state: settings.gridType });
        dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
      } catch (err) {
        structuredLog('ERROR', 'toggleGrid error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `Grid toggle error: ${err.message}` });
        await getText('button1.tts.startStop', { state: 'error' });
      }
    },

    toggleDebug: async ({ show }) => {
      try {
        if (DOM.debug) {
          DOM.debug.style.display = show ? 'block' : 'none';
        }
        await getText('button6.tts.settingsToggle', { state: show ? 'on' : 'off' });
      } catch (err) {
        structuredLog('ERROR', 'toggleDebug error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `Debug toggle error: ${err.message}` });
      }
    },

    saveSettings: async () => {
      try {
        const settingsToSave = {
          gridType: settings.gridType,
          synthesisEngine: settings.synthesisEngine,
          language: settings.language,
          autoFPS: settings.autoFPS,
          updateInterval: settings.updateInterval,
          dayNightMode: settings.dayNightMode,
          ttsEnabled: settings.ttsEnabled,
          resetStateOnError: settings.resetStateOnError
        };
        localStorage.setItem('acoustsee-settings', JSON.stringify(settingsToSave));
        await getText('button4.tts.saveSettings');
      } catch (err) {
        structuredLog('ERROR', 'saveSettings error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `Save settings error: ${err.message}` });
        await getText('button4.tts.saveError');
      }
      dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
    },

    loadSettings: async () => {
      try {
        const savedSettings = localStorage.getItem('acoustsee-settings');
        if (savedSettings) {
          let parsedSettings;
          try {
            parsedSettings = JSON.parse(savedSettings);
          } catch (parseErr) {
            throw new Error(`Invalid JSON in localStorage: ${parseErr.message}`);
          }

          const expectedKeys = ['gridType', 'synthesisEngine', 'language', 'autoFPS', 'updateInterval', 'dayNightMode', 'ttsEnabled', 'resetStateOnError'];
          const expectedTypes = {
            gridType: 'string',
            synthesisEngine: 'string',
            language: 'string',
            autoFPS: 'boolean',
            updateInterval: 'number',
            dayNightMode: 'string',
            ttsEnabled: 'boolean',
            resetStateOnError: 'boolean'
          };

          expectedKeys.forEach(key => {
            if (Object.hasOwn(parsedSettings, key) && typeof parsedSettings[key] === expectedTypes[key]) {
              settings[key] = parsedSettings[key];
            } else if (Object.hasOwn(parsedSettings, key)) {
              structuredLog('WARN', 'Invalid type for setting during load', { key, receivedType: typeof parsedSettings[key] });
            }
          });

          const extraKeys = Object.keys(parsedSettings).filter(key => !expectedKeys.includes(key));
          if (extraKeys.length > 0) {
            structuredLog('WARN', 'Extra keys ignored in loaded settings (potential pollution)', { extraKeys });
          }

          await getText('button5.tts.loadSettings.loaded');
        } else {
          await getText('button5.tts.loadSettings.none');
        }
      } catch (err) {
        structuredLog('ERROR', 'Load settings error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `Load settings error: ${err.message}` });
        await getText('button5.tts.loadError');
      }
      dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
    },

    emailDebug: async () => {
      try {
        const logsText = await getLogs();
        if (!logsText || logsText.trim() === '') {
          structuredLog('WARN', 'emailDebug: No logs retrieved or empty from IndexedDB');
          alert('No logs available to download. Try generating some actions first.');
          await getText('button5.tts.emailDebug', { state: 'error' });
          return;
        }
        const blob = new Blob([logsText], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'acoustsee-debug-log.txt';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        await getText('button5.tts.emailDebug');
      } catch (err) {
        structuredLog('ERROR', 'emailDebug error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `Email debug error: ${err.message}` });
        alert('Failed to download logs: ' + err.message);
        await getText('button5.tts.emailDebug', { state: 'error' });
      }
    },

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