import { settings, setAudioInterval, setStream, setMicStream, getLogs } from '../state.js';
import { processFrame } from './frame-processor.js';
import { getText } from './utils.js';
import { getDOM } from '../context.js';
import { initializeMicAudio } from '../audio-processor.js';
import { availableGrids, availableEngines, availableLanguages } from '../config.js';

export let dispatchEvent = null;

let lastTTSTime = 0;
const ttsCooldown = 3000;

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
      const grid = availableGrids.find(g => g.id === settings.gridType);
      const engine = availableEngines.find(e => e.id === settings.synthesisEngine);
      const language = availableLanguages.find(l => l.id === settings.language);

      // Button 1
      const button1Text = settingsMode
        ? await getText('button1.settings.text', { gridName: grid?.name || 'Grid' }, 'text')
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
        ? await getText('button2.settings.text', { engineName: engine?.name || 'Engine' }, 'text')
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
        ? await getText('button3.settings.text', { languageName: language?.name || 'Language' }, 'text')
        : await getText('button3.normal.text', { languageName: language?.name || 'Language' }, 'text');
      const button3Aria = settingsMode
        ? await getText('button3.settings.aria', { language: settings.language }, 'aria')
        : await getText('button3.normal.aria', { language: settings.language }, 'aria');
      if (currentTime - lastTTSTime >= ttsCooldown) {
        await getText(`button3.tts.${settingsMode ? 'languageSelect' : 'languageSelect'}`, {
          state: settings.language
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
      console.log('updateUI: UI updated', { settingsMode, streamActive, micActive });
    },
    startStop: async ({ settingsMode }) => {
      if (settingsMode) {
        const currentIndex = availableGrids.findIndex(g => g.id === settings.gridType);
        const nextIndex = (currentIndex + 1) % availableGrids.length;
        settings.gridType = availableGrids[nextIndex].id;
        await getText('button1.tts.gridSelect', { state: settings.gridType });
      } else {
        try {
          if (!settings.stream) {
            const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: !!settings.micStream });
            DOM.videoFeed.srcObject = stream;
            setStream(stream);
            setAudioInterval(setInterval(() => {
              dispatchEvent('processFrame');
            }, settings.updateInterval));
            await getText('button1.tts.startStop', { state: 'starting' });
          } else {
            settings.stream.getTracks().forEach(track => track.stop());
            setStream(null);
            if (settings.micStream) {
              settings.micStream.getTracks().forEach(track => track.stop());
              setMicStream(null);
              initializeMicAudio(null);
            }
            clearInterval(settings.audioInterval);
            setAudioInterval(null);
            await getText('button1.tts.startStop', { state: 'stopping' });
          }
          dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
        } catch (err) {
          console.error('Stream toggle error:', err.message);
          dispatchEvent('logError', { message: `Stream toggle error: ${err.message}` });
          await getText('button1.tts.cameraError');
        }
      }
    },
    toggleAudio: async ({ settingsMode }) => {
      if (settingsMode) {
        const currentIndex = availableEngines.findIndex(e => e.id === settings.synthesisEngine);
        const nextIndex = (currentIndex + 1) % availableEngines.length;
        settings.synthesisEngine = availableEngines[nextIndex].id;
        await getText('button2.tts.synthesisSelect', { state: settings.synthesisEngine });
      } else {
        try {
          console.log('toggleAudio: Current mic state', { micActive: !!settings.micStream });
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
        } catch (err) {
          console.error('Mic toggle error:', err.message);
          dispatchEvent('logError', { message: `Mic toggle error: ${err.message}` });
          await getText('button2.tts.micError');
        }
      }
    },
    toggleInput: async () => {
      try {
        const currentIndex = availableLanguages.findIndex(l => l.id === settings.language);
        const nextIndex = (currentIndex + 1) % availableLanguages.length;
        settings.language = availableLanguages[nextIndex].id;
        await getText('button3.tts.languageSelect', { state: settings.language });
        dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
      } catch (err) {
        console.error('Language toggle error:', err.message);
        dispatchEvent('logError', { message: `Language toggle error: ${err.message}` });
        await getText('button3.tts.fpsError');
      }
    },
    updateFrameInterval: async ({ interval }) => {
      try {
        settings.updateInterval = interval;
        if (settings.stream) {
          clearInterval(settings.audioInterval);
          setAudioInterval(setInterval(() => {
            dispatchEvent('processFrame');
          }, settings.updateInterval));
        }
        await getText('button4.tts.fpsBtn', {
          fps: settings.autoFPS ? 'auto' : Math.round(1000 / settings.updateInterval)
        });
        dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
      } catch (err) {
        console.error('Frame interval update error:', err.message);
        dispatchEvent('logError', { message: `Frame interval update error: ${err.message}` });
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
        console.error('Grid toggle error:', err.message);
        dispatchEvent('logError', { message: `Grid toggle error: ${err.message}` });
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
        console.error('Debug toggle error:', err.message);
        dispatchEvent('logError', { message: `Debug toggle error: ${err.message}` });
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
        console.error('Save settings error:', err.message);
        dispatchEvent('logError', { message: `Save settings error: ${err.message}` });
        await getText('button4.tts.saveError');
      }
      dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
    },
    loadSettings: async () => {
      try {
        const savedSettings = localStorage.getItem('acoustsee-settings');
        if (savedSettings) {
          const parsedSettings = JSON.parse(savedSettings);
          settings.gridType = parsedSettings.gridType || settings.gridType;
          settings.synthesisEngine = parsedSettings.synthesisEngine || settings.synthesisEngine;
          settings.language = parsedSettings.language || settings.language;
          settings.autoFPS = parsedSettings.autoFPS ?? settings.autoFPS;
          settings.updateInterval = parsedSettings.updateInterval || settings.updateInterval;
          settings.dayNightMode = parsedSettings.dayNightMode || settings.dayNightMode;
          settings.ttsEnabled = parsedSettings.ttsEnabled ?? settings.ttsEnabled;
          await getText('button5.tts.loadSettings.loaded');
        } else {
          await getText('button5.tts.loadSettings.none');
        }
      } catch (err) {
        console.error('Load settings error:', err.message);
        dispatchEvent('logError', { message: `Load settings error: ${err.message}` });
        await getText('button5.tts.loadError');
      }
      dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
    },
    emailDebug: async () => {
      try {
        const logs = getLogs();
        const subject = encodeURIComponent('AcoustSee Debug Log');
        const body = encodeURIComponent(`Debug Log:\n${logs}`);
        window.location.href = `mailto:acoustsee@outlook.com?subject=${subject}&body=${body}`;
        await getText('button5.tts.emailDebug');
      } catch (err) {
        console.error('Email debug error:', err.message);
        dispatchEvent('logError', { message: `Email debug error: ${err.message}` });
        await getText('button5.tts.emailDebug', { state: 'error' });
      }
    },
    logError: ({ message }) => {
      console.error('Error logged:', message);
      addLog(`ERROR: ${message}`);
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