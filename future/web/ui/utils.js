import { settings } from '../state.js';

export async function speak(key, params = {}) {
  try {
    const response = await fetch(`./languages/${settings.language}.json`);
    if (!response.ok) {
      throw new Error(`Failed to load language file: ${response.status}`);
    }
    const translations = await response.json();
    let finalMessage = translations[key] || key;

    if (typeof finalMessage === 'object') {
      finalMessage = finalMessage[params.state || params.fps || params.lang] || key;
    }

    // Replace placeholders (e.g., {state}, {fps}, {lang})
    for (const [paramKey, paramValue] of Object.entries(params)) {
      let tempMessage = finalMessage;
      while (tempMessage.includes(`{${paramKey}}`)) {
        tempMessage = tempMessage.replace(`{${paramKey}}`, paramValue);
      }
      finalMessage = tempMessage;
    }

    console.log('speak: Speaking message', { key, finalMessage, params });
    const utterance = new SpeechSynthesisUtterance(finalMessage);
    utterance.lang = settings.language;
    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.error('TTS error:', err.message);
    if (getDispatchEvent()) {
      getDispatchEvent()('logError', { message: `TTS error: ${err.message}` });
    }
  }
}