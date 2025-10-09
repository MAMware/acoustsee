// File: web/core/commands/touch-gesture-commands.js
// Contains all command handlers for touchscreen gesture-based inputs, responding to inputs
// like taps, swipes, and long-presses.
// MAMware reviewed 2024-06-19 as R240619
// TO-DO: Write usage instructions for touch gestures

import { structuredLog } from '../../utils/logging.js';
import { getText, speakText, setLanguage, translatePage } from '../../utils/utils.js';
import { getAllIdbLogs } from '../../utils/idb-logger.js';
import { trackFeatureUse } from '../ingest.js';
// Do not import audio-processor directly; use engine.audioApi

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
    
  // TODO: This switch statement is becoming difficult to maintain.
  // Consider refactoring to a data-driven settings manifest where each
  // setting defines: type (e.g., 'cycle', 'numeric'), allowed values/range,
  // and the state property it controls. A small generic handler can then
  // perform updates and side-effects (e.g., saving, calling resize functions).
  // This will make adding settings easier and reduce bugs from manual
  // per-case implementations.
  // Logic to change the value based on the category
  switch (categoryId) {
      case 'grid':
        const grids = s.availableGrids.map(g => g.id);
        const currentGridIndex = grids.indexOf(s.gridType);
        const nextGridIndex = (currentGridIndex + direction + grids.length) % grids.length;
        engine.setState({ gridType: grids[nextGridIndex] });
        break;
      case 'synth':
        const synths = s.availableEngines.map(e => e.id);
        const currentSynthIndex = synths.indexOf(s.synthesisEngine);
        const nextSynthIndex = (currentSynthIndex + direction + synths.length) % synths.length;
        engine.setState({ synthesisEngine: synths[nextSynthIndex] });
        break;
      case 'language':
        const langs = s.availableLanguages.map(l => l.id);
        const currentLangIndex = langs.indexOf(s.language);
        const nextLangIndex = (currentLangIndex + direction + langs.length) % langs.length;
        const newLang = langs[nextLangIndex];
        await setLanguage(newLang, s); // This also saves it
        engine.setState({ language: newLang });
        try { await translatePage(document, s); } catch (e) { /* best-effort */ }
        break;
      case 'maxNotes':
        const current = Number(s.maxNotes) || 0;
        const next = Math.max(1, current + (direction > 0 ? 1 : -1));
        engine.setState({ maxNotes: next });
        try {
          if (engine.audioApi && typeof engine.audioApi.resizeOscillatorPool === 'function') {
            engine.audioApi.resizeOscillatorPool(next);
          } else if (engine.audioApi && typeof engine.audioApi.setMaxNotes === 'function') {
            engine.audioApi.setMaxNotes(next);
          } else {
            structuredLog('WARN', 'maxNotes: audioApi not available to update pool size');
          }
        } catch (e) { structuredLog('WARN', 'resizeOscillatorPool failed', { error: e?.message }); }
        break;
      case 'motionThreshold':
        let newThreshold = (Number(s.motionThreshold) || 20) + (direction * 20);
        newThreshold = Math.max(20, Math.min(120, newThreshold));
        engine.setState({ motionThreshold: newThreshold });
        break;
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
    let valueText = '';
    try {
      switch (categoryId) {
        case 'grid':
          valueText = s.availableGrids.find(g => g.id === s.gridType)?.name || s.gridType;
          break;
        case 'synth':
          valueText = s.availableEngines.find(e => e.id === s.synthesisEngine)?.name || s.synthesisEngine;
          break;
        case 'language':
          valueText = s.availableLanguages.find(l => l.id === s.language)?.name || s.language;
          break;
        case 'maxNotes':
          valueText = await getText('settings.value.notes', { count: s.maxNotes }, s);
          break;
        case 'motionThreshold':
          let sensitivity = 'Medium';
          if ((Number(s.motionThreshold) || 0) <= 40) sensitivity = 'High';
          if ((Number(s.motionThreshold) || 0) >= 80) sensitivity = 'Low';
          valueText = await getText('settings.value.sensitivity', {
            level: await getText(`settings.sensitivity.${sensitivity.toLowerCase()}`, {}, s)
          }, s);
          break;
      }
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
