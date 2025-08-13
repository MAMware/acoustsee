// File: web/core/state.js
import { structuredLog } from '../utils/logging.js';
import { addIdbLog, getAllIdbLogs } from '../utils/idb-logger.js';
import availableGridsData from '../video/grids/available-grids.json';
import availableEnginesData from '../audio/synths/available-engines.json';
import availableLanguagesData from '../languages/available-languages.json';

export let settings = {
  maxNotes: 24, // sensible default, later to improved by into a dinamical setting
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
  dayNightMode: 'day',
  resetStateOnError: true,
  motionThreshold: 20
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

    if (Array.isArray(expectedType)) {
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
}

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