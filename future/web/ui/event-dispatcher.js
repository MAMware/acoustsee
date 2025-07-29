/* @ts-nocheck */
// future/web/ui/event-dispatcher.js
import { settings, setAudioInterval, setStream, setMicStream, getLogs } from '../state.js';
import { getText } from './utils.js';
import { initializeMicAudio } from '../audio-processor.js';
import { processFrame } from './video-capture.js';
import { structuredLog } from '../utils/logging.js';
import { cleanupFrameProcessor } from './video-capture.js';
import { dispatchEvent, setDispatcher } from '../core/dispatcher.js';

let lastTTSTime = 0;
const ttsCooldown = 3000;
let fpsSamplerInterval = null;  // For averaging FPS.
let frameCount = 0;  // Reset per sample period.

export async function createEventDispatcher(DOM) {
  structuredLog('INFO', 'createEventDispatcher: Initializing event dispatcher', { domExists: !!DOM });
  if (!DOM) {
    structuredLog('ERROR', 'DOM is undefined in createEventDispatcher');
    return { dispatchEvent: () => structuredLog('ERROR', 'dispatchEvent not initialized due to undefined DOM') };
  }

 // Log DOM elements for debugging.
  structuredLog('DEBUG', 'DOM elements received', {
    hasButton1: !!DOM.button1,
    hasButton2: !!DOM.button2,
    hasButton3: !!DOM.button3,
    hasButton4: !!DOM.button4,
    hasButton5: !!DOM.button5,
    hasButton6: !!DOM.button6,
    hasVideoFeed: !!DOM.videoFeed,
  });
  
  // Load configurations
  const [availableGrids, availableEngines, availableLanguages] = await Promise.all([
    fetch('./synthesis-methods/grids/availableGrids.json').then(res => res.json()),
    fetch('./synthesis-methods/engines/availableEngines.json').then(res => res.json()),
    fetch('./languages/availableLanguages.json').then(res => res.json())
  ]);

  // Gather and log enhanced browser/app debug info.
  const browserInfo = {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    parsedBrowserVersion: parseBrowserVersion(navigator.userAgent),  // New: Parsed version.
    hardwareConcurrency: navigator.hardwareConcurrency || 'N/A',  // CPU cores.
    deviceMemory: navigator.deviceMemory ? `${navigator.deviceMemory} GB` : 'N/A',  // Approx RAM.
    screen: `${screen.width}x${screen.height}`,
    audioContextState: typeof audioContext !== 'undefined' ? audioContext.state : 'Not initialized',  // App-specific.
    streamActive: !!settings.stream,
    micActive: !!settings.micStream,
    currentFPSInterval: settings.updateInterval  // Proxy for FPS (1000 / ms).
  };
  structuredLog('INFO', 'Enhanced browser and app debug info', browserInfo);

  // Start FPS sampler if debugLogging (logs average every 10s when stream active).
  if (settings.debugLogging) {
    fpsSamplerInterval = setInterval(() => {
      if (settings.stream) {
        const avgFPS = frameCount / 10;  // Over 10s period.
        structuredLog('DEBUG', 'Average FPS sample', { avgFPS, overSeconds: 10 });
        frameCount = 0;  // Reset.
      }
    }, 10000);  // 10s.
  }

  const handlers = {
    updateUI: async ({ settingsMode, streamActive, micActive }) => {
      try {
        if (!DOM.button1 || !DOM.button2 || !DOM.button3 || !DOM.button4 || !DOM.button5 || !DOM.button6) {
          const missing = [
            !DOM.button1 && 'button1',
            !DOM.button2 && 'button2',
            !DOM.button3 && 'button3',
            !DOM.button4 && 'button4',
            !DOM.button5 && 'button5',
            !DOM.button6 && 'button6'
          ].filter(Boolean);
          structuredLog('ERROR', 'Missing critical DOM elements for UI update', { missing });
          dispatchEvent('logError', { message: 'Missing critical DOM elements for UI update' });
          return;
        }
        
        const currentTime = performance.now();
        const grid = availableGrids.find(g => g.id === settings.gridType);
        const engine = availableEngines.find(e => e.id === settings.synthesisEngine);
        const language = availableLanguages.find(l => l.id === settings.language);

        // Button 1
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
        setTextAndAriaLabel(DOM.button1, button1Text, button1Aria);

        // Button 2
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
        setTextAndAriaLabel(DOM.button2, button2Text, button2Aria);

        // Button 3
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
        setTextAndAriaLabel(DOM.button3, button3Text, button3Aria);

        // Button 4
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
        setTextAndAriaLabel(DOM.button4, button4Text, button4Aria);

        // Button 5
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
        setTextAndAriaLabel(DOM.button5, button5Text, button5Aria);

        // Button 6
        const button6Text = await getText(`button6.${settingsMode ? 'settings' : 'normal'}.text`, {}, 'text');
        const button6Aria = await getText(`button6.${settingsMode ? 'settings' : 'normal'}.aria`, {}, 'aria');
        if (currentTime - lastTTSTime >= ttsCooldown) {
          await getText('button6.tts.settingsToggle', { state: settingsMode ? 'off' : 'on' });
        }
        setTextAndAriaLabel(DOM.button6, button6Text, button6Aria);

        lastTTSTime = currentTime;
        structuredLog('DEBUG', 'updateUI: UI updated', { settingsMode, streamActive, micActive });
      } catch (err) {
        structuredLog('ERROR', 'updateUI error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `UI update error: ${err.message}` });
      }
    },

    processFrame: async () => {
      try {
        const video = DOM.videoFeed;
        if (!video || video.videoWidth === 0 || video.videoHeight === 0) {
          structuredLog('WARN', 'processFrame: Invalid video feed', { width: video?.videoWidth, height: video?.videoHeight });
          return;
        }
        const result = await processFrame(DOM, video.videoWidth, video.videoHeight);
        structuredLog('DEBUG', 'processFrame result', { notesCount: result?.notes?.length || 0, avgIntensity: result?.avgIntensity });
        frameCount++;
      } catch (err) {
        structuredLog('ERROR', 'processFrame handler error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `Frame processing handler error: ${err.message}` });
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
            // video-only to avoid duplicate audio tracks
            const stream = await navigator.mediaDevices.getUserMedia({ video: true });
            // attach stream and wait for valid metadata before proceeding
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
            setAudioInterval(setInterval(() => {
              dispatchEvent('processFrame');
            }, settings.updateInterval));
            await getText('button1.tts.startStop', { state: 'starting' });
          } else {
            // stop only video tracks
            settings.stream.getVideoTracks().forEach(track => track.stop());
            setStream(null);
            await cleanupFrameProcessor(); // Reset frame processor state
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

    toggleInput: async () => {  // Renamed from toggleInput for clarity
      try {
        const currentIndex = availableLanguages.findIndex(l => l.id === settings.language);
        const nextIndex = (currentIndex + 1) % availableLanguages.length;
        settings.language = availableLanguages[nextIndex].id;
        await getText('button3.tts.languageSelect', { state: settings.language });
        // Remove redundant dispatchEvent; updateUI triggered by setupUIController
      } catch (err) {
        structuredLog('ERROR', 'toggleInput error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `Language toggle error: ${err.message}` });
        await getText('button3.tts.languageError');  // Changed to language-specific error
      }
    },

    toggleLanguage: async () => {  // Renamed from toggleInput for clarity
      try {
        const currentIndex = availableLanguages.findIndex(l => l.id === settings.language);
        const nextIndex = (currentIndex + 1) % availableLanguages.length;
        settings.language = availableLanguages[nextIndex].id;
        await getText('button3.tts.languageSelect', { state: settings.language });
        // Trigger UI refresh after language change
        dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
      } catch (err) {
        structuredLog('ERROR', 'toggleLanguage error', { message: err.message, stack: err.stack });
        handlers.logError({ message: `Language toggle error: ${err.message}` });
        await getText('button3.tts.languageError');  // Changed to language-specific error
      }
    },

    toggleVideoSource: async () => {
      try {
        const oldStream = DOM.videoFeed?.srcObject;
        if (oldStream) {
          const currentVideoTrack = oldStream.getVideoTracks()[0];
          const currentFacingMode = currentVideoTrack.getSettings().facingMode || 'user';
          const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

          // Release old camera & mic tracks
          oldStream.getTracks().forEach(track => track.stop());
          await cleanupFrameProcessor(); // Reset frame processor state

          // Request new stream with updated video source and existing audio state
          const newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: newFacingMode },
            audio: !!settings.micStream
          });
          // attach new stream and validate metadata
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

          // Re-init mic if it was on
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

          // Sanitize: Define expected keys and types, assign only whitelisted ones to prevent extra/proto keys.
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

          // Selective assignment: Only copy if key is expected and type matches.
          expectedKeys.forEach(key => {
            if (Object.hasOwn(parsedSettings, key) && typeof parsedSettings[key] === expectedTypes[key]) {
              settings[key] = parsedSettings[key];
            } else if (Object.hasOwn(parsedSettings, key)) {
              structuredLog('WARN', 'Invalid type for setting during load', { key, receivedType: typeof parsedSettings[key] });
            }
          });

          // Log if extra keys present (potential pollution attempt).
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
        alert('Failed to download logs: ' + err.message);  // Mobile-friendly feedback.
        await getText('button5.tts.emailDebug', { state: 'error' });
      }
    },

    logError: ({ message }) => {
      structuredLog('ERROR', 'Error logged', { message });
    }
  };

  // Setup core dispatcher to use this UI dispatcher
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

// Helper for parsed browser version (simple regex examples; expand as needed).
function parseBrowserVersion(userAgent) {
  let match = userAgent.match(/Chrome\/([0-9.]+)/) || userAgent.match(/Firefox\/([0-9.]+)/) || userAgent.match(/Safari\/([0-9.]+)/) || userAgent.match(/Edg\/([0-9.]+)/);
  return match ? match[1] : 'Unknown';
}

function setTextAndAriaLabel(element, text, ariaLabel) {
  if (element) {
    element.textContent = text;
    element.setAttribute('aria-label', ariaLabel);
  } else {
    structuredLog('WARN', `Element not found for text update: ${text}`);
  }
}
