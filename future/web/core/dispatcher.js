// File: web/core/dispatcher.js
/* @ts-nocheck */
import { settings, setAudioInterval, setStream, setMicStream, getLogs } from './state.js';
import { TTS_COOLDOWN_MS } from './constants.js';
import { getText } from '../utils/utils.js';
import { withErrorBoundary } from '../utils/async.js';
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

  const handlers = {
    updateUI: async ({ settingsMode, streamActive, micActive }) => {
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
        } else {
          structuredLog('WARN', 'Element not found for text update', { text: button1Text });
        }

        const button2Text = settingsMode
          ? await getText('button2.settings.text', { engineName: engine?.id || 'Engine' }, 'text')
          : await getText(`button2.normal.${micActive ? 'off' : 'on'}.text`, {}, 'text');
        const button2Aria = settingsMode
          ? await getText('button2.settings.aria', { synthesisEngine: settings.synthesisEngine }, 'aria')
          : await getText(`button2.normal.${micActive ? 'off' : 'on'}.aria`, {}, 'aria');
        if (currentTime - lastTTSTime >= ttsCooldown) {
          await getText(`button2.tts.${settingsMode ? 'synthesisSelect' : 'micToggle'}`, {
            state: settingsMode ? settings.synthesisEngine : (micActive ? 'turningOff' : 'turningOn')
          });
        }
        if (DOM.button2) {
          DOM.button2.textContent = button2Text;
          DOM.button2.setAttribute('aria-label', button2Aria);
        } else {
          structuredLog('WARN', 'Element not found for text update', { text: button2Text });
        }

        const button3Text = settingsMode
          ? await getText('button3.settings.text', { languageName: language?.id || 'Language' }, 'text')
          : await getText('button3.normal.text', { languageName: language?.id || 'Language' }, 'text');
        const button3Aria = settingsMode
          ? await getText('button3.settings.aria', { language: settings.language }, 'aria')
          : await getText('button3.normal.aria', { language: settings.language }, 'aria');
        if (currentTime - lastTTSTime >= ttsCooldown) {
          await getText(`button3.tts.${settingsMode ? 'videoSourceSelect' : 'languageSelect'}`, {
            state: settingsMode ? (DOM.videoFeed?.srcObject?.getVideoTracks()[0]?.getSettings().facingMode || 'unknown') : settings.language
          });
        }
        if (DOM.button3) {
          DOM.button3.textContent = button3Text;
          DOM.button3.setAttribute('aria-label', button3Aria);
        } else {
          structuredLog('WARN', 'Element not found for text update', { text: button3Text });
        }

        const button4Text = settingsMode
          ? await getText('button4.settings.text', {}, 'text')
          : await getText(`button4.normal.${settings.autoFPS ? 'auto' : 'manual'}.text`, { fps: Math.round(1000 / settings.updateInterval) }, 'text');
        const button4Aria = settingsMode
          ? await getText('button4.settings.aria', {}, 'aria')
          : await getText('button4.normal.aria', {}, 'aria');
        if (currentTime - lastTTSTime >= ttsCooldown) {
          await getText(`button4.tts.${settingsMode ? 'saveSettings' : 'fpsBtn'}`, {
            state: settingsMode ? 'save' : (settings.autoFPS ? 'auto' : Math.round(1000 / settings.updateInterval))
          });
        }
        if (DOM.button4) {
          DOM.button4.textContent = button4Text;
          DOM.button4.setAttribute('aria-label', button4Aria);
        } else {
          structuredLog('WARN', 'Element not found for text update', { text: button4Text });
        }

        const button5Text = settingsMode
          ? await getText('button5.settings.text', {}, 'text')
          : await getText('button5.normal.text', {}, 'text');
        const button5Aria = settingsMode
          ? await getText('button5.settings.aria', {}, 'aria')
          : await getText('button5.normal.aria', {}, 'aria');
        if (currentTime - lastTTSTime >= ttsCooldown) {
          await getText(`button5.tts.${settingsMode ? 'loadSettings' : 'emailDebug'}`, {
            state: settingsMode ? 'load' : 'email'
          });
        }
        if (DOM.button5) {
          DOM.button5.textContent = button5Text;
          DOM.button5.setAttribute('aria-label', button5Aria);
        } else {
          structuredLog('WARN', 'Element not found for text update', { text: button5Text });
        }

        const button6Text = await getText(`button6.${settingsMode ? 'settings' : 'normal'}.text`, {}, 'text');
        const button6Aria = await getText(`button6.${settingsMode ? 'settings' : 'normal'}.aria`, {}, 'aria');
        if (currentTime - lastTTSTime >= ttsCooldown) {
          await getText('button6.tts.settingsToggle', { state: settingsMode ? 'off' : 'on' });
        }
        if (DOM.button6) {
          DOM.button6.textContent = button6Text;
          DOM.button6.setAttribute('aria-label', button6Aria);
        } else {
          structuredLog('WARN', 'Element not found for text update', { text: button6Text });
        }

        lastTTSTime = currentTime;
        structuredLog('DEBUG', 'updateUI: UI updated', { settingsMode, streamActive, micActive });
      } catch (err) {
        structuredLog('ERROR', 'updateUI error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `UI update error: ${err.message}` });
      }
    },

    processFrame: async () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = DOM.videoFeed.videoWidth;
        canvas.height = DOM.videoFeed.videoHeight;
        ctx.drawImage(DOM.videoFeed, 0, 0, canvas.width, canvas.height);
        const frameData = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
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
    },

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
        await getText('button3.tts.languageSelect', { state: settings.language });
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
          DOM.videoFeed.srcObject = newStream;
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
          ttsEnabled: settings.ttsEnabled
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

          const expectedKeys = ['gridType', 'synthesisEngine', 'language', 'autoFPS', 'updateInterval', 'dayNightMode', 'ttsEnabled'];
          const expectedTypes = {
            gridType: 'string',
            synthesisEngine: 'string',
            language: 'string',
            autoFPS: 'boolean',
            updateInterval: 'number',
            dayNightMode: 'string',
            ttsEnabled: 'boolean'
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