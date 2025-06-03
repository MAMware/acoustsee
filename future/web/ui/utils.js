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
        console.log(`Attempting to load translations for ${lang}`); // Debug log
        const response = await fetch(`../web/languages/${lang}.json`);
        if (!response.ok) {
            throw new Error(`Failed to load ${lang} translations: ${response.status}`);
        }
        const translations = await response.json();
        console.log(`Translations loaded for ${lang}:`, translations); // Debug log
        return translations;
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
    let message = translations[elementId] || elementId;

    // Fallback message if translation is missing
    if (!message) {
        message = elementId; // Use elementId as fallback
        console.warn(`No translation found for ${elementId} in ${lang}`);
    }

    if (message) {
        // Replace placeholders with state values (uses replaceAll for all occurrences)
        let finalMessage = message;
        for (const [key, value] of Object.entries(state)) {
            if (key === 'state') {
                if (elementId === 'emailDebug') {
                    finalMessage = finalMessage.replaceAll(`{${key}}`, value === 'sent' ? (lang === 'en-US' ? 'sent' : 'enviado') : value);
                } else if (elementId === 'settingsToggle') {
                    finalMessage = finalMessage.replaceAll(`{${key}}`, value === 'on' ? (lang === 'en-US' ? 'enabled' : 'activadas') : (lang === 'en-US' ? 'disabled' : 'desactivadas'));
                } else if (elementId === 'startStop') {
                    finalMessage = finalMessage.replaceAll(`{${key}}`, value === 'started' ? (lang === 'en-US' ? 'started' : 'iniciada') : (lang === 'en-US' ? 'stopped' : 'detenida'));
                } else {
                    finalMessage = finalMessage.replaceAll(`{${key}}`, value);
                }
            } else if (key === 'mode') {
                finalMessage = finalMessage.replaceAll(`{${key}}`, value === 'day' ? (lang === 'en-US' ? 'day' : 'día') : (lang === 'en-US' ? 'night' : 'noche'));
            } else if (key === 'grid') {
                finalMessage = finalMessage.replaceAll(`{${key}}`, value === 'hex-tonnetz' ? (lang === 'en-US' ? 'hexagonal tonnetz' : 'tonnetz hexagonal') : (lang === 'en-US' ? 'circle of fifths' : 'círculo de quintas'));
            } else if (key === 'engine') {
                finalMessage = finalMessage.replaceAll(`{${key}}`, value === 'sine-wave' ? (lang === 'en-US' ? 'sine wave' : 'onda sinusoidal') : (lang === 'en-US' ? 'FM synthesis' : 'síntesis FM'));
            } else if (key === 'lang') {
                finalMessage = finalMessage.replaceAll(`{${key}}`, value === 'en-US' ? (lang === 'en-US' ? 'English' : 'inglés') : (lang === 'en-US' ? 'Spanish' : 'español'));
            } else {
                finalMessage = finalMessage.replaceAll(`{${key}}`, value);
            }
        }
        console.log(`Attempting to speak: ${finalMessage} in ${lang}`); // Debug log
        try {
            if ('speechSynthesis' in window) {
                const utterance = new SpeechSynthesisUtterance(finalMessage);
                utterance.lang = lang;
                utterance.volume = 1.0; // Maximum volume
                utterance.rate = 1.0;   // Normal speaking rate
                window.speechSynthesis.speak(utterance);
            } else {
                console.warn('Speech synthesis not supported in this browser.');
            }
        } catch (error) {
            console.error('Speech synthesis error:', error);
        }
    }
}
