// Export dispatchEvent for global access (needed for mailto: feature and frame-processor.js)
export let dispatchEvent = null;

import { setAudioInterval } from '../state.js';
import { processFrame } from './frame-processor.js';
import { speak } from './utils.js';
import { DOM } from './dom.js'; // Use cached DOM elements

/**
 * Creates an event dispatcher for handling UI updates and frame processing.
 * @returns {Object} An object with a dispatchEvent method to handle events.
 */
export function createEventDispatcher() {
  // Event handlers for different dispatched events
  const handlers = {
    /**
     * Updates UI text and aria-labels based on settings mode, using speak for accessibility.
     * @param {Object} payload - Contains settingsMode and streamActive states.
     */
    updateUI: async ({ settingsMode, streamActive }) => {
      // Check critical DOM elements to prevent null errors
      if (!DOM.settingsToggle || !DOM.modeBtn || !DOM.languageBtn || !DOM.startStopBtn) {
        console.error('Missing critical DOM elements for UI update');
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
    },
    /**
     * Processes a single video frame for audio synthesis.
     */
    processFrame: () => processFrame(),
    /**
     * Updates the frame processing interval for audio synthesis.
     * @param {Object} payload - Contains the new interval value.
     */
    updateFrameInterval: ({ interval }) => {
      if (settings.audioInterval) {
        clearInterval(settings.audioInterval);
        setAudioInterval(setInterval(() => processFrame(), interval));
      }
    },
    /**
     * Toggles the visibility of the debug panel and logs errors.
     * @param {Object} payload - Contains show flag and optional message.
     */
    toggleDebug: ({ show, message }) => {
      if (DOM.debug) {
        DOM.debug.style.display = show ? 'block' : 'none';
        if (message && show) {
          const pre = DOM.debug.querySelector('pre');
          if (pre) {
            pre.textContent += `${message}\n`;
          }
        }
      }
    },
    /**
     * Logs errors to the debug panel.
     * @param {Object} payload - Contains the error message.
     */
    logError: ({ message }) => {
      handlers.toggleDebug({ show: true, message });
    },
  };

  // Assign global dispatchEvent for global access
  dispatchEvent = (eventName, payload = {}) => {
    if (handlers[eventName]) {
      handlers[eventName](payload);
    } else {
      console.error(`No handler found for event: ${eventName}`);
    }
  };

  // Return for local use
  return { dispatchEvent };
}

/**
 * Sets text content and aria-label for an element, with null check.
 * @param {HTMLElement} element - DOM element to update.
 * @param {string} text - Text content to set.
 * @param {string} ariaLabel - Aria-label to set.
 */
function setTextAndAriaLabel(element, text, ariaLabel) {
  if (element) {
    element.textContent = text;
    element.setAttribute('aria-label', ariaLabel);
  } else {
    console.warn(`Element not found for text update: ${text}`);
  }
}
