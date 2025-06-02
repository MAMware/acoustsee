import { setAudioInterval } from '../state.js';
import { processFrame } from './frame-processor.js';
import { speak } from './utils.js'; // Use existing speak function with languages folder
import { DOM, initDOM } from './dom.js';

// Initialize DOM elements
initDOM().then(() => {
  console.log('DOM Elements initialized:', DOM);
});

/**
 * Creates an event dispatcher for handling UI updates and frame processing.
 * @param {Object} settings - Global settings object from state.js.
 * @returns {Object} An object with a dispatchEvent method to handle events.
 */
export function createEventDispatcher(settings) {
    // Remove initializeElements and related code

    // Event handlers for different dispatched events
    const handlers = {
        /**
         * Updates UI text and aria-labels based on settings mode, using speak for accessibility.
         * @param {Object} payload - Contains settingsMode and streamActive states.
         */
        updateUI: async ({ settingsMode, streamActive }) => {
            // Use DOM instead of elements
            if (!DOM) return; // Prevent execution before DOM is ready

            const state = { state: settingsMode ? 'on' : 'off' };
            await speak('settingsToggle', state); // Speak the state change
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
            const debug = document.getElementById('debug');
            if (debug) {
                debug.style.display = show ? 'block' : 'none';
                if (message && show) {
                    const pre = debug.querySelector('pre');
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

    return {
        /**
         * Dispatches an event to the appropriate handler.
         * @param {string} eventName - Name of the event to dispatch.
         * @param {Object} [payload] - Optional data for the event handler.
         */
        dispatchEvent: (eventName, payload = {}) => {
            if (handlers[eventName]) {
                handlers[eventName](payload);
            } else {
                console.error(`No handler found for event: ${eventName}`);
            }
        },
    };
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
