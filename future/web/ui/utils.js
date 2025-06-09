import { settings } from '../state.js';
import { getDispatchEvent } from '../context.js';

let translationCache = {};

async function loadTranslations(lang) {
  if (translationCache[lang]) {
    console.log(`Using cached translations for ${lang}`);
    return translationCache[lang];
  }

  try {
    console.log(`Fetching translations for ${lang}`);
    const response = await fetch(`../languages/${lang}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load ${lang} translations: ${response.status}`);
    }
    const translations = await response.json();
    translationCache[lang] = translations;
    console.log(`Translations loaded for ${lang}`);
    return translations;
  } catch (error) {
    console.error('Translation load failed:', error.message);
    const dispatchEvent = getDispatchEvent();
    dispatchEvent('logError', { message: `Translation load failed for ${lang}: ${error.message}` });
    return {};
  }
}

export async function speak(elementId, state = {}) {
  const lang = settings.language || 'en-US';
  const translations = await loadTranslations(lang);
  let message = translations[elementId] || elementId;

  if (!message) {
    message = elementId;
    console.warn(`No translation found for ${elementId} in ${lang}`);
  }

  if (message) {
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
    console.log(`Speaking: ${finalMessage} in ${lang}`);
    try {
      if ('speechSynthesis' in window) {
        const utterance = new SpeechSynthesisUtterance(finalMessage);
        utterance.lang = lang;
        utterance.volume = 1.0;
        utterance.rate = 1.0;
        window.speechSynthesis.speak(utterance);
      } else {
        console.warn('Speech synthesis not supported');
        const dispatchEvent = getDispatchEvent();
        dispatchEvent('logError', { message: 'Speech synthesis not supported' });
      }
    } catch (error) {
      console.error('Speech synthesis error:', error.message);
      const dispatchEvent = getDispatchEvent();
      dispatchEvent('logError', { message: `Speech synthesis error: ${error.message}` });
    }
  }
}
