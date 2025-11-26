// File: web/core/commands/touch-gesture-commands.js
// Contains all command handlers for touchscreen gesture-based inputs, responding to inputs
// like taps, swipes, and long-presses.
// MAMware reviewed 2024-06-19 as R240619
// TO-DO: Write usage instructions for touch gestures

import { structuredLog } from '../../utils/logging.js';
import { getText, speakText, setLanguage, translatePage } from '../../utils/utils.js';
import { getAllIdbLogs } from '../../utils/idb-logger.js';
import { trackFeatureUse } from '../../utils/ingest.js';
// Do not import audio-processor directly; use engine.audioApi

/**
 * Settings manifest for touch gesture controls.
 * Data-driven approach: each setting defines how to read/write/cycle values.
 * Replaces two large switch statements with a single generic handler.
 */
const SETTINGS_MANIFEST = {
  grid: {
    getOptions: (s) => s.availableGrids?.map(g => g.id) || [],
    getSelected: (s) => s.gridType,
    getName: (s, value) => s.availableGrids?.find(g => g.id === value)?.name || value,
    onUpdate: (engine, newValue) => engine.setState({ gridType: newValue })
  },
  synth: {
    getOptions: (s) => s.availableEngines?.map(e => e.id) || [],
    getSelected: (s) => s.synthesisEngine,
    getName: (s, value) => s.availableEngines?.find(e => e.id === value)?.name || value,
    onUpdate: (engine, newValue) => engine.setState({ synthesisEngine: newValue })
  },
  language: {
    getOptions: (s) => s.availableLanguages?.map(l => l.id) || [],
    getSelected: (s) => s.language,
    getName: (s, value) => s.availableLanguages?.find(l => l.id === value)?.name || value,
    onUpdate: async (engine, newValue, s) => {
      await setLanguage(newValue, s);
      engine.setState({ language: newValue });
      try { await translatePage(document, s); } catch (e) { /* best-effort */ }
    }
  },
  maxNotes: {
    type: 'numeric',
    min: 1,
    getSelected: (s) => Number(s.maxNotes) || 0,
    getName: async (s, value) => await getText('settings.value.notes', { count: value }, s),
    onUpdate: (engine, newValue) => {
      engine.setState({ maxNotes: newValue });
      try {
        if (engine.audioApi?.resizeOscillatorPool) {
          engine.audioApi.resizeOscillatorPool(newValue);
        } else if (engine.audioApi?.setMaxNotes) {
          engine.audioApi.setMaxNotes(newValue);
        } else {
          structuredLog('WARN', 'maxNotes: audioApi not available');
        }
      } catch (e) { structuredLog('WARN', 'resizeOscillatorPool failed', { error: e?.message }); }
    }
  },
  motionThreshold: {
    type: 'numeric',
    min: 20,
    max: 120,
    step: 20,
    getSelected: (s) => Number(s.motionThreshold) || 20,
    getName: async (s, value) => {
      let sensitivity = 'Medium';
      if (value <= 40) sensitivity = 'High';
      if (value >= 80) sensitivity = 'Low';
      return await getText('settings.value.sensitivity', {
        level: await getText(`settings.sensitivity.${sensitivity.toLowerCase()}`, {}, s)
      }, s);
    },
    onUpdate: (engine, newValue) => engine.setState({ motionThreshold: newValue })
  }
};

export function registerTouchGestureCommands(engine) {
  const { registerCommandHandler, dispatch } = engine;

  registerCommandHandler('toggleProcessing', async ({ state: s, payload }) => {
    if (s.isProcessing) {
      await dispatch('stopProcessing', payload); 
      const msg = await getText('processing.stopped', {}, s).catch(() => 'Stopped');
      speakText(s, msg, 'tts');
    } else {
      await dispatch('startProcessing', payload); //is this the correct way? dont we another method to stop/start like startCamera?
      const msg = await getText('processing.started', {}, s).catch(() => 'Started');
      speakText(s, msg, 'tts');
    }
  });

  registerCommandHandler('announceStatus', async ({ state: s }) => {
    try {
      const statusKey = s.isProcessing ? 'status.live' : 'status.idle';
      const gridName = s.availableGrids.find(g => g.id === s.gridType)?.name || s.gridType;
      const synthName = s.availableEngines.find(e => e.id === s.synthesisEngine)?.name || s.synthesisEngine;
      
      const msg = await getText('status.full', {
        status: await getText(statusKey, {}, s),
        grid: gridName,
        synth: synthName
      }, s);
        speakText(s, msg, 'tts');
    } catch (e) {
      structuredLog('ERROR', 'announceStatus failed', { error: e.message });
        speakText(s, "Could not announce status.", 'tts');
    }
  });

  registerCommandHandler('enterSettingsMode', async ({ state: s }) => {
    if (s.isProcessing) {
      await dispatch('stopProcessing'); // Stop processing to avoid distraction
    }
    s.isSettingsMode = true;
    s.settings.currentCategoryIndex = 0; // Start at the first category
    const msg = await getText('settings.enter', {}, s).catch(() => 'Settings mode. Swipe left or right to choose a category.');
      speakText(s, msg, 'tts');
    await dispatch('announceCurrentSettingCategory');
  });

  registerCommandHandler('exitSettingsMode', async ({ state: s }) => {
    s.isSettingsMode = false;
    await dispatch('saveSettings'); // Auto-save on exit
    const msg = await getText('settings.exit', {}, s).catch(() => 'Exiting settings.');
    speakText(s, msg, 'tts');
  });
  
  registerCommandHandler('cycleSettingCategory', async ({ state: s, payload }) => {
    if (!s.isSettingsMode) return;
    const direction = payload.direction || 1; // 1 for right, -1 for left
    const numCategories = s.settings.categories.length;
    s.settings.currentCategoryIndex = (s.settings.currentCategoryIndex + direction + numCategories) % numCategories;
    await dispatch('announceCurrentSettingCategory');
  });
  
  registerCommandHandler('changeCurrentSettingValue', async ({ state: s, payload }) => {
    if (!s.isSettingsMode) return;
    const direction = payload.direction || 1; // 1 for up/right, -1 for down/left
    const categoryId = s.settings.categories[s.settings.currentCategoryIndex];
    const config = SETTINGS_MANIFEST[categoryId];
    
    if (!config) {
      structuredLog('WARN', 'Unknown setting category', { categoryId });
      return;
    }
    
    // Handle numeric settings
    if (config.type === 'numeric') {
      const current = config.getSelected(s);
      const step = config.step || 1;
      let next = current + (direction > 0 ? step : -step);
      if (config.min !== undefined) next = Math.max(config.min, next);
      if (config.max !== undefined) next = Math.min(config.max, next);
      config.onUpdate(engine, next);
    } else {
      // Handle cycle settings (grid, synth, language, etc.)
      const options = config.getOptions(s);
      const current = config.getSelected(s);
      const currentIndex = options.indexOf(current);
      const nextIndex = (currentIndex + direction + options.length) % options.length;
      await config.onUpdate?.(engine, options[nextIndex], s);
    }
    
    await dispatch('announceCurrentSettingValue');
  });

  registerCommandHandler('announceCurrentSettingCategory', async ({ state: s }) => {
    if (!s.isSettingsMode) return;
    const categoryId = s.settings.categories[s.settings.currentCategoryIndex];
    const categoryName = await getText(`settings.category.${categoryId}`, {}, s).catch(() => categoryId);
    speakText(s, categoryName, 'tts');
  });
  
  registerCommandHandler('announceCurrentSettingValue', async ({ state: s }) => {
    if (!s.isSettingsMode) return;
    const categoryId = s.settings.categories[s.settings.currentCategoryIndex];
    const config = SETTINGS_MANIFEST[categoryId];
    
    if (!config) return;
    
    try {
      const current = config.getSelected(s);
      const valueText = await config.getName(s, current);
      speakText(s, valueText, 'tts');
    } catch (err) {
      structuredLog('ERROR', 'Failed to announce setting value', { error: err.message });
    }
  });

  registerCommandHandler('gatherAndSendUserReport', async ({ state }) => {
    try {
      const appState = JSON.stringify(state);
      const logs = JSON.stringify(await getAllIdbLogs());
      
      const reportPayload = {
        type: 'user-report',
        app_state: appState,
        logs: logs,
      };
      
      trackFeatureUse('user-report', reportPayload); 
      
      const msg = await getText('report.sending', {}, state).catch(() => 'Thank you. Sending report.');
        speakText(state, msg, 'tts');

    } catch (err) {
      structuredLog('ERROR', 'Failed to send user report', { error: err.message });
      const msg = await getText('report.error', {}, state).catch(() => 'Sorry, the report could not be sent.');
        speakText(state, msg, 'tts');
    }
  });
}
