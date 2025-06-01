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
    const response = await fetch(`./languages/${lang}.json`);
    if (!response.ok) throw new Error(`Failed to load ${lang} translations`);
    return response.json();
}

/**
 * Speaks a message using Web Speech API based on element ID and state.
 * @param {string} elementId - ID of the element triggering the speech.
 * @param {Object} [state] - Optional state for dynamic messages.
 */
export function speak(elementId, state = {}) {
    let translations = {};
    try {
        translations = loadTranslations(settings.language || 'en-US');
    } catch (error) {
        console.error('Translation load failed:', error);
        return; // Fallback to silence if JSON fails
    }

    const message = translations[elementId] || '';
    if (message) {
        // Replace placeholders with state values
        let finalMessage = message;
        for (const [key, value] of Object.entries(state)) {
            finalMessage = finalMessage.replace(`{${key}}`, value);
        }
        const utterance = new SpeechSynthesisUtterance(finalMessage);
        utterance.lang = settings.language || 'en-US';
        window.speechSynthesis.speak(utterance);
    }
}