import { settings } from '../state.js';
import { availableLanguages } from '../config.js';

export async function getText(key, params = {}, type = 'tts') {
  try {
    const language = availableLanguages.find(l => l.id === settings.language);
    if (!language) throw new Error(`Language not found: ${settings.language}`);
    const response = await fetch(language.file);
    if (!response.ok) throw new Error(`Failed to load language file: ${response.status}`);
    const translations = await response.json();
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