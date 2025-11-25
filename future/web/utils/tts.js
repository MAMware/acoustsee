/**
 * tts.js - Text-to-Speech Module
 * 
 * Handles speech synthesis with cooldown throttling.
 * Prevents audio flooding and TTS resource exhaustion.
 */

import { structuredLog } from './logging.js';

// Module-scoped state for TTS throttling
let lastTTSTime = 0;

/**
 * Speaks text using the Web Speech API with cooldown throttling.
 * 
 * @param {Object} state - Application state containing ttsEnabled, language, ttsCooldownMs
 * @param {string} message - Text to speak
 * @param {string} type - Type of speech (default: 'tts')
 * 
 * @example
 * speakText(state, "Hello, world");
 * speakText(state, "Navigation: Move up", 'ui');
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
 * Resets the TTS cooldown timer (useful for testing or manual reset).
 * 
 * @internal
 */
export function resetTTSTimer() {
  lastTTSTime = 0;
}
