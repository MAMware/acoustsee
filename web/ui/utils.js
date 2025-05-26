import { settings } from '../state.js';

/**
 * Loads translations from a JSON file based on language code.
 * @param {string} lang - Language code (e.g., 'en-US', 'es-ES').
 * @returns {Promise<Object>} Translations object.
 */
async function loadTranslations(lang) {
    try {
        const response = await fetch(`languages/${lang}.json`);
        if (!response.ok) throw new Error(`Failed to load ${lang}.json`);
        return await response.json();
    } catch (error) {
        console.error('Translation load error:', error);
        return {}; // Fallback to empty object
    }
}

/**
 * Speaks text using the Web Speech API with translated strings.
 * @param {string} key - Translation key (e.g., 'settingsToggle').
 * @param {Object} [params={}] - Parameters to replace in the translation (e.g., { state: 'on' }).
 */
export async function speak(key, params = {}) {
    if (!window.speechSynthesis) return;
    
    const translations = await loadTranslations(settings.language || 'en-US');
    let text = translations[key] || key;
    for (const [param, value] of Object.entries(params)) {
        text = text.replace(`{${param}}`, value);
    }
    
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = settings.language || 'en-US';
    window.speechSynthesis.speak(utterance);
}
