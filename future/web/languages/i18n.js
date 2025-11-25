/**
 * i18n.js - Internationalization & Localization Module
 * 
 * Handles language selection, translation loading, caching, and DOM localization.
 * Supports fallback chains and dynamic language switching.
 */

import { structuredLog } from '../utils/logging.js';
// Pre-bundled English fallback to guarantee offline availability
import enUS from './en-US.js';

// Translation cache to avoid redundant fetches
const translationsCache = {};

/**
 * Initialize language subsystem.
 * Sets up default language, loads fallbacks, and marks ready.
 * Call once upfront (e.g., after loadConfigs in main.js).
 * 
 * @param {Object} state - Application state
 * @param {Object} options - Optional configuration
 * @param {Function} options.persist - Callback to persist mutations (e.g., engine.setState)
 * @returns {string} The selected language ID
 * 
 * @example
 * const langId = await initializeLanguage(state, {
 *   persist: (update) => engine.setState(update)
 * });
 */
export async function initializeLanguage(state, options = {}) {
  const persist = typeof options.persist === 'function' ? options.persist : null;
  const settings = state;
  
  try {
    // Determine chosen language: prefer existing → persisted → first available → en-US
    let chosen = settings.language;
    try {
      const persisted = (typeof localStorage !== 'undefined') 
        ? localStorage.getItem('acoustsee.language') 
        : null;
      if (!chosen && persisted && 
          Array.isArray(settings.availableLanguages) && 
          settings.availableLanguages.find(l => l.id === persisted)) {
        chosen = persisted;
        structuredLog('INFO', 'Using persisted language from localStorage', { language: chosen, source: 'localStorage' });
      }
    } catch (e) {
      structuredLog('DEBUG', 'Failed reading persisted language (continuing)', { error: e?.message || String(e) });
    }

    // Fallback to first available
    if (!chosen && Array.isArray(settings.availableLanguages) && settings.availableLanguages.length > 0) {
      chosen = settings.availableLanguages[0].id;
      structuredLog('INFO', 'Using first available language', { language: chosen });
    }

    // Fallback to en-US
    if (!chosen) {
      chosen = 'en-US';
      structuredLog('INFO', 'Using default language en-US');
    }

    // Pre-load translations and mark ready
    settings.language = chosen;
    if (!settings.i18n) settings.i18n = {};
    settings.i18n.ready = true;
    if (!settings.missingTranslations) settings.missingTranslations = [];

    // Preload chosen language
    await preloadTranslations(chosen);

    // Persist if callback provided
    if (persist) persist({ 
      language: settings.language || 'en-US', 
      i18n: settings.i18n, 
      missingTranslations: settings.missingTranslations 
    });

    return settings.language || 'en-US';
  } catch (e) {
    structuredLog('ERROR', 'initializeLanguage failed', { error: e?.message || String(e) });
    settings.language = 'en-US';
    return 'en-US';
  }
}

/**
 * Pre-loads all translation keys into the cache for fast synchronous access.
 * Called when language changes or on app startup.
 * 
 * @param {string} languageId - The language ID to preload (e.g., 'en-US')
 * 
 * @example
 * await preloadTranslations('es-ES');
 */
export async function preloadTranslations(languageId) {
  try {
    const basePath = typeof window !== 'undefined' ? window.__ACOUSTSEE_BASE_PATH__ || './' : './';
    const url = `${basePath}languages/${languageId}.json`;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Failed to load language file: ${response.status}`);
    const translations = await response.json();
    translationsCache[languageId] = translations;
    structuredLog('INFO', 'Translations preloaded', { languageId });
  } catch (err) {
    structuredLog('ERROR', 'Failed to preload translations', { languageId, message: err.message });
  }
}

/**
 * Fetch and format a translated message for the currently selected language.
 * Supports parameter interpolation and fallback chains.
 * 
 * @param {string} key - Translation key (dot-notation, e.g., 'ui.buttons.start')
 * @param {Object} params - Parameters for string interpolation
 * @param {Object} state - Application state
 * @returns {Promise<string>} Translated and formatted message
 * 
 * @example
 * const msg = await getText('ui.alert.objectCount', { count: 5 }, state);
 * // Returns interpolated translation or key as fallback
 */
export async function getText(key, params = {}, state) {
  const settings = state || {};
  const lang = settings.language || 'en-US';
  const missingTranslations = Array.isArray(settings.missingTranslations) ? settings.missingTranslations : [];

  try {
    // Try preloaded cache first
    if (translationsCache[lang]) {
      let node = translationsCache[lang];
      for (const part of key.split('.')) {
        if (!node) break;
        node = node[part];
      }
      if (typeof node === 'object') {
        node = (typeof node.default === 'string') ? node.default : key;
      }
      if (typeof node === 'string') {
        return interpolate(node, params);
      }
    }

    // Fallback to embedded en-US
    if (lang !== 'en-US' && enUS) {
      let node = enUS;
      for (const part of key.split('.')) {
        if (!node) break;
        node = node[part];
      }
      if (typeof node === 'object') {
        node = (typeof node.default === 'string') ? node.default : key;
      }
      if (typeof node === 'string') {
        structuredLog('DEBUG', 'Using fallback en-US translation', { key });
        return interpolate(node, params);
      }
    }

    // Record missing translation
    if (!missingTranslations.includes(key)) {
      missingTranslations.push(key);
      if (missingTranslations.length <= 20) {
        structuredLog('WARN', 'Translation missing', { key, language: lang });
      }
    }
    return key; // Return key as last-resort fallback
  } catch (e) {
    structuredLog('WARN', 'getText failed', { key, language: lang, error: e?.message || String(e) });
    return key;
  }
}

/**
 * Interpolate parameters into a string template.
 * Simple substitution of {{param}} placeholders.
 * 
 * @param {string} template - Template string with {{param}} placeholders
 * @param {Object} params - Parameters to substitute
 * @returns {string} Interpolated string
 * @internal
 */
function interpolate(template, params = {}) {
  if (typeof template !== 'string') return template;
  return template.replace(/{{(\w+)}}/g, (match, key) => {
    return params[key] !== undefined ? String(params[key]) : match;
  });
}

/**
 * Set active language and optionally persist to localStorage.
 * Ensures translations are preloaded into cache.
 * 
 * @param {string} languageId - The language ID to set (e.g., 'es-ES')
 * @param {Object} state - Application state
 * @param {Object} options - Optional configuration
 * @param {boolean} options.persist - Whether to persist to localStorage (default: true)
 * @returns {Promise<string>} The language ID that was set
 * 
 * @example
 * await setLanguage('es-ES', state, { persist: true });
 */
export async function setLanguage(languageId, state, { persist = true } = {}) {
  try {
    const settings = state;
    settings.language = languageId;
    await preloadTranslations(languageId);
    if (persist && typeof localStorage !== 'undefined') {
      try { 
        localStorage.setItem('acoustsee.language', languageId);
        structuredLog('INFO', 'Language persisted to localStorage', { languageId });
      } catch (e) { 
        structuredLog('DEBUG', 'Failed to persist language', { languageId });
      }
    }
    return languageId;
  } catch (e) {
    structuredLog('WARN', 'setLanguage failed', { languageId, error: e?.message || String(e) });
    settings.language = languageId;
    return languageId;
  }
}

/**
 * Translate DOM elements annotated with data-i18n and data-i18n-aria.
 * Fast synchronous path if translations are preloaded.
 * Slow async path as fallback for on-demand translation.
 * 
 * @param {Document|Element} root - Root element to translate (default: document)
 * @param {Object} state - Application state
 * 
 * @example
 * translatePage(document, state);
 * translatePage(document.getElementById('panel'), state);
 */
export function translatePage(root = document, state) {
  try {
    if (!root || typeof root.querySelectorAll !== 'function') return;
    const settings = state;
    const lang = settings.language;
    const translations = translationsCache[lang];

    // Fast path: synchronous lookups if translations preloaded
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

    // Slow path: async resolution for each key
    root.querySelectorAll('[data-i18n]').forEach(el => {
      const key = el.getAttribute('data-i18n');
      if (!key) return;
      getText(key, {}, settings)
        .then(text => { try { el.textContent = text; } catch (e) {} })
        .catch(() => {});
    });
    root.querySelectorAll('[data-i18n-aria]').forEach(el => {
      const key = el.getAttribute('data-i18n-aria');
      if (!key) return;
      getText(key, {}, settings)
        .then(text => { try { el.setAttribute('aria-label', text); } catch (e) {} })
        .catch(() => {});
    });
  } catch (e) {
    structuredLog('WARN', 'translatePage failed', { error: e?.message || String(e) });
  }
}

/**
 * Clears the translations cache to force fresh fetch on next access.
 * Useful for testing or dynamic language pack reloading.
 * 
 * @internal
 */
export function clearTranslationsCache() {
  for (const key in translationsCache) {
    delete translationsCache[key];
  }
  structuredLog('DEBUG', 'Translations cache cleared');
}
