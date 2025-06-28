import { setAudioInterval, settings, setStream } from '../state.js';
import { processFrame } from './frame-processor.js';
import { speak } from './utils.js';
import { getDOM } from '../context.js';
import { initializeMicAudio } from '../audio-processor.js';

export let dispatchEvent = null;

let lastTTSTime = 0;
const ttsCooldown = 3000; // 3 seconds cooldown for TTS

export function createEventDispatcher(DOM) {
  console.log('createEventDispatcher: Initializing event dispatcher');
  if (!DOM) {
    console.error('DOM is undefined in createEventDispatcher');
    return { dispatchEvent: () => console.error('dispatchEvent not initialized due to undefined DOM') };
  }

  const handlers = {
    updateUI: async ({ settingsMode, streamActive, micActive }) => {
      if (!DOM.button1 || !DOM.button2 || !DOM.button3 || !DOM.button4 || !DOM.button5 || !DOM.button6) {
        console.error('Missing critical DOM elements for UI update');
        dispatchEvent('logError', { message: 'Missing critical DOM elements for UI update' });
        return;
      }

      const currentTime = performance.now();
      if (currentTime - lastTTSTime < ttsCooldown) {
        // Skip TTS but update text and aria-labels
        setTextAndAriaLabel(
          DOM.button1.querySelector('.button-text'),
          settingsMode ? (settings.gridType === 'hex-tonnetz' ? 'Hex Tonnetz' : 'Circle of Fifths') : (streamActive ? 'Stop' : 'Start'),
          settingsMode ? `Select grid: ${settings.gridType}` : `Start or stop stream`
        );
        setTextAndAriaLabel(
          DOM.button2,
          settingsMode ? (settings.synthesisEngine === 'sine-wave' ? 'Sine Wave' : 'FM Synthesis') : (micActive ? 'Mic Off' : 'Mic On'),
          settingsMode ? `Select synthesis: ${settings.synthesisEngine}` : `Toggle microphone`
        );
        setTextAndAriaLabel(
          DOM.button3,
          settingsMode ? (settings.language === 'en-US' ? 'English' : 'Spanish') : (settings.autoFPS ? 'Auto FPS' : `${Math.round(1000 / settings.updateInterval)} FPS`),
          settingsMode ? `Select language: ${settings.language}` : `Select frame rate`
        );
        setTextAndAriaLabel(
          DOM.button4,
          settingsMode ? 'View Debug' : 'Save Settings',
          settingsMode ? 'View debug log' : 'Save settings'
        );
        setTextAndAriaLabel(
          DOM.button5,
          settingsMode ? 'Email Log' : 'Load Settings',
          settingsMode ? 'Email debug log' : 'Load settings'
        );
        setTextAndAriaLabel(
          DOM.button6,
          settingsMode ? 'Exit Settings' : 'Settings',
          settingsMode ? 'Exit settings mode' : 'Toggle settings mode'
        );
        console.log('updateUI: Skipped TTS due to cooldown', { currentTime, lastTTSTime });
        return;
      }

      console.log('updateUI: Triggering with TTS', { settingsMode, streamActive, micActive });
      const state = { state: settingsMode ? 'on' : 'off' };
      // Button 1: Start/Stop or Grid
      await speak(settingsMode ? 'gridSelect' : 'startStop', {
        state: settingsMode ? settings.gridType : (streamActive ? 'stopped' : 'started')
      });
      setTextAndAriaLabel(
        DOM.button1.querySelector('.button-text'),
        settingsMode ? (settings.gridType === 'hex-tonnetz' ? 'Hex Tonnetz' : 'Circle of Fifths') : (streamActive ? 'Stop' : 'Start'),
        settingsMode ? `Select grid: ${settings.gridType}` : `Start or stop stream`
      );

      // Button 2: Mic or Synth
      await speak(settingsMode ? 'synthesisSelect' : 'micToggle', {
        state: settingsMode ? settings.synthesisEngine : (micActive ? 'off' : 'on')
      });
      setTextAndAriaLabel(
        DOM.button2,
        settingsMode ? (settings.synthesisEngine === 'sine-wave' ? 'Sine Wave' : 'FM Synthesis') : (micActive ? 'Mic Off' : 'Mic On'),
        settingsMode ? `Select synthesis: ${settings.synthesisEngine}` : `Toggle microphone`
      );

      // Button 3: FPS or Input
      await speak(settingsMode ? 'languageSelect' : 'fpsBtn', {
        fps: settingsMode ? settings.language : (settings.autoFPS ? 'auto' : Math.round(1000 / settings.updateInterval))
      });
      setTextAndAriaLabel(
        DOM.button3,
        settingsMode ? (settings.language === 'en-US' ? 'English' : 'Spanish') : (settings.autoFPS ? 'Auto FPS' : `${Math.round(1000 / settings.updateInterval)} FPS`),
        settingsMode ? `Select language: ${settings.language}` : `Select frame rate`
      );

      // Button 4: Save Settings or View Debug
      await speak(settingsMode ? 'viewDebug' : 'saveSettings', { state: settingsMode ? 'view' : 'save' });
      setTextAndAriaLabel(
        DOM.button4,
        settingsMode ? 'View Debug' : 'Save Settings',
        settingsMode ? 'View debug log' : 'Save settings'
      );

      // Button 5: Load Settings or Email Debug
      await speak(settingsMode ? 'emailDebug' : 'loadSettings', { state: settingsMode ? 'email' : 'load' });
      setTextAndAriaLabel(
        DOM.button5,
        settingsMode ? 'Email Log' : 'Load Settings',
        settingsMode ? 'Email debug log' : 'Load settings'
      );

      // Button 6: Settings Toggle
      await speak('settingsToggle', state);
      setTextAndAriaLabel(
        DOM.button6,
        settingsMode ? 'Exit Settings' : 'Settings',
        settingsMode ? 'Exit settings mode' : 'Toggle settings mode'
      );

      lastTTSTime = currentTime;
    },
    processFrame: () => {
      try {
        processFrame(DOM.videoFeed, DOM);
      } catch (err) {
        console.error('Process frame error:', err.message);
        dispatchEvent('logError', { message: `Process frame error: ${err.message}` });
      }
    },
    updateFrameInterval: ({ interval }) => {
      if (settings.audioInterval) {
        clearInterval(settings.audioInterval);
        setAudioInterval(setInterval(() => {
          dispatchEvent('processFrame');
        }, interval));
      }
    },
    toggleDebug: ({ show, message }) => {
      console.log('toggleDebug handler called:', { show, message });
      if (DOM.debug) {
        DOM.debug.style.display = show ? 'block' : 'none';
        if (message && show) {
          const pre = DOM.debug.querySelector('pre');
          if (pre) {
            pre.textContent += `${new Date().toISOString()} - ${message}\n`;
            pre.scrollTop = pre.scrollHeight;
          } else {
            console.error('Debug pre element not found');
          }
        }
      } else {
        console.error('Debug element not found');
      }
    },
    logError: ({ message }) => {
      console.error('Logging error:', message);
      handlers.toggleDebug({ show: true, message });
    },
    startStop: async ({ settingsMode }) => {
      if (settingsMode) {
        settings.gridType = settings.gridType === 'circle-of-fifths' ? 'hex-tonnetz' : 'circle-of-fifths';
        await speak('gridSelect', { state: settings.gridType });
      } else {
        await handlers.toggleStream();
      }
      dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
    },
    toggleStream: async () => {
      try {
        if (!settings.stream) {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: !!settings.micStream });
          DOM.videoFeed.srcObject = stream;
          setStream(stream);
          setAudioInterval(setInterval(() => {
            dispatchEvent('processFrame');
          }, settings.updateInterval));
          await speak('startStop', { state: 'started' });
        } else {
          settings.stream.getTracks().forEach(track => track.stop());
          setStream(null);
          if (settings.micStream) {
            settings.micStream.getTracks().forEach(track => track.stop());
            settings.micStream = null;
          }
          clearInterval(settings.audioInterval);
          setAudioInterval(null);
          await speak('startStop', { state: 'stopped' });
        }
        dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
      } catch (err) {
        console.error('Stream toggle error:', err.message);
        dispatchEvent('logError', { message: `Stream toggle error: ${err.message}` });
        await speak('cameraError');
      }
    },
    toggleMic: async ({ settingsMode }) => {
      if (settingsMode) {
        settings.synthesisEngine = settings.synthesisEngine === 'sine-wave' ? 'fm-synthesis' : 'sine-wave';
        await speak('synthesisSelect', { state: settings.synthesisEngine });
      } else {
        try {
          if (!settings.micStream) {
            const micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
            settings.micStream = micStream;
            initializeMicAudio(micStream);
            await speak('micToggle', { state: 'on' });
          } else {
            settings.micStream.getTracks().forEach(track => track.stop());
            settings.micStream = null;
            initializeMicAudio(null);
            await speak('micToggle', { state: 'off' });
          }
          dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
        } catch (err) {
          console.error('Mic toggle error:', err.message);
          dispatchEvent('logError', { message: `Mic toggle error: ${err.message}` });
          await speak('micError');
        }
      }
    },
    toggleInput: async () => {
      settings.language = settings.language === 'en-US' ? 'es-ES' : 'en-US';
      await speak('languageSelect', { lang: settings.language });
      dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
    },
    saveSettings: async ({ settingsMode }) => {
      if (settingsMode) {
        DOM.debug.style.display = 'block';
        await speak('viewDebug', { state: 'view' });
      } else {
        try {
          localStorage.setItem('acoustSeeSettings', JSON.stringify({
            gridType: settings.gridType,
            synthesisEngine: settings.synthesisEngine,
            language: settings.language,
            autoFPS: settings.autoFPS,
            updateInterval: settings.updateInterval
          }));
          await speak('saveSettings', { state: 'saved' });
        } catch (err) {
          console.error('Save settings error:', err.message);
          dispatchEvent('logError', { message: `Save settings error: ${err.message}` });
          await speak('saveError');
        }
      }
    },
    loadSettings: async ({ settingsMode }) => {
      if (settingsMode) {
        dispatchEvent('emailDebug');
      } else {
        try {
          const saved = localStorage.getItem('acoustSeeSettings');
          if (saved) {
            const parsed = JSON.parse(saved);
            settings.gridType = parsed.gridType || settings.gridType;
            settings.synthesisEngine = parsed.synthesisEngine || settings.synthesisEngine;
            settings.language = parsed.language || settings.language;
            settings.autoFPS = parsed.autoFPS !== undefined ? parsed.autoFPS : settings.autoFPS;
            settings.updateInterval = parsed.updateInterval || settings.updateInterval;
            dispatchEvent('updateFrameInterval', { interval: settings.updateInterval });
            await speak('loadSettings', { state: 'loaded' });
          } else {
            await speak('loadSettings', { state: 'none' });
          }
        } catch (err) {
          console.error('Load settings error:', err.message);
          dispatchEvent('logError', { message: `Load settings error: ${err.message}` });
          await speak('loadError');
        }
      }
      dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
    },
    emailDebug: async () => {
      try {
        const pre = DOM.debug.querySelector('pre');
        const logContent = pre ? pre.textContent : 'No logs available';
        const mailto = `mailto:?subject=AcoustSee Error Log&body=${encodeURIComponent(logContent)}`;
        window.location.href = mailto;
        await speak('emailDebug', { state: 'sent' });
      } catch (err) {
        console.error('Email debug error:', err.message);
        dispatchEvent('logError', { message: `Email debug error: ${err.message}` });
        await speak('emailDebug', { state: 'error' });
      }
    }
  };

  dispatchEvent = (eventName, payload = {}) => {
    if (handlers[eventName]) {
      try {
        handlers[eventName](payload);
      } catch (err) {
        console.error(`Error in handler ${eventName}:`, err.message);
        handlers.logError({ message: `Handler ${eventName} error: ${err.message}` });
      }
    } else {
      console.error(`No handler found for event: ${eventName}`);
      handlers.logError({ message: `No handler for event: ${eventName}` });
    }
  };

  console.log('createEventDispatcher: Dispatcher initialized');
  return { dispatchEvent };
}

function setTextAndAriaLabel(element, text, ariaLabel) {
  if (element) {
    element.textContent = text;
    element.setAttribute('aria-label', ariaLabel);
  } else {
    console.warn(`Element not found for text update: ${text}`);
  }
}
