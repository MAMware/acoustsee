// File: web/core/handlers/ui-handlers.js

import { settings, setAudioInterval } from '../state.js';
import { structuredLog } from '../../utils/logging.js';
import { getText, speakText, clearTranslationsCache } from '../../utils/utils.js';

export function createUIHandlers(dispatch) {
  return {
    async toggleLanguage() {
      try {
        const { availableLanguages } = settings;
        const currentIndex = availableLanguages.findIndex(l => l.id === settings.language);
        const nextIndex = (currentIndex + 1) % availableLanguages.length;
        settings.language = availableLanguages[nextIndex].id;
        
        clearTranslationsCache();
        if (window.speechSynthesis?.cancel) {
          window.speechSynthesis.cancel();
        }
        
        const msg = await getText('button3.tts.languageSelect', { state: settings.language });
        speakText(msg);

      } catch (err) {
        structuredLog('ERROR', 'toggleLanguage error', { message: err.message, stack: err.stack });
        const errorMsg = await getText('button3.tts.languageError');
        speakText(errorMsg);
      } finally {
        await dispatch('updateUI', { 
          settingsMode: settings.isSettingsMode, 
          streamActive: !!settings.stream, 
          micActive: !!settings.micStream 
        });
      }
    },

    async updateFrameInterval({ interval }) {
      try {
        settings.updateInterval = interval;
        if (settings.stream && settings.audioTimerId) {
          clearInterval(settings.audioTimerId);
          const newTimerId = setInterval(() => dispatch('processFrame'), settings.updateInterval);
          setAudioInterval(newTimerId);
        }

        const msg = await getText('button4.tts.fpsBtn', {
          fps: settings.autoFPS ? 'auto' : Math.round(1000 / settings.updateInterval)
        });
        speakText(msg);

      } catch (err) {
        structuredLog('ERROR', 'updateFrameInterval error', { message: err.message, stack: err.stack });
        const errorMsg = await getText('button4.tts.fpsError');
        speakText(errorMsg);
      } finally {
        await dispatch('updateUI', { 
          settingsMode: settings.isSettingsMode, 
          streamActive: !!settings.stream, 
          micActive: !!settings.micStream 
        });
      }
    }
  };
}