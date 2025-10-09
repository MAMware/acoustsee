// File: web/core/commands/persistence-commands.js
// Handles persistence-related commands (save/load settings, export logs)
// Strictly separated from core settings mutations and UI.

import { structuredLog } from '../../utils/logging.js';
import { getAllIdbLogs } from '../../utils/idb-logger.js';
import { setLanguage, translatePage, getText, speakText } from '../../utils/utils.js';
import * as audioProcessor from '../../audio/audio-processor.js';
import { getAudioApi } from '../../audio/audio-processor.js';

export function registerPersistenceCommands(engine) {
  const { registerCommandHandler } = engine;

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
  try { const msg = await getText('settings.saved', {}, s).catch(() => null); if (msg) speakText(s, msg, 'tts'); } catch (_) {}
      structuredLog('INFO', 'Settings saved to localStorage', settingsToSave);
      return { saved: true };
    } catch (err) {
      structuredLog('ERROR', 'saveSettings error', { message: err.message });
  try { const errorMsg = await getText('settings.save_error', {}, s).catch(() => null); if (errorMsg) speakText(s, errorMsg, 'tts'); } catch (_) {}
      return { saved: false };
    }
  });

  registerCommandHandler('loadSettings', async ({ state: s }) => {
    try {
      const savedSettingsJSON = localStorage.getItem('acoustsee-settings');
      if (savedSettingsJSON) {
        const parsed = JSON.parse(savedSettingsJSON);
        Object.assign(s, parsed);
        try { await setLanguage(s.language, s); } catch (_) {}
        try { await translatePage(document, s); } catch (_) {}
        try {
          const api = getAudioApi();
          if (api && typeof api.setMaxNotes === 'function') api.setMaxNotes(s.maxNotes);
          else audioProcessor.resizeOscillatorPool(s.maxNotes);
        } catch (_) {}
  try { const msg = await getText('settings.loaded', {}, s).catch(() => null); if (msg) speakText(s, msg, 'tts'); } catch (_) {}
        structuredLog('INFO', 'Settings loaded from localStorage', parsed);
      } else {
  try { const msg = await getText('settings.load_none', {}, s).catch(() => null); if (msg) speakText(s, msg, 'tts'); } catch (_) {}
        structuredLog('INFO', 'No saved settings found in localStorage.');
      }
    } catch (err) {
      structuredLog('ERROR', 'Load settings error', { message: err.message });
  try { const errorMsg = await getText('settings.load_error', {}, s).catch(() => null); if (errorMsg) speakText(s, errorMsg, 'tts'); } catch (_) {}
    }
  });

  registerCommandHandler('exportIngestLogs', async () => {
    try {
      const logs = await getAllIdbLogs();
      const dataStr = JSON.stringify(logs, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `acoustsee-logs-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
      structuredLog('INFO', 'Ingest logs exported', { count: logs.length });
      return { exported: true, count: logs.length };
    } catch (e) {
      structuredLog('ERROR', 'exportIngestLogs failed', { error: e.message });
      return { exported: false, error: e.message };
    }
  });
}
