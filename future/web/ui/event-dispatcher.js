export let dispatchEvent = null;

import { setAudioInterval, settings } from '../state.js';
import { processFrame } from './frame-processor.js';
import { speak } from './utils.js';
import { getDOM } from '../context.js';

export function createEventDispatcher(DOM) {
  console.log('createEventDispatcher: Initializing event dispatcher');
  if (!DOM) {
    console.error('DOM is undefined in createEventDispatcher');
    return { dispatchEvent: () => console.error('dispatchEvent not initialized due to undefined DOM') };
  }

  const handlers = {
    updateUI: async ({ settingsMode, streamActive }) => {
      if (!DOM.settingsToggle || !DOM.modeBtn || !DOM.languageBtn || !DOM.startStopBtn) {
        console.error('Missing critical DOM elements for UI update');
        dispatchEvent('logError', { message: 'Missing critical DOM elements for UI update' });
        return;
      }

      const state = { state: settingsMode ? 'on' : 'off' };
      await speak('settingsToggle', state);
      setTextAndAriaLabel(
        DOM.settingsToggle,
        settingsMode ? 'Exit Settings' : 'Toggle Settings',
        settingsMode ? 'Exit settings mode' : 'Toggle settings mode'
      );

      state.state = settingsMode ? settings.gridType : settings.dayNightMode;
      await speak('modeBtn', { mode: state.state });
      setTextAndAriaLabel(
        DOM.modeBtn,
        settingsMode ? (state.state === 'hex-tonnetz' ? 'Hex Tonnetz' : 'Circle of Fifths') : (state.state === 'day' ? 'Daylight' : 'Night'),
        settingsMode ? `Select grid: ${state.state}` : `Toggle ${state.state} mode`
      );

      state.state = settingsMode ? settings.synthesisEngine : settings.language || 'en-US';
      await speak('languageSelect', { lang: state.state });
      setTextAndAriaLabel(
        DOM.languageBtn,
        settingsMode ? (state.state === 'sine-wave' ? 'Sine Wave' : 'FM Synthesis') : (state.state === 'en-US' ? 'English' : 'Spanish'),
        settingsMode ? `Select synthesis: ${state.state}` : `Cycle to ${state.state}`
      );

      if (DOM.startStopBtn) {
        const startStopState = streamActive ? 'stopped' : 'started';
        await speak('startStop', { state: startStopState });
        DOM.startStopBtn.textContent = startStopState === 'started' ? 'Start' : 'Stop';
      }

      if (DOM.fpsBtn) {
        const fps = 1000 / settings.updateInterval;
        await speak('fpsBtn', { fps });
        setTextAndAriaLabel(
          DOM.fpsBtn,
          `${fps} FPS`,
          `Select frame rate: ${fps} FPS`
        );
      }
},
    processFrame: () => {
      try {
        const DOM = getDOM();
        processFrame(DOM.videoFeed, DOM.imageCanvas, DOM);
      } catch (err) {
        console.error('Process frame error:', err.message);
        dispatchEvent('logError', { message: `Process frame error: ${err.message}` });
      }
    },
    updateFrameInterval: ({ interval }) => {
      if (settings.audioInterval) {
        clearInterval(settings.audioInterval);
        setAudioInterval(setInterval(() => {
          try {
            processFrame();
          } catch (err) {
            console.error('Process frame error:', err.message);
            dispatchEvent('logError', { message: `Process frame error: ${err.message}` });
          }
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
