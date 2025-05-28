/**
 * Utility functions for UI interactions.
 */
import { settings } from '../state.js';

/**
 * Speaks a message using Web Speech API based on element ID and state.
 * @param {string} elementId - ID of the element triggering the speech.
 * @param {Object} [state] - Optional state for dynamic messages.
 */
export function speak(elementId, state = {}) {
    const translations = {
        'en-US': {
            settingsToggle: `Settings ${state.state === 'on' ? 'enabled' : 'disabled'}`,
            modeBtn: `Mode set to ${state.mode || 'day'}`,
            gridSelect: `Grid set to ${state.grid === 'hex-tonnetz' ? 'hexagonal tonnetz' : 'circle of fifths'}`,
            synthesisSelect: `Synthesis set to ${state.engine === 'sine-wave' ? 'sine wave' : 'FM synthesis'}`,
            languageSelect: `Language set to ${state.lang === 'en-US' ? 'English' : 'Spanish'}`,
            startStop: `Navigation ${state.state || 'started'}`,
            cameraError: 'Failed to access camera'
        },
        'es-ES': {
            settingsToggle: `Configuraciones ${state.state === 'on' ? 'activadas' : 'desactivadas'}`,
            modeBtn: `Modo establecido en ${state.mode === 'day' ? 'día' : 'noche'}`,
            gridSelect: `Cuadrícula establecida en ${state.grid === 'hex-tonnetz' ? 'tonnetz hexagonal' : 'círculo de quintas'}`,
            synthesisSelect: `Síntesis establecida en ${state.engine === 'sine-wave' ? 'onda sinusoidal' : 'síntesis FM'}`,
            languageSelect: `Idioma establecido en ${state.lang === 'en-US' ? 'inglés' : 'español'}`,
            startStop: `Navegación ${state.state === 'started' ? 'iniciada' : 'detenida'}`,
            cameraError: 'No se pudo acceder a la cámara'
        }
    };
    const lang = settings.language || 'en-US';
    const message = translations[lang][elementId] || '';
    if (message) {
        const utterance = new SpeechSynthesisUtterance(message);
        utterance.lang = lang;
        window.speechSynthesis.speak(utterance);
    }
}
