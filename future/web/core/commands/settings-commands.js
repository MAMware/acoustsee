// File: web/core/commands/settings-commands.js
// Handles commands related to saving, loading, and modifying user settings.
// MAMware reviewed 2025-05-09 as R250905: the presense of debug handlers and more here makes the "debug-commands.js" file feel extra.

import { structuredLog } from '../../utils/logging.js';
import { getText, speakText, setLanguage, translatePage } from '../../utils/utils.js';
import * as audioProcessor from '../../audio/audio-processor.js';

export function registerSettingsCommands(engine) {
  const { registerCommandHandler, dispatch } = engine;

  // --- Handlers for Debug UI Controls ---  
  registerCommandHandler('setGridType', async ({ state: s, payload }) => {
    const newGridId = payload.gridType;
    if (s.availableGrids.find(g => g.id === newGridId)) {
      s.gridType = newGridId;
      structuredLog('INFO', 'DebugUI: Grid type set', { gridType: newGridId });
    }
  });

  registerCommandHandler('setSynthEngine', async ({ state: s, payload }) => {
    const newEngineId = payload.synthEngine;
    if (s.availableEngines.find(e => e.id === newEngineId)) {
      s.synthesisEngine = newEngineId;
      structuredLog('INFO', 'DebugUI: Synth engine set', { synthEngine: newEngineId });
    }
  });

  registerCommandHandler('setMaxNotes', async ({ state: s, payload }) => {
    const maxNotes = parseInt(payload.maxNotes, 10);
    if (!isNaN(maxNotes) && maxNotes >= 1 && maxNotes <= 100) {
      s.maxNotes = maxNotes;
      try { audioProcessor.resizeOscillatorPool(s.maxNotes); } catch (e) { structuredLog('WARN', 'resizeOscillatorPool failed', { error: e?.message }); }
      structuredLog('INFO', 'DebugUI: Max notes set', { maxNotes });
    }
  });

  registerCommandHandler('setMotionThreshold', async ({ state: s, payload }) => {
    const threshold = parseFloat(payload.motionThreshold); // Use parseFloat for slider values
    if (!isNaN(threshold) && threshold >= 0 && threshold <= 1) { // Assuming 0-1 range from slider
      s.motionThreshold = threshold;
      structuredLog('INFO', 'DebugUI: Motion threshold set', { threshold });
    }
  });

  registerCommandHandler('setAutoFPS', async ({ state: s, payload }) => {
    const enabled = !!payload.enabled;
    s.autoFPS = enabled;
    structuredLog('INFO', 'DebugUI: Auto FPS set', { enabled });
  });

  // --- Handlers for Save/Load ---
  registerCommandHandler('saveSettings', async ({ state: s }) => {
    try {
      const settingsToSave = {
        gridType: s.gridType,
        synthesisEngine: s.synthesisEngine,
        language: s.language,
        autoFPS: s.autoFPS,
        updateInterval: s.updateInterval,
        maxNotes: s.maxNotes,
        motionThreshold: s.motionThreshold
      };
      localStorage.setItem('acoustsee-settings', JSON.stringify(settingsToSave));
      const msg = await getText('settings.saved').catch(() => 'Settings saved successfully.');
      speakText(msg);
      structuredLog('INFO', 'Settings saved to localStorage', settingsToSave);
      return { saved: true };
    } catch (err) {
      structuredLog('ERROR', 'saveSettings error', { message: err.message });
      const errorMsg = await getText('settings.save_error').catch(() => 'Error saving settings.');
      speakText(errorMsg);
      return { saved: false };
    }
  });

  registerCommandHandler('loadSettings', async ({ state: s }) => {
    try {
      const savedSettingsJSON = localStorage.getItem('acoustsee-settings');
      if (savedSettingsJSON) {
        const parsed = JSON.parse(savedSettingsJSON);
        Object.assign(s, parsed);
        try { await setLanguage(s.language); } catch (e) {}
        try { await translatePage(document); } catch (e) {}
        try { audioProcessor.resizeOscillatorPool(s.maxNotes); } catch (e) {}
        const msg = await getText('settings.loaded').catch(() => 'Settings loaded successfully.');
        speakText(msg);
        structuredLog('INFO', 'Settings loaded from localStorage', parsed);
      } else {
        const msg = await getText('settings.load_none').catch(() => 'No saved settings found.');
        speakText(msg);
        structuredLog('INFO', 'No saved settings found in localStorage.');
      }
    } catch (err) {
      structuredLog('ERROR', 'Load settings error', { message: err.message });
      const errorMsg = await getText('settings.load_error').catch(() => 'Error loading settings.');
      speakText(errorMsg);
    }
  });

  // --- Configuration cycling commands --- R250905: these are used in the settings mode and also in the debug UI? cant we have a common one? now we have setGriType and cycleGrid
  // could we have a generic "cycleSetting" that takes the setting name and the list of possible values?
  // or at least a common helper function to cycle through options?
  // also, cycleLanguage here and in ui-commands.js ? 
  // also, cycleFramerate here and in performance-commands.js ?
  // also, cycleGrid here and in debug-commands.js ?
  // R250905: we should consolidate these to avoid confusion and duplication.
  registerCommandHandler('cycleGrid', async ({ state: s, payload }) => {
    try {
      const grids = s.availableGrids.map(g => g.id);
      const idx = grids.indexOf(s.gridType);
      const next = (idx + 1) % grids.length;
      s.gridType = grids[next];
      structuredLog('INFO', 'cycleGrid', { gridType: s.gridType });
      return { gridType: s.gridType };
    } catch (e) { structuredLog('WARN', 'cycleGrid failed', { error: e?.message }); }
  });

  registerCommandHandler('cycleFramerate', async ({ state: s }) => {
    try {
      // simple cycle between some presets: 15, 24, 30 R250905: what if we take advatange of the benchmark and set a "low" "mid" "high" derived from a % from the benchmark infered capabilities? or lets have 2fps 4fps 8fps 16fps
    // updateInterval is stored in milliseconds; present choices in FPS but convert
    const fpsChoices = [60, 30, 15];
    const currentMs = s.updateInterval || 1000 / 60;
    const currentFps = Math.round(1000 / currentMs);
    const idx = fpsChoices.indexOf(currentFps);
    const nextFps = fpsChoices[(idx + 1) % fpsChoices.length] || fpsChoices[0];
    s.updateInterval = Math.round(1000 / nextFps);
    structuredLog('INFO', 'cycleFramerate', { nextFps });
      return { fps: next };
    } catch (e) { structuredLog('WARN', 'cycleFramerate failed', { error: e?.message }); }
  });

  registerCommandHandler('cycleLanguage', async ({ state: s }) => {
    try {
      const langs = s.availableLanguages.map(l => l.id);
      const idx = langs.indexOf(s.language);
      const next = langs[(idx + 1) % langs.length];
      s.language = next;
      try { await setLanguage(next); } catch (e) {}
      try { await translatePage(document); } catch (e) {}
      structuredLog('INFO', 'cycleLanguage', { language: next });
      return { language: next };
    } catch (e) { structuredLog('WARN', 'cycleLanguage failed', { error: e?.message }); }
  });
}
