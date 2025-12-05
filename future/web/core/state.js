// File: web/core/state.js
import { structuredLog } from '../utils/logging.js';
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
  resetStateOnError: true, // New flag to control state reset on errors
  motionThreshold: 20 // Default threshold for motion detection
};

/**
 * Initializes default settings from the loaded configuration files.
 * This runs after the config files have been fetched and parsed.
 */
function initializeDefaults() {
  structuredLog('INFO', 'Initializing settings from loaded configs.');

  if (settings.availableGrids.length > 0 && !settings.gridType) {
    settings.gridType = settings.availableGrids[0].id;
  }

  if (settings.availableEngines.length > 0 && !settings.synthesisEngine) {
    settings.synthesisEngine = settings.availableEngines[0].id;
  }

  if (settings.availableLanguages.length > 0) {
    if (!settings.language || !settings.availableLanguages.some(l => l.id === settings.language)) {
      settings.language = settings.availableLanguages[0].id;
    }
  }
  
  structuredLog('INFO', 'Settings initialized', { settings });
}

export const loadConfigs = Promise.all([
  fetch('./video/grids/available-grids.json')
    .then(async res => {
      if (!res.ok) throw new Error(`Failed to fetch available-grids.json: ${res.status}`);
      const clone = res.clone();
      const data = await res.json();
      settings.availableGrids = data;
      console.log('Debug: availableGrids raw JSON', await clone.text());
      if (settings.availableGrids.length === 0) console.warn('Debug: availableGrids is empty array');
      return data;
    })
    .catch(err => {
      console.error('available-grids load error:', err.message);
      structuredLog('ERROR', 'available-grids load error', { message: err.message });
      settings.availableGrids = [];
      return [];
    }),

  fetch('./audio/synths/available-engines.json')
    .then(async res => {
      if (!res.ok) throw new Error(`Failed to fetch available-engines.json: ${res.status}`);
      const clone = res.clone();
      const data = await res.json();
      settings.availableEngines = data;
      console.log('Debug: availableEngines raw JSON', await clone.text());
      if (settings.availableEngines.length === 0) console.warn('Debug: availableEngines is empty array');
      return data;
    })
    .catch(err => {
      console.error('available-engines load error:', err.message);
      structuredLog('ERROR', 'available-engines load error', { message: err.message });
      settings.availableEngines = [];
      return [];
    }),

  fetch('./languages/available-languages.json')
    .then(async res => {
      if (!res.ok) throw new Error(`Failed to fetch available-languages.json: ${res.status}`);
      const clone = res.clone();
      const data = await res.json();
      settings.availableLanguages = data;
      console.log('Debug: availableLanguages raw JSON', await clone.text());
      if (settings.availableLanguages.length === 0) console.warn('Debug: availableLanguages is empty array');
      return data;
    })
    .catch(err => {
      console.error('available-languages load error:', err.message);
      structuredLog('ERROR', 'available-languages load error', { message: err.message });
      settings.availableLanguages = [];
      return [];
    }),
])
  .then(() => {
    initializeDefaults();  // Derive defaults from loaded (or empty) arrays
  })
  .catch(err => {
    console.error('Configs load aggregate error:', err.message);
    structuredLog('ERROR', 'Configs load aggregate error', { message: err.message });
    initializeDefaults();  // Ensure defaults even if failed
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