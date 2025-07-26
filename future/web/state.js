import { structuredLog } from './utils/logging.js';  // Top import.
import { addIdbLog, getAllIdbLogs } from './utils/idb-logger.js';  // New import for DB logging.

export let settings = {
  debugLogging: true,
  stream: null,
  audioTimerId: null,
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
    availableLanguages = languages;
    settings.gridType = grids[0]?.id || settings.gridType;
    settings.synthesisEngine = engines[0]?.id || settings.synthesisEngine;
    settings.language = languages[0]?.id || settings.language;
    settings.updateInterval = intervals[0] || settings.updateInterval;
  } catch (err) {
    structuredLog('ERROR', 'Failed to load configurations', { message: err.message });
  }
})();

export let availableLanguages = [];

export async function getLogs() {
  const allLogs = await getAllIdbLogs();
  // Pretty-print for readability.
  return allLogs.map(log => {
    return `Timestamp: ${log.timestamp}\nLevel: ${log.level}\nMessage: ${log.message}\nData: ${JSON.stringify(log.data, null, 2)}\n---\n`;
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

export function setMicStream(stream) {
  settings.micStream = stream;
  if (settings.debugLogging) {
    structuredLog('INFO', 'setMicStream', { micStreamSet: !!stream });
  }
}

// Override console methods to collect logs, fully routed through structuredLog.
console.log = (...args) => {
  if (settings.debugLogging) {
    structuredLog('INFO', 'Console log', { args });
  }
};

console.warn = (...args) => {
  if (settings.debugLogging) {
    structuredLog('WARN', 'Console warn', { args });
  }
};

console.error = (...args) => {
  structuredLog('ERROR', 'Console error', { args });  // Always log errors.
};