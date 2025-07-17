import { settings, availableLanguages } from '../state.js';

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

const translationsCache = {};

export async function getText(key, params = {}, type = 'tts') {
  try {
    const language = availableLanguages.find(l => l.id === settings.language);
    if (!language) throw new Error(`Language not found: ${settings.language}`);

    // Usa el cache si ya está cargado
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
      finalMessage = finalMessage.replace(`{${paramKey}}`, paramValue);
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