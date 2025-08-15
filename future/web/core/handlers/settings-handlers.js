// File: web/core/handlers/settings-handlers.js

import { settings } from '../state.js';
import { structuredLog } from '../../utils/logging.js';
import { getText, speakText } from '../../utils/utils.js';
import { dispatchEvent } from '../dispatcher.js';
import { resizeOscillatorPool } from '../../audio/audio-processor.js';

export async function saveSettings() {
  try {
    const settingsToSave = {
      gridType: settings.gridType,
      synthesisEngine: settings.synthesisEngine,
      language: settings.language,
      autoFPS: settings.autoFPS,
      updateInterval: settings.updateInterval,
      dayNightMode: settings.dayNightMode,
      ttsEnabled: settings.ttsEnabled,
      resetStateOnError: settings.resetStateOnError,
      audioResumeAttempts: settings.audioResumeAttempts,
      audioResumeDelayMs: settings.audioResumeDelayMs,
      maxNotes: settings.maxNotes
    };
    localStorage.setItem('acoustsee-settings', JSON.stringify(settingsToSave));
    const msg = await getText('button4.tts.saveSettings');
    speakText(msg);
  } catch (err) {
    structuredLog('ERROR', 'saveSettings error', { message: err.message, stack: err.stack });
    const errorMsg = await getText('button4.tts.saveError');
    speakText(errorMsg);
  }
}

export async function loadSettings() {
  try {
    const savedSettings = localStorage.getItem('acoustsee-settings');
    if (savedSettings) {
      const parsedSettings = JSON.parse(savedSettings);
      
      const expectedSettings = {
        gridType: 'string',
        synthesisEngine: 'string',
        language: 'string',
        autoFPS: 'boolean',
        updateInterval: 'number',
        dayNightMode: 'string',
        ttsEnabled: 'boolean',
        resetStateOnError: 'boolean',
        audioResumeAttempts: 'number',
        audioResumeDelayMs: 'number',
        maxNotes: 'number'
      };

      for (const key in expectedSettings) {
        if (Object.hasOwn(parsedSettings, key) && typeof parsedSettings[key] === expectedSettings[key]) {
          settings[key] = parsedSettings[key];
        }
      }

      const msg = await getText('button5.tts.loadSettings.loaded');
      speakText(msg);

      // Ensure audio oscillator pool matches saved maxNotes
      try {
        resizeOscillatorPool(settings.maxNotes);
      } catch (e) {
        structuredLog('WARN', 'resizeOscillatorPool failed after loadSettings', { err: e.message });
      }
    } else {
      const msg = await getText('button5.tts.loadSettings.none');
      speakText(msg);
    }
  } catch (err) {
    structuredLog('ERROR', 'Load settings error', { message: err.message, stack: err.stack });
    const errorMsg = await getText('button5.tts.loadError');
    speakText(errorMsg);
  } finally {
    dispatchEvent('updateUI', { 
      settingsMode: settings.isSettingsMode, 
      streamActive: !!settings.stream, 
      micActive: !!settings.micStream 
    });
  }
}