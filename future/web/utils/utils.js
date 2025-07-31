import { settings } from '../core/state.js';
import { structuredLog } from './logging.js';

export function tryVibrate(event) {
  if (event.cancelable && navigator.vibrate) {
    try {
      navigator.vibrate(50);
    } catch (err) {
      console.warn('Vibration blocked:', err.message);
    }
  }
}

export function hapticCount(count) {
  if (navigator.vibrate) {
    const pattern = Array(count * 2 - 1).fill(30).map((v, i) => i % 2 === 0 ? 30 : 50);
    navigator.vibrate(pattern);
  }
}

const langs = settings.availableLanguages;
const translationsCache = {};

export async function getText(key, params = {}, type = 'tts') {
  try {
    const language = langs.find(l => l.id === settings.language);
    if (!language) throw new Error(`Language not found: ${settings.language}`);

    let translations = translationsCache[language.id];
    if (!translations) {
      const response = await fetch(`./languages/${language.id}.json`);
      if (!response.ok) throw new Error(`Failed to load language file: ${response.status}`);
      translations = await response.json();
      translationsCache[language.id] = translations;
    }

    let finalMessage = translations;
    for (const part of key.split('.')) {
      finalMessage = finalMessage[part] || key;
    }
    if (typeof finalMessage === 'object') {
      finalMessage = finalMessage[params.state || params.fps || params.lang] || key;
    }
    for (const [paramKey, paramValue] of Object.entries(params)) {
      const placeholderRegex = new RegExp(`\\{${paramKey}\\}`, 'g');
      finalMessage = finalMessage.replace(placeholderRegex, paramValue);
    }
    if (type === 'tts' && settings.ttsEnabled) {
      const utterance = new SpeechSynthesisUtterance(finalMessage);
      utterance.lang = settings.language;
      window.speechSynthesis.speak(utterance);
    }
    const announcements = document.getElementById('announcements');
    if (announcements) {
      announcements.textContent = finalMessage;
    }
    return finalMessage;
  } catch (err) {
    console.error(`${type} error:`, err.message);
    const announcements = document.getElementById('announcements');
    if (announcements) {
      announcements.textContent = `${type} error: Unable to process message`;
    }
    return key;
  }
}

export function parseBrowserVersion(userAgent) {
  const rx = /Chrome\/([0-9.]+)|Firefox\/([0-9.]+)|Safari\/([0-9.]+)|Edg\/([0-9.]+)/;
  const m = userAgent.match(rx);
  return (m && (m[1] || m[2] || m[3] || m[4])) || 'Unknown';
}

export function setTextAndAriaLabel(element, text, ariaLabel) {
  if (element) {
    element.textContent = text;
    element.setAttribute('aria-label', ariaLabel);
  } else {
    structuredLog('WARN', 'Element not found for text update', { text });
  }
}