import { settings, setAudioInterval } from '../state.js';
import { processFrame } from './frame-processor.js';

export function createEventDispatcher() {
    const handlers = {
        updateUI: ({ settingsMode, streamActive }) => {
            const translations = {
                'en-US': {
                    settingsToggle: settingsMode ? 'Exit Settings' : 'Settings',
                    modeBtn: settingsMode ? 'Select Grid' : 'Daylight',
                    languageBtn: settingsMode ? 'Select Synthesis' : 'Language',
                    startStop: streamActive ? 'Stop' : 'Start',
                    gridSelect: { 'hex-tonnetz': 'Hexagonal Tonnetz', 'circle-of-fifths': 'Circle of Fifths' },
                    synthesisSelect: { 'sine-wave': 'Sine Wave', 'fm-synthesis': 'FM Synthesis' },
                    languageSelect: { 'en-US': 'English', 'es-ES': 'Spanish' }
                },
                'es-ES': {
                    settingsToggle: settingsMode ? 'Salir de Configuraciones' : 'Configuraciones',
                    modeBtn: settingsMode ? 'Seleccionar Cuadrícula' : 'Luz del Día',
                    languageBtn: settingsMode ? 'Seleccionar Síntesis' : 'Idioma',
                    startStop: streamActive ? 'Detener' : 'Iniciar',
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
                elements.startStopBtn.textContent = t.startStop;
                elements.startStopBtn.setAttribute('aria-label', streamActive ? 'Stop navigation' : 'Start navigation');
            }
        },
        processFrame: () => processFrame(),
        updateFrameInterval: ({ interval }) => {
            if (settings.audioInterval) {
                cancelAnimationFrame(settings.audioInterval);
                setAudioInterval(requestAnimationFrame(() => processFrame()));
            }
        },
        toggleDebug: ({ show }) => {
            const debug = document.getElementById('debug');
            debug.style.display = show ? 'block' : 'none';
            if (show) {
                debug.querySelector('pre').textContent = `Settings: ${JSON.stringify(settings, null, 2)}\nStream: ${settings.stream ? 'Active' : 'Inactive'}`;
            }
        }
    };

    return {
        dispatchEvent: (eventName, payload) => {
            if (handlers[eventName]) handlers[eventName](payload);
        }
    };
}