// File: web/core/commands/settings-commands.js
// Handles commands related to saving, loading, and modifying user settings.
// MAMware reviewed 2025-05-09 as 
// R250905: the presense of debug handlers and more here makes the "debug-commands.js" file feel extra.
// R170925: what is the role of this file vs debug-commands.js vs ui-commands.js and such? is this useful for a modular plug able UI?

import { structuredLog } from '../../utils/logging.js';
import { getText, speakText, setLanguage, translatePage } from '../../utils/utils.js';
import * as audioProcessor from '../../audio/audio-processor.js';
import { getAudioApi } from '../../audio/audio-processor.js';

export function registerSettingsCommands(engine) {
  const { registerCommandHandler, dispatch } = engine;

  // --- Handlers for Debug UI Controls ---  
  registerCommandHandler('setGridType', (payload) => {
    const newGridId = payload.gridType;
    const currentState = engine.getState();
    if (currentState.availableGrids && currentState.availableGrids.find(g => g.id === newGridId)) {
      engine.setState({ gridType: newGridId });
      structuredLog('INFO', 'DebugUI: Grid type set', { gridType: newGridId });
    }
  });

  registerCommandHandler('setSynthEngine', (payload) => {
    const newEngineId = payload.synthEngine;
    const currentState = engine.getState();
    if (currentState.availableEngines && currentState.availableEngines.find(e => e.id === newEngineId)) {
      engine.setState({ synthesisEngine: newEngineId });
      structuredLog('INFO', 'DebugUI: Synth engine set', { synthEngine: newEngineId });
    }
  });

  registerCommandHandler('setMaxNotes', async ({ state: s, payload }) => {
    const maxNotes = parseInt(payload.maxNotes, 10);
    if (!isNaN(maxNotes) && maxNotes >= 1 && maxNotes <= 100) {
      s.maxNotes = maxNotes;
      try {
        const api = getAudioApi();
        if (api && typeof api.setMaxNotes === 'function') api.setMaxNotes(s.maxNotes);
        else audioProcessor.resizeOscillatorPool(s.maxNotes);
      } catch (e) { structuredLog('WARN', 'setMaxNotes/resizeOscillatorPool failed', { error: e?.message }); }
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
  try { const api = getAudioApi(); if (api && typeof api.setMaxNotes === 'function') api.setMaxNotes(s.maxNotes); else audioProcessor.resizeOscillatorPool(s.maxNotes); } catch (e) {}
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

  // --- UI convenience handlers (migrated from ui-commands.js) R17925 button 6 is legacy we should move foward of this naming ---
  registerCommandHandler('toggleSettingsMode', async ({ state: s }) => {
    s.isSettingsMode = !s.isSettingsMode;
    // Announce the change as a side effect
    try {
      const key = s.isSettingsMode ? 'button6.tts.settingsToggle.on' : 'button6.tts.settingsToggle.off';
      const preferredKey = s.isSettingsMode ? 'announce.settingsMode' : 'announce.settingsMode.off';
      const legacyKey = key;
      const msg = (await getText(preferredKey).catch(() => null)) || (await getText(legacyKey).catch(() => null));
      if (msg) speakText(msg);
    } catch (e) {
      structuredLog('WARN', 'announceSettingsMode failed during toggle', { error: e?.message });
    }
    return { isSettingsMode: s.isSettingsMode };
  });

  registerCommandHandler('announceSettingsMode', async ({ state: s }) => {
    try {
      const key = s.isSettingsMode ? 'button6.tts.settingsToggle.on' : 'button6.tts.settingsToggle.off';
      const msg = await getText(key).catch(() => null);
      if (msg) speakText(msg);
    } catch (e) {
      structuredLog('WARN', 'announceSettingsMode failed', { error: e?.message });
    }
  });

  // --- Mode switching (Flow / Focus) --- R18925: naming "newMode" feels silly to me, imagine a new developer reading this "newMode" it could think acording to who and what and when!? why not just "mode"? or alike.
  registerCommandHandler('setMode', async ({ state: s, payload }) => {
    try {
      const mode = payload && payload.mode;
      if (mode !== 'flow' && mode !== 'focus') {
        structuredLog('WARN', 'setMode: invalid mode', { provided: mode });
        return { error: 'invalid-mode' };
      }

      // --- WIP: ARCH-3 ---
      // If dualModeWIP is enabled the handler performs a simulated mode switch:
      //  - updates state.currentMode so UIs and inspectors can reflect the change
      //  - logs a clear warning
      //  - avoids starting any heavy ML models / pipelines (those should check state.dualModeWIP)
      if (s.dualModeWIP) {
        s.currentMode = mode;
        structuredLog('WARN', `WIP: simulated mode change to ${mode} (ARCH-3)`);
        try { speakText(`WIP mode set to ${mode}. This is a simulated change.`); } catch (_) {}
        return { ok: true, simulated: true, mode };
      }
      // --- END WIP ---

      // Production-path: real mode switch
      s.currentMode = mode;
      structuredLog('INFO', `Mode changed to ${mode}`);
      try { speakText(`Mode set to ${mode}`); } catch (_) {}
      return { ok: true, mode };
    } catch (e) { structuredLog('ERROR', 'setMode handler failed', { error: e?.message }); }
  });
}
