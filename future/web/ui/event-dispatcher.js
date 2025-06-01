import { settings, setAudioInterval } from '../state.js';
import { processFrame } from './frame-processor.js';

export function createEventDispatcher() {
    const errorLog = [];
    const maxErrors = 10;

    const translations = {
        'en-US': {
            settingsToggle: { true: 'Exit Settings', false: 'Settings' },
            modeBtn: { true: 'Select Grid', false: 'Daylight' },
            languageBtn: { true: 'Select Synthesis', false: 'Language' },
            startStop: { true: 'Stop', false: 'Start' },
            gridSelect: { 'hex-tonnetz': 'Hexagonal Tonnetz', 'circle-of-fifths': 'Circle of Fifths' },
            synthesisSelect: { 'sine-wave': 'Sine Wave', 'fm-synthesis': 'FM Synthesis' },
            languageSelect: { 'en-US': 'English', 'es-ES': 'Spanish' }
        },
        'es-ES': {
            settingsToggle: { true: 'Salir de Configuraciones', false: 'Configuraciones' },
            modeBtn: { true: 'Seleccionar Cuadrícula', false: 'Luz del Día' },
            languageBtn: { true: 'Seleccionar Síntesis', false: 'Idioma' },
            startStop: { true: 'Detener', false: 'Iniciar' },
            gridSelect: { 'hex-tonnetz': 'Tonnetz Hexagonal', 'circle-of-fifths': 'Círculo de Quintas' },
            synthesisSelect: { 'sine-wave': 'Onda Sinusoidal', 'fm-synthesis': 'Síntesis FM' },
            languageSelect: { 'en-US': 'Inglés', 'es-ES': 'Español' }
        }
    };

    const handlers = {
        updateUI: ({ settingsMode, streamActive }) => {
            const t = translations[settings.language || 'en-US'];
            const elements = {
                settingsToggle: document.getElementById('settingsToggle'),
                modeBtn: document.getElementById('modeBtn'),
                languageBtn: document.getElementById('languageBtn'),
                startStopBtn: document.getElementById('startStopBtn')
            };
            if (elements.settingsToggle) {
                elements.settingsToggle.textContent = t.settingsToggle[settingsMode];
                elements.settingsToggle.setAttribute('aria-label', settingsMode ? 'Exit settings mode' : 'Toggle settings mode');
            }
            if (elements.modeBtn) {
                elements.modeBtn.textContent = settingsMode ? t.gridSelect[settings.gridType] : t.modeBtn[settingsMode];
                elements.modeBtn.setAttribute('aria-label', settingsMode ? `Select grid: ${t.gridSelect[settings.gridType]}` : 'Toggle day/night mode');
            }
            if (elements.languageBtn) {
                elements.languageBtn.textContent = settingsMode ? t.synthesisSelect[settings.synthesisEngine] : t.languageSelect[settings.language || 'en-US'];
                elements.languageBtn.setAttribute('aria-label', settingsMode ? `Select synthesis: ${t.synthesisSelect[settings.synthesisEngine]}` : 'Cycle language');
            }
            if (elements.startStopBtn) {
                elements.startStopBtn.textContent = t.startStop[!!settings.stream];
                elements.startStopBtn.setAttribute('aria-label', !!settings.stream ? 'Stop navigation' : 'Start navigation');
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
                const debugText = `Settings: ${JSON.stringify(settings, null, 2)}\nStream: ${settings.stream ? 'Active' : 'Inactive'}\nErrors:\n${errorLog.length ? errorLog.join('\n') : 'None'}`;
                debug.querySelector('pre').textContent = debugText;
            }
        },
        logError: ({ message }) => {
            errorLog.push(`${new Date().toISOString()}: ${message}`);
            if (errorLog.length > maxErrors) errorLog.shift();
            if (document.getElementById('debug').style.display === 'block') {
                handlers.toggleDebug({ show: true });
            }
            localStorage.setItem('acoustsee_errors', JSON.stringify(errorLog));
        }
    };

    window.onerror = (message, source, lineno, colno, error) => {
        handlers.logError({ message: `${message} at ${source}:${lineno}:${colno}` });
    };

    return {
        dispatchEvent: (eventName, payload) => {
            if (handlers[eventName]) handlers[eventName](payload);
        }
    };
}