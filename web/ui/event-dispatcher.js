import { settings, setAudioInterval } from '../state.js';
import { processFrame } from './frame-processor.js';

/**
 * Creates an event dispatcher to route UI events to specific handlers.
 * @returns {Object} Dispatcher with a dispatchEvent method.
 */
export function createEventDispatcher() {
    /**
     * Event handlers for UI actions.
     * @type {Object.<string, Function>}
     */
    const handlers = {
        /**
         * Toggles visibility of settings dropdowns based on settings mode.
         * @param {Object} payload - Event payload.
         * @param {boolean} payload.settingsMode - Whether settings mode is active.
         */
        toggleSettings: ({ settingsMode }) => {
            document.getElementById('gridSelect').style.display = settingsMode ? 'block' : 'none';
            document.getElementById('synthesisSelect').style.display = settingsMode ? 'block' : 'none';
            document.getElementById('fpsSelect').style.display = settingsMode ? 'block' : 'none';
            document.getElementById('languageSelect').style.display = settingsMode ? 'block' : 'none';
        },
        /**
         * Toggles visibility of the language dropdown.
         * @param {Object} payload - Event payload.
         * @param {boolean} payload.settingsMode - Whether settings mode is active.
         */
        toggleLanguageSelect: ({ settingsMode }) => {
            document.getElementById('languageSelect').style.display = settingsMode ? 'block' : 'none';
        },
        /**
         * Updates UI text based on the current language.
         */
        updateUI: () => {
            // Translation mappings for UI elements
            const translations = {
                'en-US': {
                    settingsToggle: 'Settings',
                    modeBtn: 'Daylight',
                    languageBtn: 'Language',
                    startStop: 'Navigation {state}',
                },
                'es-ES': {
                    settingsToggle: 'Configuraciones',
                    modeBtn: 'Luz del Día',
                    languageBtn: 'Idioma',
                    startStop: 'Navegación {state}',
                }
            };
            const t = translations[settings.language || 'en-US'];
            document.getElementById('settingsToggle').firstChild.textContent = t.settingsToggle;
            document.getElementById('modeBtn').firstChild.textContent = t.modeBtn;
            document.getElementById('languageBtn').firstChild.textContent = t.languageBtn;
            document.getElementById('startStopBtn').textContent = t.startStop.replace('{state}', settings.stream ? 'stopped' : 'started');
        },
        /**
         * Processes a video frame for audio synthesis.
         */
        processFrame: () => processFrame(),
        /**
         * Updates the frame processing interval.
         * @param {Object} payload - Event payload.
         * @param {number} payload.interval - New interval in milliseconds.
         */
        updateFrameInterval: ({ interval }) => {
            if (settings.audioInterval) {
                clearInterval(settings.audioInterval);
                setAudioInterval(setInterval(() => processFrame(), interval));
            }
        }
    };

    return {
        /**
         * Dispatches an event to the corresponding handler.
         * @param {string} eventName - Name of the event.
         * @param {Object} [payload] - Data for the event handler.
         */
        dispatchEvent: (eventName, payload) => {
            if (handlers[eventName]) handlers[eventName](payload);
        }
    };
}
