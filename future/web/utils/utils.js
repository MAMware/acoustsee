import { TTS_COOLDOWN_MS } from '../core/constants.js';
import { settings, lastTTSTime } from '../core/state.js';
import { structuredLog } from './logging.js';
import { computeAnnounceDelay, deviceSummary } from './performance.js';

// Configurable announce rewrite delay (ms). Tune this if you see missed
// announcements on older/slow devices. Default is conservative.
export const ANNOUNCE_REWRITE_DELAY_MS = 150;

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

  // Preload translations for the selected language
  preloadTranslations(settings.language);

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
 * Fetches and formats a translated message. No DOM or TTS side-effects.
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
 * Speaks the message via TTS if enabled, enforcing a 3-second cooldown.
 * @param {string} message - Message to speak.
 * @param {string} [type='tts'] - Type (for logging).
 */
export function speakText(message, type = 'tts') {
  if (type === 'tts' && settings.ttsEnabled) {
    const now = Date.now();
    if (now - lastTTSTime < TTS_COOLDOWN_MS) { 
    structuredLog('INFO', 'TTS cooldown active, speech skipped.', { message, lastTTSTime, now });
    return;
  }
    lastTTSTime = now;
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
  const announcements = typeof document !== 'undefined' && document.getElementById ? document.getElementById('announcements') : null;
  // Compute a conservative delay based on central device heuristics.
  const delay = computeAnnounceDelay(ANNOUNCE_REWRITE_DELAY_MS);

  if (announcements) {
    // Clear then re-set to force some screen readers to re-announce identical messages
    try { announcements.textContent = ''; } catch (e) { /* ignore DOM errors */ }
    // Small async tick before setting text to ensure AT detects the change
    setTimeout(() => { try { announcements.textContent = message; } catch (e) {} }, delay);

    // Optional visible debug toast for manual testing on devices when debugLogging is enabled
    try {
      if (settings?.debugLogging) {
        const toast = document.createElement('div');
        toast.id = 'announce-toast';
        toast.textContent = message;
        Object.assign(toast.style, {
          position: 'fixed',
          bottom: '8%',
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'rgba(0,0,0,0.75)',
          color: '#fff',
          padding: '8px 12px',
          borderRadius: '6px',
          zIndex: 99999,
          fontSize: '14px',
          pointerEvents: 'none',
        });
        document.body.appendChild(toast);
        setTimeout(() => { try { toast.remove(); } catch (e) {} }, 2500);
      }
    } catch (e) { /* ignore toast errors */ }
  } else {
    // Fallback for non-DOM environments
    structuredLog('INFO', 'announceMessage (fallback):', { message });
    if (typeof console !== 'undefined') console.log('Announcement:', message);
  }
}

/**
 * Pre-loads all translation keys into the cache when the language changes.
 */
export async function preloadTranslations(languageId) {
  try {
    const response = await fetch(`./languages/${languageId}.json`);
    if (!response.ok) throw new Error(`Failed to load language file: ${response.status}`);
    const translations = await response.json();
    translationsCache[languageId] = translations;
  } catch (err) {
    structuredLog('ERROR', 'Failed to preload translations', { languageId, message: err.message });
  }
}