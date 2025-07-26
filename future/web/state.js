import { structuredLog } from './utils/logging.js';  // Moved to top to avoid reference issues.

export let settings = {
  debugLogging: true,
  stream: null,
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

const logs = [];

export function addLog(message) {
  logs.push(message);  // Now expects serialized JSON from structuredLog.
  if (logs.length > 1000) logs.shift(); // Limit to 1000 entries
}

export function getLogs() {
  return logs.join('\n');
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

// Override console methods to collect logs, fully routed through structuredLog (clean removal of originals).
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