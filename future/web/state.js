import { structuredLog } from './utils/logging.js';  // Top import.
import { addIdbLog, getAllIdbLogs } from './utils/idb-logger.js';  // New import for DB logging.

export let settings = {
  debugLogging: true,
  stream: null,
  availableGrids: [],    // Loaded once at startup
  availableEngines: [],  // Loaded once at startup
  availableLanguages: [], // Loaded once at startup
  audioTimerId: null,  // Renamed from audioInterval: timer ID from setInterval, or null when cleared.
  updateInterval: 30, 
  autoFPS: true,
  gridType: null, 
  synthesisEngine: null, 
  language: null, 
  isSettingsMode: false,
  micStream: null,
  ttsEnabled: false,
  dayNightMode: 'day'
};

export const loadConfigs = (async () => {
  try {
    const [grids, engines, languages, intervals] = await Promise.all([
      fetch('./synthesis-methods/grids/availableGrids.json').then(res => res.json()),
      fetch('./synthesis-methods/engines/availableEngines.json').then(res => res.json()),
      fetch('./languages/availableLanguages.json').then(res => res.json()),
      Promise.resolve([50, 33, 16])
    ]);
    settings.availableGrids = grids;
    settings.availableEngines = engines;
    settings.availableLanguages = languages;
    settings.gridType = grids[0]?.id || settings.gridType;
    settings.synthesisEngine = engines[0]?.id || settings.synthesisEngine;
    settings.language = languages[0]?.id || settings.language;
    settings.updateInterval = intervals[0] || settings.updateInterval;
  } catch (err) {
    structuredLog('ERROR', 'Failed to load configurations', { message: err.message });
  }
})();

export async function getLogs() {
  // Fetch from IndexedDB and pretty-print for readability.
  const allLogs = await getAllIdbLogs();
  return allLogs.map(log => {
    try {
      return `Timestamp: ${log.timestamp}\nLevel: ${log.level}\nMessage: ${log.message}\nData: ${JSON.stringify(log.data, null, 2)}\n---\n`;
    } catch (err) {
      return `Invalid log entry: ${JSON.stringify(log)}\n---\n`;  // Fallback for malformed logs.
    }
  }).join('');
}

export function setStream(stream) {
  settings.stream = stream;
  if (settings.debugLogging) {
    structuredLog('INFO', 'setStream', { streamSet: !!stream });
  }
}

export function setAudioInterval(timerId) {
  settings.audioTimerId = timerId;
  if (settings.debugLogging) {
    const ms = settings.updateInterval;
    structuredLog('INFO', 'setAudioInterval', { timerId, updateIntervalMs: ms });
  }
}
