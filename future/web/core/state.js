// File: web/core/state.js
import { structuredLog } from '../utils/logging.js';
import { addIdbLog, getAllIdbLogs } from '../utils/idb-logger.js';
import { availableGridsData } from '../video/grids/available-grids.js';
import { availableEnginesData } from '../audio/synths/available-synths.js';
import { availableLanguagesData } from '../languages/available-languages.js';

export let settings = {
  debugLogging: true,
  stream: null,
  availableGrids: availableGridsData || [],
  availableEngines: availableEnginesData || [],
  availableLanguages: availableLanguagesData || [],
  audioTimerId: null,
  updateInterval: 30,
  autoFPS: true,
  gridType: null,
  synthesisEngine: null,
  language: null,
  isSettingsMode: false,
  micStream: null,
  audioResumeAttempts: 2,
  audioResumeDelayMs: 100,
  ttsEnabled: false,
  ingestEnabled: true,
  dayNightMode: 'day',
  resetStateOnError: true,
  motionThreshold: 20,
  maxNotes: 24 // <<< The new decoupled polyphony setting, later we should work in dinamical setting for this value
};

/**
 * Validates settings object against a simple JSON schema without external dependencies.
 * @param {Object} settingsObj - The settings object to validate.
 * @returns {boolean} True if valid, false otherwise.
 */
function validateSettingsSchema(settingsObj) {
  const schema = {
    debugLogging: 'boolean',
    stream: ['null', 'object'],
    availableGrids: 'array',
    availableEngines: 'array',
    availableLanguages: 'array',
    audioTimerId: ['null', 'number'],
    updateInterval: 'number',
    autoFPS: 'boolean',
    gridType: ['null', 'string'],
    synthesisEngine: ['null', 'string'],
    language: ['null', 'string'],
    isSettingsMode: 'boolean',
    micStream: ['null', 'object'],
    audioResumeAttempts: 'number',
    audioResumeDelayMs: 'number',
    ttsEnabled: 'boolean',
    dayNightMode: 'string',
    resetStateOnError: 'boolean',
    motionThreshold: 'number'
  };

  for (const key in schema) {
    const expectedType = schema[key];
    const actualValue = settingsObj[key];

    // Use explicit array type check when schema expects 'array'
    if (expectedType === 'array') {
      if (!Array.isArray(actualValue)) {
        structuredLog('ERROR', `Invalid type for ${key}`, { expected: 'array', actual: typeof actualValue });
        return false;
      }
    } else if (Array.isArray(expectedType)) {
      if (!expectedType.some(type => type === typeof actualValue || (type === 'null' && actualValue === null))) {
        structuredLog('ERROR', `Invalid type for ${key}`, { expected: expectedType, actual: typeof actualValue });
        return false;
      }
    } else if (typeof actualValue !== expectedType) {
      structuredLog('ERROR', `Invalid type for ${key}`, { expected: expectedType, actual: typeof actualValue });
      return false;
    }
  }

  return true;
}

/**
 * Initializes default settings from the loaded configuration files.
 * This runs after the config files have been fetched and parsed.
 */
function initializeDefaults() {
  structuredLog('INFO', 'Initializing settings from loaded configs.');

  if (!validateSettingsSchema(settings)) {
    structuredLog('ERROR', 'initializeDefaults: Invalid settings schema', { settings });
    throw new Error('Settings validation failed');
  }

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

  try {
    const t = localStorage.getItem('ingestEnabled');
    if (t === '0') settings.ingestEnabled = false;
    else if (t === '1') settings.ingestEnabled = true;
  } catch (e) {
    // ignore localStorage access errors
  }
}

initializeDefaults();

// --- REMOVED loadConfigs: configs are now loaded statically via import ---

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

export let lastTTSTime = 0; // Tracks the last TTS invocation time globally