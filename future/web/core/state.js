// File: web/core/state.js
import { structuredLog } from '../utils/logging.js';  // Top import.
import { addIdbLog, getAllIdbLogs } from '../utils/idb-logger.js';  // New import for DB logging.

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
  dayNightMode: 'day',
  resetStateOnError: true // New flag to control state reset on errors
};

export const loadConfigs = Promise.all([
  import('../synthesis-grids/available-grids.json').then(m => settings.availableGrids = m),
  import('../audio/synthesis-engines/available-engines.json').then(m => settings.availableEngines = m),
  import('../languages/available-languages.json').then(m => settings.availableLanguages = m),
]).catch(err => {
  console.error('Config load error:', err.message);
  structuredLog('ERROR', 'Config load error', { message: err.message });
});

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

export function setMicStream(micStream) {
  settings.micStream = micStream;
  if (settings.debugLogging) {
    structuredLog('INFO', 'setMicStream', { micStreamSet: !!micStream });
  }
}