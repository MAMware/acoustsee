/**
 * Utility functions for UI interactions.
 */
import { settings } from '../state.js';

/**
 * Fetches translations from a JSON file based on the current language.
 * @param {string} lang - Language code (e.g., 'en-US', 'es-ES').
 * @returns {Promise<Object>} Translation object.
 */
async function loadTranslations(lang) {
    try {
        const response = await fetch(`./languages/${lang}.json`);
        if (!response.ok) throw new Error(`Failed to load ${lang} translations`);
        return await response.json();
    } catch (error) {
        console.error('Translation load failed:', error);
        return {}; // Fallback to empty translations
    }
}

/**
 * Speaks a message using Web Speech API based on element ID and state.
 * @param {string} elementId - ID of the element triggering the speech.
 * @param {Object} [state] - Optional state for dynamic messages.
 */
export async function speak(elementId, state = {}) {
    const lang = settings.language || 'en-US';
    const translations = await loadTranslations(lang);
    let message = translations[elementId] || '';
    
    // Fallback message if translation is missing
    if (!message) {
        message = elementId; // Use elementId as fallback
        console.warn(`No translation found for ${elementId} in ${lang}`);
    }

    if (message) {
        // Replace placeholders with state values
        let finalMessage = message;
        for (const [key, value] of Object.entries(state)) {
            // Map state values to human-readable text
            if (key === 'state') {
                if (elementId === 'settingsToggle') {
                    finalMessage = finalMessage.replace(`{${key}}`, value === 'on' ? (lang === 'en-US' ? 'enabled' : 'activadas') : (lang === 'en-US' ? 'disabled' : 'desactivadas'));
                } else if (elementId === 'startStop') {
                    finalMessage = finalMessage.replace(`{${key}}`, value === 'started' ? (lang === 'en-US' ? 'started' : 'iniciada') : (lang === 'en-US' ? 'stopped' : 'detenida'));
                }
            } else if (key === 'mode') {
                finalMessage = finalMessage.replace(`{${key}}`, value === 'day' ? (lang === 'en-US' ? 'day' : 'día') : (lang === 'en-US' ? 'night' : 'noche'));
            } else if (key === 'grid') {
                finalMessage = finalMessage.replace(`{${key}}`, value === 'hex-tonnetz' ? (lang === 'en-US' ? 'hexagonal tonnetz' : 'tonnetz hexagonal') : (lang === 'en-US' ? 'circle of fifths' : 'círculo de quintas'));
            } else if (key === 'engine') {
                finalMessage = finalMessage.replace(`{${key}}`, value === 'sine-wave' ? (lang === 'en-US' ? 'sine wave' : 'onda sinusoidal') : (lang === 'en-US' ? 'FM synthesis' : 'síntesis FM'));
            } else if (key === 'lang') {
                finalMessage = finalMessage.replace(`{${key}}`, value === 'en-US' ? (lang === 'en-US' ? 'English' : 'inglés') : (lang === 'en-US' ? 'Spanish' : 'español'));
            } else {
                finalMessage = finalMessage.replace(`{${key}}`, value);
            }
        }
        const utterance = new SpeechSynthesisUtterance(finalMessage);
        utterance.lang = lang;
        window.speechSynthesis.speak(utterance);
    }
}
