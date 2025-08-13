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
         * Updates UI text and ARIA labels based on settings mode and language.
         * @param {Object} payload - Event payload.
         * @param {boolean} payload.settingsMode - Whether settings mode is active.
         */
        updateUI: ({ settingsMode }) => {
            const translations = {
                'en-US': {
                    settingsToggle: settingsMode ? 'Exit Settings' : 'Settings',
                    modeBtn: settingsMode ? 'Select Grid' : 'Daylight',
                    languageBtn: settingsMode ? 'Select Synthesis' : 'Language',
                    startStop: 'Navigation {state}',
                    gridSelect: { 'hex-tonnetz': 'Hexagonal Tonnetz', 'circle-of-fifths': 'Circle of Fifths' },
                    synthesisSelect: { 'sine-wave': 'Sine Wave', 'fm-synthesis': 'FM Synthesis' },
                    languageSelect: { 'en-US': 'English', 'es-ES': 'Spanish' }
                },
                'es-ES': {
                    settingsToggle: settingsMode ? 'Salir de Configuraciones' : 'Configuraciones',
                    modeBtn: settingsMode ? 'Seleccionar Cuadrícula' : 'Luz del Día',
                    languageBtn: settingsMode ? 'Seleccionar Síntesis' : 'Idioma',
                    startStop: 'Navegación {state}',
                    gridSelect: { 'hex-tonnetz': 'Tonnetz Hexagonal', 'circle-of-fifths': 'Círculo de Quintas' },
                    synthesisSelect: { 'sine-wave': 'Onda Sinusoidal', 'fm-synthesis': 'Síntesis FM' },
                    languageSelect: { 'en-US': 'Inglés', 'es-ES': 'Español' }
                }
            };
            const t = translations[settings.language || 'en-US'];
            const elements = {
                settingsToggle: document.getElementById('settingsToggle'),
                modeBtn: document.getElementById('modeBtn'),
                languageBtn: document.getElementById('languageBtn'),
                startStopBtn: document.getElementById('startStopBtn')
            };
            if (elements.settingsToggle) {
                elements.settingsToggle.textContent = t.settingsToggle;
                elements.settingsToggle.setAttribute('aria-label', settingsMode ? 'Exit settings mode' : 'Toggle settings mode');
            }
            if (elements.modeBtn) {
                elements.modeBtn.textContent = settingsMode ? t.gridSelect[settings.gridType] : t.modeBtn;
                elements.modeBtn.setAttribute('aria-label', settingsMode ? `Select grid: ${t.gridSelect[settings.gridType]}` : 'Toggle day/night mode');
            }
            if (elements.languageBtn) {
                elements.languageBtn.textContent = settingsMode ? t.synthesisSelect[settings.synthesisEngine] : t.languageSelect[settings.language || 'en-US'];
                elements.languageBtn.setAttribute('aria-label', settingsMode ? `Select synthesis: ${t.synthesisSelect[settings.synthesisEngine]}` : 'Cycle language');
            }
            if (elements.startStopBtn) {
                elements.startStopBtn.textContent = t.startStop.replace('{state}', settings.stream ? 'stopped' : 'started');
            }
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
