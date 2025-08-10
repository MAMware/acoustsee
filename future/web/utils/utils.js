import { settings } from '../core/state.js';
import { structuredLog } from './logging.js';

/**
 * Initializes language if not set, using available configs.
 * Call this once upfront (e.g., after loadConfigs in main.js) to avoid races.
 * @returns {string} The selected language ID.
 */
export function initializeLanguageIfNeeded() {
  if (!settings.language) {
    structuredLog('WARN', 'Language not initialized; setting default');
    if (settings.availableLanguages.length === 0) {
      // Configs likely not loaded; use ultimate fallback (assumes loadConfigs awaited upstream)
      settings.language = 'en-US';
      structuredLog('INFO', 'Using ultimate fallback language', { language: settings.language });
    } else {
      settings.language = settings.availableLanguages[0].id;
      structuredLog('INFO', 'Auto-set language to first available', { language: settings.language });
    }
  }
  return settings.language;
}

export function hapticCount(count) {
  if (navigator.vibrate) {
    const pattern = Array(count * 2 - 1).fill(30).map((v, i) => i % 2 === 0 ? 30 : 50);
    navigator.vibrate(pattern);
  }
}

const translationsCache = {};
/**
 * Clears the translations cache to force fresh fetch on next getText call.
 */
export function clearTranslationsCache() {
  for (const key in translationsCache) {
    delete translationsCache[key];
  }
}

/**
 * Fetches and formats a translated message. No DOM/TTS side-effects—callers handle those.
 * @param {string} key - Translation key (dot-notated).
 * @param {Object} [params={}] - Params for placeholder replacement.
 * @returns {Promise<string>} The formatted message, or key on failure.
 */
export async function getText(key, params = {}) {
  try {
    const languageId = settings.language;
    if (!languageId) {
      throw new Error('Language not set; call initializeLanguageIfNeeded first');
    }

    const language = settings.availableLanguages.find(l => l.id === languageId);
    if (!language) {
      structuredLog('ERROR', 'Language not found', {
        requestedLanguage: languageId,
        availableLanguages: settings.availableLanguages.map(l => l.id),
        key
      });
      return key; // No fallback mutation—caller decides
    }

    let translations = translationsCache[language.id];
    if (!translations) {
      // Log cache miss and fetching fresh translations
      structuredLog('DEBUG', 'Fetching fresh translations for language', { languageId });
      try {
        const response = await fetch(`./languages/${language.id}.json`);
        if (!response.ok) throw new Error(`Failed to load language file: ${response.status}`);
        translations = await response.json();
        translationsCache[language.id] = translations;
      } catch (fetchErr) {
        structuredLog('ERROR', 'Language file fetch error', { message: fetchErr.message, key });
        return key; // Fallback on network/parse error
      }
    }

    let finalMessage = translations;
    for (const part of key.split('.')) {
      finalMessage = finalMessage[part] || key;
    }
    if (typeof finalMessage === 'object') {
      finalMessage = finalMessage[params.state || params.fps || params.lang] || key;
    }

    // Safer placeholder replacement (exact match to avoid partial brace issues)
    for (const [paramKey, paramValue] of Object.entries(params)) {
      finalMessage = finalMessage.replaceAll(`{${paramKey}}`, paramValue);
    }

    return finalMessage;
  } catch (err) {
    structuredLog('ERROR', 'getText error', { message: err.message, key, params });
    throw err; // Rethrow for callers to handle (e.g., fallback or announce)
  }
}

/**
 * Speaks the message via TTS if enabled.
 * @param {string} message - Message to speak.
 * @param {string} [type='tts'] - Type (for logging).
 */
export function speakText(message, type = 'tts') {
  if (type === 'tts' && settings.ttsEnabled) {
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = settings.language;
    window.speechSynthesis.speak(utterance);
  }
}

/**
 * Updates the announcements element with a message.
 * @param {string} message - Message to announce.
 */
export function announceMessage(message) {
  const announcements = document.getElementById('announcements');
  if (announcements) {
    announcements.textContent = message;
  }
}