// File: utils/utils.js

// Module-scoped state for TTS throttling (moved from core/state.js)
let lastTTSTime = 0;
import { structuredLog } from './logging.js';
import { computeAnnounceDelay, deviceSummary } from './performance.js';

// Configurable announce rewrite delay (ms). Tune this if you see missed
// announcements on older/slow devices. Default is conservative.
export const ANNOUNCE_REWRITE_DELAY_MS = 150;

/**
 * Initializes language if not set, using available configs.
 * Call this once upfront (e.g., after loadConfigs in main.js) to avoid races.
 * @param {Object} state - The application state object
 * @returns {string} The selected language ID.
 */
export function initializeLanguageIfNeeded(state) {
  const settings = state;
  if (!settings.language) {
    structuredLog('WARN', 'Language not initialized; attempting persisted or default');
    // Try persisted user selection first
    try {
      const persisted = (typeof localStorage !== 'undefined') ? localStorage.getItem('acoustsee.language') : null;
      if (persisted && Array.isArray(settings.availableLanguages) && settings.availableLanguages.find(l => l.id === persisted)) {
        settings.language = persisted;
        structuredLog('INFO', 'Using persisted language', { language: settings.language });
      } else if (settings.availableLanguages && settings.availableLanguages.length > 0) {
        settings.language = settings.availableLanguages[0].id;
        structuredLog('INFO', 'Auto-set language to first available', { language: settings.language });
      } else {
        // Fallback to ultimate default
        settings.language = 'en-US';
        structuredLog('INFO', 'Using ultimate fallback language', { language: settings.language });
      }
    } catch (e) {
      structuredLog('WARN', 'Error reading persisted language; falling back', { error: e?.message || String(e) });
      settings.language = settings.availableLanguages && settings.availableLanguages[0] ? settings.availableLanguages[0].id : 'en-US';
    }
  }

  // Preload translations for the selected language (best-effort)
  try { preloadTranslations(settings.language); } catch (e) { structuredLog('WARN', 'preloadTranslations failed in init', { error: e?.message || String(e) }); }

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
 * Fetch and format a translated message for the currently selected language.
 * This is a pure lookup/format operation (it does network fetches when the
 * language file is not cached) and does not perform any DOM updates or TTS.
 *
 * Contract:
 * - key: dot-notated translation key (e.g. 'powerOn.text').
 * - params: substitution parameters for placeholders in the translation.
 * - state: The application state object (for language settings).
 *
 * Error modes:
 * - If the language file cannot be fetched the function returns the original
 *   key (caller may choose to fallback). It will also log the error.
 * - Throws only on unexpected internal errors to allow callers to implement
 *   custom fallback strategies.
 *
 * @param {string} key - Translation key (dot-notated).
 * @param {Object} [params={}] - Params for placeholder replacement.
 * @param {Object} state - The application state object.
 * @returns {Promise<string>} The formatted message, or key on failure.
 */
export async function getText(key, params = {}, state) {
  try {
    const settings = state;
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
        const basePath = typeof window !== 'undefined' ? window.__ACOUSTSEE_BASE_PATH__ || './' : './';
        const url = `${basePath}languages/${language.id}.json`;
        const response = await fetch(url);
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
 * @param {Object} state - The application state object.
 */
/**
 * speakText(state, message, type = 'tts')
 * Note: signature changed to accept `state` as the first argument to avoid importing core constants.
 */
export function speakText(state, message, type = 'tts') {
  const settings = state || {};
  if (type === 'tts' && settings.ttsEnabled) {
    const now = Date.now();
    const cooldown = settings.settings?.ttsCooldownMs || settings.ttsCooldownMs || 3000;
    if (now - lastTTSTime < cooldown) {
      structuredLog('INFO', 'TTS cooldown active, speech skipped.', { message, lastTTSTime, now, cooldown });
      return;
    }
    lastTTSTime = now;
    try {
      const utterance = new SpeechSynthesisUtterance(message);
      utterance.lang = settings.language;
      window.speechSynthesis.speak(utterance);
    } catch (e) {
      structuredLog('WARN', 'TTS speak failed', { error: e?.message || String(e) });
    }
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
    const basePath = typeof window !== 'undefined' ? window.__ACOUSTSEE_BASE_PATH__ || './' : './';
    const url = `${basePath}languages/${languageId}.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load language file: ${response.status}`);
    const translations = await response.json();
    translationsCache[languageId] = translations;
  } catch (err) {
    structuredLog('ERROR', 'Failed to preload translations', { languageId, message: err.message });
  }
}

/**
 * Set active language and optionally persist to localStorage.
 * Ensures translations are preloaded into cache.
 * @param {string} languageId - The language ID to set.
 * @param {Object} state - The application state object.
 * @param {Object} [options] - Optional configuration.
 * @param {boolean} [options.persist=true] - Whether to persist to localStorage.
 */
export async function setLanguage(languageId, state, { persist = true } = {}) {
  try {
    const settings = state;
    settings.language = languageId;
    await preloadTranslations(languageId);
    if (persist && typeof localStorage !== 'undefined') {
      try { localStorage.setItem('acoustsee.language', languageId); } catch (e) { /* ignore storage failures */ }
    }
    return languageId;
  } catch (e) {
    structuredLog('WARN', 'setLanguage failed', { languageId, error: e?.message || String(e) });
    // Still set the language variable for app logic
    settings.language = languageId;
    return languageId;
  }
}

/**
 * Translate DOM elements annotated with data-i18n and data-i18n-aria.
 * @param {Document|Element} root - The root element to translate.
 * @param {Object} state - The application state object.
 */
export function translatePage(root = document, state) {
  try {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const settings = state;
    const lang = settings.language;
    const translations = translationsCache[lang];

    // Fast path: if translations are preloaded use synchronous lookups
    if (translations) {
      const lookup = (key) => {
        let node = translations;
        for (const part of key.split('.')) {
          if (!node) return key;
          node = node[part];
        }
        if (typeof node === 'object') return (typeof node.default === 'string') ? node.default : key;
        return (typeof node === 'string') ? node : key;
      };

      root.querySelectorAll('[data-i18n]').forEach(el => {
        const key = el.getAttribute('data-i18n');
        if (!key) return;
        try { el.textContent = lookup(key); } catch (e) { /* ignore element errors */ }
      });

      root.querySelectorAll('[data-i18n-aria]').forEach(el => {
        const key = el.getAttribute('data-i18n-aria');
        if (!key) return;
        try { el.setAttribute('aria-label', lookup(key)); } catch (e) { /* ignore */ }
      });

      return;
    }

    // Slow path: translations not loaded — fall back to per-key async resolution
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      getText(key).then(text => { el.textContent = text; }).catch(() => {});
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (!key) return;
      getText(key).then(text => { el.setAttribute('aria-label', text); }).catch(() => {});
    });
  } catch (e) {
    structuredLog('WARN', 'translatePage failed', { error: e?.message || String(e) });
  }
}