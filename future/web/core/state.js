// File: web/core/state.js
// TODO
// R151025: This file needs cleanup, it seems to have unfished work and need for detail where ambiguity arises,
// each line will be taged with R151025 once issues are addressed please remove the comments that prompted them.
//
// R151025: why unused imports? e.g. deprecated or unfinished?
// R151025: state.js we need to reflect in "real" time the state of parameters of settings (e.g. starting at line 10 from state.js) at the developer panel since currently the user needs to change the code for many settings parametization. The "Developer Panel"  has a "State Inspector" that is a good candidate for where do this could be the "State Inspector". The current "State Inspector" is fixed and it does not reflect the actual settings in "real" time, instead it reflects the defaults. 

import { structuredLog } from '../utils/logging.js';
import { addIdbLog, getAllIdbLogs } from '../utils/idb-logger.js';
import { availableGridsData } from '../video/grids/available-grids.js';
import { availableEnginesData } from '../audio/synths/available-synths.js';
import { availableLanguagesData } from '../languages/available-languages.js';
import { computeDefaultUpdateInterval, computeDefaultMaxNotes, deviceSummary } from '../utils/performance.js';
import { BUILD_VERSION, AUDIO_VERSION, VIDEO_VERSION, UI_VERSION, LANGUAGES_VERSION, UTILS_VERSION } from './constants.js';


export let settings = {
  debugLogging: true,
  // Debug configuration for tracing and diagnostics
  debugConfig: {
    traceFrames: false,  // Enable frame-by-frame tracing (performance impact, dev-panel only)
    traceUserActions: true,  // Always trace user actions for analytics
  },
  stream: null,
  availableGrids: availableGridsData || [],
  availableEngines: availableEnginesData || [],
  availableLanguages: availableLanguagesData || [],
  audioTimerId: null,
  updateInterval: 166, // 6 FPS default (166ms = ~6fps) for stable debugging
  autoFPS: false, // Disabled during debugging to prevent adaptive interference
  // Phase 2: performance tuning flags (can be adjusted at runtime by UI or tests)
  autoFpsDownscale: 0.25, // fraction of full canvas to use for benchmark (0.25 = 25%)
  autoFpsSamples: 2, // number of benchmark samples to take (1..4)
  enableFrameWorker: true, // opt-in flag to use OffscreenCanvas + Worker for frame processing
  // When true, transfer ArrayBuffer ownership to the worker to avoid copies
  // and prefer a reusable buffer allocation (main thread should allocate once).
  // Enabled by default for higher-performance paths.
  // TODO R151925: Describe in detail the "paths"
  workerTransferEnabled: false,
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
  // Performance-optimized ingest preferences (JSON serializable)
  ingestPreferences: {
    useIdleCallback: true,
    maxEventsPerSecond: 10,
    enableOnLowPerformance: true,
    enableOnMobile: true,
    // Configurable optimization thresholds 
    performanceThresholds: {
      lowCpuCores: 2,         // Optimize if CPU cores <= 2
      lowMemoryGB: 2,         // Optimize if RAM <= 2GB
      slowConnectionTypes: ['slow-2g', '2g'], // Connection types that trigger optimization
      mobileOptimization: true // Enable mobile-specific optimizations
    }
  },
  // Developer-friendly dynamic categorization for pipeline optimization events
  ingestCategories: {
    user_workflow: ['startProcessing', 'stopProcessing', 'toggleProcessing', 'setMode'],
    performance_critical: ['audioCuesReady', 'setFrameProviderThrottle', 'logFrameBenchmark'],
    auto_optimization: ['setFrameInterval', 'diagnosticTick'],
    performance_settings: ['setMaxNotes', 'setMotionThreshold', 'setAutoFPS']
  },
  // Unified event categorization for EventBus (replaces separate log/ingest systems)
  // Structure: { category: { sampleRate, destinations } }
  eventCategories: {
    // Log levels
    'DEBUG': { sampleRate: 0.01, destinations: ['console', 'eventBus'] },
    'INFO': { sampleRate: 1.0, destinations: ['console', 'eventBus', 'indexedDB'] },
    'WARN': { sampleRate: 1.0, destinations: ['console', 'eventBus', 'indexedDB'] },
    'ERROR': { sampleRate: 1.0, destinations: ['console', 'eventBus', 'indexedDB', 'analytics'] },
    // Command categories
    'user_workflow': { sampleRate: 1.0, destinations: ['eventBus', 'analytics'] },
    'performance_critical': { sampleRate: 0.1, destinations: ['eventBus'] },
    'auto_optimization': { sampleRate: 0.05, destinations: ['eventBus'] },
    'performance_settings': { sampleRate: 1.0, destinations: ['eventBus', 'analytics'] },
    // Specific commands
    'startProcessing': { sampleRate: 1.0, destinations: ['eventBus', 'analytics'] },
    'stopProcessing': { sampleRate: 1.0, destinations: ['eventBus', 'analytics'] },
    'audioCuesReady': { sampleRate: 0.01, destinations: ['eventBus'] },
    'setFrameInterval': { sampleRate: 0.1, destinations: ['eventBus'] }
  },
  dayNightMode: 'day',
  resetStateOnError: true,
  // TODO R311025 update this work inprogress below
  //  --- WIP: ARCH-3 --- 
  // Dual-mode prototype flags and runtime guard. R151025 WE ARE NOW DEVELOPENT A MULTI PARADGIM 
  // This is an experimental feature. Do not remove or change without referencing TASKS.md ARCH-3.
  // Current operating mode: 'flow' (navigation) or 'focus' (identification) R151025: UPDATE the hybrid approach
  currentMode: 'flow',
  depthPath: 'pseudo', // 'pseudo' or 'cnn' // R151025: i had the idea that will do WebGL/vanilly JS paths, is it this?
  // When true, mode switches are simulated and heavy ML paths should be blocked by producers.
  dualModeWIP: true, // R151025: WIP was meant to indicate Work In Progress, having it the declaration it self is qute a code smell: dualModeWIP 
  // Enable optional semantic detection (person/tree/rough_ground/trash/box) for educational purposes
  // Default: false (off) for performance. Can be toggled via dev panel for learning/exploration
  enableSemanticDetection: false,
  // --- END WIP ---
  motionThreshold: 20,
  maxNotes: computeDefaultMaxNotes(24) // <<< The new decoupled polyphony setting, later we should work in dinamical setting for this value R151025: lets check this limit is not a issue in regard of soem sound issues like the lack of persistence
  ,
  // Expose build/version information to the rest of the app via engine state.
  buildInfo: {
    version: BUILD_VERSION,
    audio_version: AUDIO_VERSION,
    video_version: VIDEO_VERSION,
    ui_version: UI_VERSION,
    languages_version: LANGUAGES_VERSION,
    utils_version: UTILS_VERSION
  }
};

// Detect local/test environments where telemetry should be disabled by default. R151025 where did the rationally that telemetry is not needed for local environments?, i dont see the use of this and it might be better removed
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
    ingestEnabled: 'boolean',
    ingestPreferences: 'object',
    ingestCategories: 'object',
    dayNightMode: 'string',
    resetStateOnError: 'boolean',
    motionThreshold: 'number',
    currentMode: 'string',
    enableSemanticDetection: 'boolean'
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

// R151025: lets document better what is saved to configs, if it is only this... we could do a lot better
/**
 * Initializes default settings from the loaded configuration files.
 * This runs after the config files have been fetched and parsed.
 */
function initializeDefaults() {
  structuredLog('INFO', 'Initializing settings from loaded configs.'); // R151025: is this actualy loading settings configs? the section comments staes that this loads defaults 

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
  
  // Log settings with sanitized grids/engines (remove large meta objects to keep logs lean)
  // Also exclude orchestration from settings logging (it's a separate state field, not settings)
  const sanitizedSettings = {
    ...settings,
    availableGrids: settings.availableGrids.map(g => ({ id: g.id })),
    availableEngines: settings.availableEngines.map(e => ({ id: e.id })),
    availableLanguages: settings.availableLanguages.map(l => ({ id: l.id }))
  };
  delete sanitizedSettings.orchestration; // orchestration is NOT part of settings
  structuredLog('INFO', 'Settings initialized', { settings: sanitizedSettings });

  try {
    const t = localStorage.getItem('ingestEnabled');
    if (t === '0') settings.ingestEnabled = false;
    else if (t === '1') settings.ingestEnabled = true;
    else if (IS_LOCALHOST) {
      // Default to disabled on localhost/test to avoid accidental network calls. R151025: explain such "accidental network calls"
      settings.ingestEnabled = false;
    }
  } catch (e) {
    // ignore localStorage access errors
  }
}

initializeDefaults();

// --- REMOVED loadConfigs: configs are now loaded statically via import --- R151025 Do wee need to keep this comment?

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

// NOTE: Direct state mutators were intentionally removed. All state updates
// must go through the engine command handlers (see future/web/core/commands/).
// Keep the settings object exported; mutations should be performed by command
// handlers which call engine.setState(...) so changes are traceable.

// Removed: lastTTSTime moved to utils/utils.js module scope (TTS-specific state)