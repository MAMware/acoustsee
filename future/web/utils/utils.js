// File: utils/utils.js

// Module-scoped state for TTS throttling (moved from core/state.js)
let lastTTSTime = 0;
import { structuredLog } from './logging.js';
import { computeAnnounceDelay, deviceSummary } from './performance.js';
// Pre-bundled English fallback to guarantee offline availability for core UI
// NOTE: JSON module import is supported by the bundler; if running in a
// pure-Node environment this may require experimental flags. This import
// is intentionally conservative: it's only used as a last-resort fallback.
import enUS from '../languages/en-US.js';

// Configurable announce rewrite delay (ms). Tune this if you see missed
// announcements on older/slow devices. Default is conservative.
export const ANNOUNCE_REWRITE_DELAY_MS = 150;

/**
 * Initializes language if not set, using available configs.
 * Call this once upfront (e.g., after loadConfigs in main.js) to avoid races.
 * @param {Object} state - The application state object
 * @returns {string} The selected language ID.
 */
// Module-scoped dedupe trackers to avoid flooding logs/analytics on repeat errors
const _reportedMissingKeys = new Set();
let _reportedInitError = false;
let _reportedNotInitialized = false;

/**
 * Initialize language subsystem.
 * @param {Object} state - Shallow copy or live state object.
 * @param {Object} [options]
 * @param {Function} [options.persist] - Callback(partialState) to persist mutations (e.g. engine.setState).
 * @returns {string} chosen language id
 */
export async function initializeLanguage(state, options = {}) {
  const persist = typeof options.persist === 'function' ? options.persist : null;
  const settings = state;
  // Always perform initialization: choose language, preload translations/fallbacks, and mark ready
  try {
    // Determine chosen language: prefer existing, then persisted, then first available, then en-US
    let chosen = settings.language;
    try {
      const persisted = (typeof localStorage !== 'undefined') ? localStorage.getItem('acoustsee.language') : null;
      if (!chosen && persisted && Array.isArray(settings.availableLanguages) && settings.availableLanguages.find(l => l.id === persisted)) {
        chosen = persisted;
        structuredLog('INFO', 'Using persisted language', { language: chosen });
      }
    } catch (e) {
      structuredLog('DEBUG', 'Failed reading persisted language (continuing)', { error: e?.message || String(e) });
    }

    if (!chosen) {
      if (settings.availableLanguages && settings.availableLanguages.length > 0) {
        chosen = settings.availableLanguages[0].id;
        structuredLog('INFO', 'Auto-set language to first available', { language: chosen });
      } else {
        chosen = 'en-US';
        structuredLog('INFO', 'Using ultimate fallback language', { language: chosen });
      }
    }

    settings.language = chosen;
    if (persist) persist({ language: settings.language });

    // Ensure i18n container exists
    if (!settings.i18n) settings.i18n = { ready: false, languageId: chosen };
    settings.i18n.languageId = chosen;
    if (persist) persist({ i18n: settings.i18n });

    // If chosen is bundled en-US, use the pre-bundled object immediately
    if (chosen === 'en-US' && typeof enUS === 'object' && Object.keys(enUS).length > 0) {
      translationsCache['en-US'] = enUS;
      settings.i18n.ready = true;
      structuredLog('DEBUG', 'initializeLanguage: using bundled en-US', { language: 'en-US' });
      // Ensure missingTranslations exists
      if (!Array.isArray(settings.missingTranslations)) settings.missingTranslations = [];
      if (persist) persist({ i18n: settings.i18n, missingTranslations: settings.missingTranslations });
      return chosen;
    }

    // Otherwise attempt to preload translations; mark ready if cache populated
    try {
      await preloadTranslations(chosen);
      settings.i18n.ready = Boolean(translationsCache[chosen]);
      if (settings.i18n.ready) {
        structuredLog('DEBUG', 'initializeLanguage: translations preloaded', { language: chosen });
      } else {
        // If preload didn't populate cache, attempt fallback to bundled en-US
        if (typeof enUS === 'object' && Object.keys(enUS).length > 0) {
          translationsCache['en-US'] = enUS;
          settings.language = 'en-US';
          settings.i18n.languageId = 'en-US';
          settings.i18n.ready = true;
          structuredLog('WARN', 'initializeLanguage: preload failed, fell back to bundled en-US', { attempted: chosen });
        } else {
          settings.i18n.ready = false;
          structuredLog('WARN', 'initializeLanguage: translations not available and no bundled fallback', { attempted: chosen });
        }
      }
    } catch (e) {
      structuredLog('WARN', 'preloadTranslations failed in initializeLanguage', { error: e?.message || String(e), attempted: chosen });
      if (typeof enUS === 'object' && Object.keys(enUS).length > 0) {
        translationsCache['en-US'] = enUS;
        settings.language = 'en-US';
        settings.i18n.languageId = 'en-US';
        settings.i18n.ready = true;
        structuredLog('WARN', 'initializeLanguage: using bundled en-US after preload error', { attempted: chosen });
      } else {
        settings.i18n.ready = false;
      }
    }

    // Ensure missingTranslations container exists for dev visibility
    if (!Array.isArray(settings.missingTranslations)) settings.missingTranslations = [];
    if (persist) persist({ language: settings.language, i18n: settings.i18n, missingTranslations: settings.missingTranslations });
    return settings.language;
  } catch (err) {
    structuredLog('ERROR', 'initializeLanguage failed', { error: err?.message || String(err) });
    if (!settings.i18n) settings.i18n = { ready: false, languageId: settings.language || 'en-US' };
    if (!Array.isArray(settings.missingTranslations)) settings.missingTranslations = [];
    if (persist) persist({ language: settings.language || 'en-US', i18n: settings.i18n, missingTranslations: settings.missingTranslations });
    return settings.language || 'en-US';
  }
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
  // Error codes used for structured logging/analytics
  const I18N_INIT_ERROR = 'I18N_INIT_ERROR';
  const I18N_STATE_MISSING = 'I18N_STATE_MISSING';
  const I18N_KEY_MISSING = 'I18N_KEY_MISSING';
  const I18N_FETCH_ERROR = 'I18N_FETCH_ERROR';

  try {
    // Defensive: ensure caller passed the state object
    if (!state || typeof state !== 'object') {
      structuredLog('ERROR', I18N_STATE_MISSING, { message: 'getText called without state', key, params });
      // Developer error — return visible missing indicator
      return `[missing:${key}]`;
    }

    const settings = state;
    // Fail-fast: if i18n is not initialized, do not attempt lazy loads — log once and return fallback
    if (!settings.i18n || settings.i18n.ready !== true) {
      if (!_reportedNotInitialized) {
        structuredLog('ERROR', 'I18N_NOT_INITIALIZED', { message: 'i18n not initialized before getText', key, language: settings.language });
        _reportedNotInitialized = true;
      }
      // Record missingTranslations for dev visibility
      if (!Array.isArray(settings.missingTranslations)) settings.missingTranslations = [];
      if (!settings.missingTranslations.includes(key)) settings.missingTranslations.push(key);
      return `[missing:${key}]`;
    }
    // Ensure availableLanguages exists
    if (!settings.availableLanguages || !Array.isArray(settings.availableLanguages) || settings.availableLanguages.length === 0) {
      if (!_reportedInitError) {
        structuredLog('ERROR', I18N_INIT_ERROR, { message: 'availableLanguages missing on state', key, params });
        _reportedInitError = true;
      }
      // Attempt to set a safe fallback language and continue
      settings.language = settings.availableLanguages && settings.availableLanguages[0] ? settings.availableLanguages[0].id : 'en-US';
    }

    const languageId = settings.language || (settings.availableLanguages && settings.availableLanguages[0] && settings.availableLanguages[0].id) || 'en-US';
    if (!settings.language) {
      structuredLog('WARN', I18N_INIT_ERROR, { message: 'Language not set; defaulting', defaultLanguage: languageId, key });
      settings.language = languageId;
    }

    const language = (settings.availableLanguages || []).find(l => l.id === languageId) || { id: languageId };

    // Try cache first
    let translations = translationsCache[language.id];
    if (!translations) {
      // If this is the bundled English, use the pre-bundled object
      if (language.id === 'en-US' && typeof enUS === 'object' && Object.keys(enUS).length > 0) {
        translations = enUS;
        translationsCache['en-US'] = translations;
        structuredLog('DEBUG', 'Using bundled en-US translations', { languageId });
      } else {
        // Fetch language file from server
        try {
          const basePath = typeof window !== 'undefined' ? window.__ACOUSTSEE_BASE_PATH__ || './' : './';
          const url = `${basePath}languages/${language.id}.json`;
          structuredLog('DEBUG', 'Translation fetch URL', { url, basePath });
          const response = await fetch(url);
          if (!response.ok) throw new Error(`Failed to load language file: ${response.status}`);
          translations = await response.json();
          translationsCache[language.id] = translations;
          structuredLog('DEBUG', 'Translations loaded successfully', { languageId, keys: Object.keys(translations).length });
        } catch (fetchErr) {
          structuredLog('ERROR', I18N_FETCH_ERROR, { message: fetchErr.message, key, languageId });
          // Return visible missing indicator rather than raw key
          // and record missing translation on state for dev visibility
          if (!Array.isArray(settings.missingTranslations)) settings.missingTranslations = [];
          if (!settings.missingTranslations.includes(key)) settings.missingTranslations.push(key);
          return `[missing:${key}]`;
        }
      }
    }

    // Walk the translation tree according to dot-notated key
    let finalMessage = translations;
    for (const part of key.split('.')) {
      if (!finalMessage || typeof finalMessage !== 'object') {
        finalMessage = undefined;
        break;
      }
      finalMessage = finalMessage[part];
    }

    // If finalMessage resolves to an object, attempt a default property
    if (typeof finalMessage === 'object') {
      finalMessage = (typeof finalMessage.default === 'string') ? finalMessage.default : undefined;
    }

    // If missing, record and return visible indicator
    if (typeof finalMessage !== 'string') {
      // Only log/emit analytics for the first occurrence of a missing key to avoid spam
      if (!_reportedMissingKeys.has(key)) {
        structuredLog('INFO', I18N_KEY_MISSING, { key, languageId });
        _reportedMissingKeys.add(key);
      } else {
        // For subsequent occurrences, log at debug level to preserve some telemetry without flooding
        structuredLog('DEBUG', 'I18N_KEY_MISSING_DUP', { key, languageId });
      }
      if (!Array.isArray(settings.missingTranslations)) settings.missingTranslations = [];
      if (!settings.missingTranslations.includes(key)) settings.missingTranslations.push(key);
      return `[missing:${key}]`;
    }

    // Replace placeholders safely
    for (const [paramKey, paramValue] of Object.entries(params)) {
      finalMessage = finalMessage.split(`{${paramKey}}`).join(String(paramValue));
    }

    return finalMessage;
  } catch (err) {
    structuredLog('ERROR', 'getText error', { message: err?.message || String(err), key, params });
    return `[missing:${key}]`;
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
      // Ensure we pass the current state so getText has the context it needs
      getText(key, {}, settings).then(text => { el.textContent = text; }).catch(() => {});
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (!key) return;
      getText(key, {}, settings).then(text => { el.setAttribute('aria-label', text); }).catch(() => {});
    });
  } catch (e) {
    structuredLog('WARN', 'translatePage failed', { error: e?.message || String(e) });
  }
}