// File: web/core/state.js
import { structuredLog } from '../utils/logging.js';
import { addIdbLog, getAllIdbLogs } from '../utils/idb-logger.js';
import { availableGridsData } from '../video/grids/available-grids.js';
import { availableEnginesData } from '../audio/synths/available-synths.js';
import { availableLanguagesData } from '../languages/available-languages.js';
import { computeDefaultUpdateInterval, computeDefaultMaxNotes, deviceSummary } from '../utils/performance.js';

export let settings = {
  debugLogging: true,
  stream: null,
  availableGrids: availableGridsData || [],
  availableEngines: availableEnginesData || [],
  availableLanguages: availableLanguagesData || [],
  audioTimerId: null,
  updateInterval: computeDefaultUpdateInterval(20),
  autoFPS: true,
  // Phase 2: performance tuning flags (can be adjusted at runtime by UI or tests)
  autoFpsDownscale: 0.25, // fraction of full canvas to use for benchmark (0.25 = 25%)
  autoFpsSamples: 2, // number of benchmark samples to take (1..4)
  enableFrameWorker: true, // opt-in flag to use OffscreenCanvas + Worker for frame processing
  // When true, transfer ArrayBuffer ownership to the worker to avoid copies
  // and prefer a reusable buffer allocation (main thread should allocate once).
  // Enabled by default for higher-performance paths.
  workerTransferEnabled: true,
  // Stores the most recent auto-FPS benchmark results (measured interval in ms and metadata)
  autoFpsBenchmark: {
    lastIntervalMs: null,
    measuredAt: null,
    sampleCount: 0,
    safetyFactor: 0.7
  },
  // Whether the engine should emit processFrame DEBUG logs (controlled by UI)
  includeProcessFrameLogs: false,
  gridType: null,
  synthesisEngine: null,
  language: null,
  isSettingsMode: false,
  settings: {
  categories: ['grid', 'synth', 'language', 'maxNotes', 'motionThreshold'], // Add other settings IDs here
    currentCategoryIndex: 0,
  },
  micStream: null,
  audioResumeAttempts: 2,
  audioResumeDelayMs: 100,
  ttsEnabled: false,
  ingestEnabled: true,
  dayNightMode: 'day',
  resetStateOnError: true,
  // --- WIP: ARCH-3 ---
  // Dual-mode prototype flags and runtime guard.
  // This is an experimental feature. Do not remove or change without referencing TASKS.md ARCH-3.
  // Current operating mode: 'flow' (navigation) or 'focus' (identification)
  currentMode: 'flow',
  // When true, mode switches are simulated and heavy ML paths should be blocked by producers.
  dualModeWIP: true,
  // --- END WIP ---
  motionThreshold: 20,
  maxNotes: computeDefaultMaxNotes(24) // <<< The new decoupled polyphony setting, later we should work in dinamical setting for this value
};

// Detect local/test environments where telemetry should be disabled by default.
const IS_LOCALHOST = (typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname))
  || (typeof process !== 'undefined' && process.env && process.env.NODE_ENV === 'test');

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
    ,
    currentMode: 'string'
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
    else if (IS_LOCALHOST) {
      // Default to disabled on localhost/test to avoid accidental network calls.
      settings.ingestEnabled = false;
    }
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

export function setAutoFpsBenchmark({ intervalMs, sampleCount = 0, safetyFactor = 0.7 } = {}) {
  settings.autoFpsBenchmark = settings.autoFpsBenchmark || {};
  settings.autoFpsBenchmark.lastIntervalMs = intervalMs;
  settings.autoFpsBenchmark.measuredAt = Date.now();
  settings.autoFpsBenchmark.sampleCount = sampleCount;
  settings.autoFpsBenchmark.safetyFactor = safetyFactor;
  if (settings.debugLogging) structuredLog('INFO', 'setAutoFpsBenchmark', { settings: settings.autoFpsBenchmark });
}

/**
 * Set a frame processor function used by runtime benchmarks.
 * The function should have signature (frameData, w, h) => Promise|void.
 */
export function setFrameProcessor(proc) {
  settings._frameProcessor = proc;
  if (settings.debugLogging) structuredLog('INFO', 'setFrameProcessor', { hasProcessor: !!proc });
}

/**
 * Allocate or replace a reusable frame buffer that other modules (benchmark,
 * processor) may use to avoid per-frame allocations. Returns the buffer.
 */
export function allocateFrameBuffer(width, height) {
  try {
    const buf = new Uint8ClampedArray(Math.max(0, width) * Math.max(0, height) * 4);
    settings._frameBuffer = buf;
    if (settings.debugLogging) structuredLog('INFO', 'allocateFrameBuffer', { width, height });
    return buf;
  } catch (e) {
    structuredLog('ERROR', 'allocateFrameBuffer failed', e);
    return null;
  }
}

export function setFrameBuffer(buf) {
  settings._frameBuffer = buf;
  if (settings.debugLogging) structuredLog('INFO', 'setFrameBuffer', { provided: !!buf });
  return buf;
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