// File: web/core/engine.js
// R24925: A cleanup is observerd as needed 
// R29925: too much leftovers, clean ASAP
// Minimal headless engine: owns state and exposes a dispatch API for commands.

import { settings } from './state.js';
import { structuredLog } from '../utils/logging.js';
import logger from '../utils/logging.js';
import { getText, speakText, announceMessage } from '../utils/utils.js'; // <-- REDUCED IMPORTS
import { startCamera as mediaStartCamera, stopCamera as mediaStopCamera, isCameraActive, startMic, stopMic } from './media-controller.js';
// Removed direct state mutator imports; state updates must go through engine commands.
import { getPreferredIntervalMs } from '../utils/performance.js';
import * as audioProcessor from '../audio/audio-processor.js';
import { registerTouchGestureCommands } from './commands/touch-gesture-commands.js'; 
import { registerMediaCommands } from './commands/media-commands.js';
import { registerSettingsCommands } from './commands/settings-commands.js';
import { registerDebugCommands } from './commands/debug-commands.js';
import { registerPersistenceCommands } from './commands/persistence-commands.js';
import { registerPerformanceCommands } from './commands/performance-commands.js';
import { registerSonificationCommands } from './commands/sonification-commands.js'; 
import { registerModeCommands } from './commands/mode-commands.js';
import { initializeScheduler } from './scheduler.js'; 
import { registerDiagnosticsCommands } from './commands/diagnostics-commands.js'; 

// Core engine state and functionality

function _resolveStateModule() {
  // In Jest tests we rely on runtime require to pick up per-test mocks. In
  // browser environments `require` is not defined so fall back to the static
  // imported binding above.
  try {
    if (typeof require !== 'undefined') {
      const m = require('./state.js');
      if (m && m.settings) return m;
    }
  } catch (e) {
    // ignore and fall through
  }
  return { settings };
}

export function createEngine() {
  const state = _resolveStateModule().settings; // legacy shared settings object for incremental migration
  const listeners = new Set();
  const handlers = Object.create(null);
  const benchmarkListeners = new Set();
  // Simple event bus for lifecycle and cross-module events
  const eventBus = new Map();
  // Telemetry counters for buffer fallback events (per-engine instance)
  const _telemetry = {
    fallback_realloc_failed: 0,
    fallback_size_mismatch_no_realloc: 0,
    fallback_exception: 0,
    fallback_skipped_hysteresis: 0
  };

  // Simple rate-limited logger: allow one log per key per intervalMs
  const _lastLogTs = Object.create(null);
  function rateLimitedLog(key, level, message, data = {}, intervalMs = 5000) {
    try {
      const now = Date.now();
      const last = _lastLogTs[key] || 0;
      if (now - last >= intervalMs) {
        _lastLogTs[key] = now;
        structuredLog(level, message, data);
      }
    } catch (e) { /* best-effort */ }
  }

  function notifyListeners() {
    for (const fn of Array.from(listeners)) {
      try { fn(state); } catch (e) { 
        structuredLog('WARN', 'engine listener error', { error: e?.message });
        try { logger.logError && logger.logError(e); } catch (er) {}
      }
    }
  }

  function onStateChange(fn) {
    listeners.add(fn);
    try { fn(state); } catch (e) { /* best-effort */ }
    return () => listeners.delete(fn);
  }

  function setState(newState) {
    // --- TEMPORARY DEBUGGING LOG ---
    if ('isProcessing' in newState) {
      console.log(`ENGINE: setState called to set isProcessing=${newState.isProcessing}`);
      console.trace("Stack trace for isProcessing change:");
    }
    // --- END DEBUGGING LOG ---

    Object.assign(state, newState);
    notifyListeners();
  }

  function getState() {
    // return a shallow copy to encourage immutability at the boundary
    try { return { ...state }; } catch (e) { return state; }
  }

  function registerCommandHandler(name, fn) {
    handlers[name] = fn;
  }

  function onBenchmarkRequired(fn) {
    benchmarkListeners.add(fn);
    return () => benchmarkListeners.delete(fn);
  }

  // --- Event bus API (lightweight) ---
  function on(eventName, listener) {
    if (!eventBus.has(eventName)) eventBus.set(eventName, []);
    eventBus.get(eventName).push(listener);
    return () => {
      const list = eventBus.get(eventName);
      if (!list) return;
      const idx = list.indexOf(listener);
      if (idx > -1) list.splice(idx, 1);
    };
  }

  function emit(eventName, payload) {
    const list = (eventBus.get(eventName) || []).slice();
    for (const fn of list) {
      try { fn(payload); } catch (e) { structuredLog('ERROR', `Event listener for '${eventName}' failed`, { error: e?.message }); }
    }
  }

  async function dispatch(commandName, payload = {}) {
    const handler = handlers[commandName];
    
    if (!handler) {
      structuredLog('WARN', `Engine: no handler for command ${commandName}`);
      return { ok: false, error: `no handler: ${commandName}` };
    }
    try {
      // Enhanced debug logging for command dispatch
      const handlerInfo = {
        command: commandName,
        handlerExists: !!handler,
        availableHandlers: Object.keys(handlers).filter(k => k.includes(commandName))
      };
      
      // Aggressive sampling for DEBUG logs to reduce dev panel spam
      const isHighFrequencyCommand = ['audioCuesReady', 'logFrameBenchmark'].includes(commandName);
      const isPerformanceCommand = ['startProcessing', 'stopProcessing', 'switchMode', 'setFrameProviderThrottle'].includes(commandName);
      
      // Performance commands are now handled by ingest system, so reduce their direct logging
      let shouldLog = false;
      if (isPerformanceCommand) {
        shouldLog = Math.random() < 0.05; // Only 5% chance for performance commands (ingest handles them)
      } else if (isHighFrequencyCommand) {
        shouldLog = Math.random() < 0.02; // Only 2% chance for high-frequency commands
      } else {
        shouldLog = Math.random() < 0.1; // 10% chance for other commands
      }
      
      if (shouldLog) {
        structuredLog('DEBUG', `Engine dispatch ${commandName}`, { payload, ...handlerInfo });
      }
    const result = await handler({ state, payload, dispatch, emit });
      // notify after handler runs in case it mutated shared state
      notifyListeners();
      return { ok: true, result };
    } catch (err) {
  structuredLog('ERROR', `Engine handler ${commandName} failed`, { message: err?.message || String(err) });
  try { logger.logError && logger.logError(err); } catch (er) {}
      return { ok: false, error: err?.message || String(err) };
    }
  }
  
  // --- INITIALIZE ALL COMMAND HANDLERS ---
  const engineInstance = {
    dispatch,
    registerCommandHandler,
    onStateChange,
    getState,
    setState,
    onBenchmarkRequired,
  // Expose telemetry for testing/inspecting fallback counters
  getTelemetry: () => ({ ..._telemetry }),
  // Allow external modules to query benchmark listeners for performance tuning R240619: tell me more about this
  getBenchmarkListeners: () => Array.from(benchmarkListeners)
  };

  // Expose event bus methods
  engineInstance.on = on;
  engineInstance.emit = emit;

  // Initialize the application's main scheduler.
  initializeScheduler(engineInstance);

  // Register handlers from external modules
  registerTouchGestureCommands(engineInstance); 
  // Register haptic handler for pointer cues
  engineInstance.registerCommandHandler('pointerCuesReady', (state, result) => {
    if (state.currentMode !== 'focus' && state.currentMode !== 'hybrid') return state;
    const newState = { ...state, pointed: result };
    if (newState.hapticEnabled && result.object) {
      let pattern;
      switch (result.object) {
        case 'person': pattern = [100, 50, 100]; break;  // Vivo pulse
        case 'tree': pattern = [200]; break;  // Estático steady
        case 'rough_ground': pattern = [50, 50, 50]; break;  // Rapid alert colisión
        default: pattern = [100]; break;
      }
      if ('vibrate' in navigator) {
        navigator.vibrate(pattern);  // Dep-free haptic
      } else {
        structuredLog('WARN', 'No vibrate support');
      }
    }
    const cue = { profile: { type: result.object, freq: 400, gain: 0.8 } };
    return { ...newState, cueBuffer: [...newState.cueBuffer, cue] };
  });

  // Register setMode handler
  engineInstance.registerCommandHandler('setMode', (state, { mode }) => {
    if (['flow', 'focus', 'hybrid'].includes(mode)) {
      structuredLog('INFO', 'Mode switched', { mode });
      return { ...state, currentMode: mode, cueBuffer: [] };  // Clear buffer
    }
    structuredLog('ERROR', 'Invalid mode', { mode });
    return state;
  });

  // Register flowCuesReady handler with mode-specific logic
  engineInstance.registerCommandHandler('flowCuesReady', (state, result) => {
    const newCues = result.gridFlows.flat().map(f => ({
      profile: { type: 'motion', freq: 200 + f.mag * 100, gain: 0.5 }
    }));
    if (state.currentMode === 'hybrid') {
      newCues.push(...(result.objects || []).map(o => ({
        profile: { type: o, freq: o === 'rough_ground' ? 100 : 300, gain: 0.7 }
      })));
      if (state.hapticEnabled && 'vibrate' in navigator && result.objects.includes('rough_ground')) {
        navigator.vibrate([50, 50, 50]);  // Rapid alert para colisión
      } else if (!('vibrate' in navigator)) {
        structuredLog('WARN', 'No vibrate support');
      }
      if (result.textureGrid) {
        structuredLog('DEBUG', 'Cues', { textureGrid: result.textureGrid, objects: result.objects });
      } else {
        result.textureGrid = Array(4).fill().map(() => Array(4).fill(0));  // Fallback
      }
    }
    return { ...state, cueBuffer: [...state.cueBuffer, ...newCues] };
  });

  // Register bpmUpdate handler with debounce
  let lastBpmUpdate = 0;
  engineInstance.registerCommandHandler('bpmUpdate', (state, { bpm }) => {
    if (Math.abs(bpm - state.bpm) < 5) return state;  // Debounce small changes
    if (Date.now() - lastBpmUpdate < 500) return state;  // Time debounce
    lastBpmUpdate = Date.now();
    structuredLog('INFO', 'BPM updated', { bpm });
    return { ...state, bpm };
  });

  // Register toggleHaptic handler
  engineInstance.registerCommandHandler('toggleHaptic', (state, { enabled }) => {
    structuredLog('INFO', 'Haptic toggled', { enabled });
    // Audio feedback for toggle
    engineInstance.dispatch('playTestNote', { pitch: enabled ? 800 : 400, gain: 0.3 });
    return { ...state, hapticEnabled: enabled };
  });

  // Register depthCuesReady handler
  engineInstance.registerCommandHandler('depthCuesReady', (state, result) => {
    const depthCues = result.gridDepths.flat().map((depth, idx) => ({
      profile: { type: 'depth', freq: 200 + depth * 400, gain: 0.5 }  // High depth = low pitch for close
    }));
    return { ...state, cueBuffer: [...state.cueBuffer, ...depthCues] };
  }); 
  structuredLog('INFO', 'ENGINE: Attempting to register Sonification commands...');
  try {
    registerSonificationCommands(engineInstance);
    structuredLog('INFO', 'ENGINE: Sonification commands registration call completed.');
  } catch (e) {
    structuredLog('ERROR', 'ENGINE: Sonification registration threw', { error: e?.message || String(e) });
  }
  // Register audio command handlers in a dedicated module
  // Try dynamic import first (works in modern browsers). Fall back to require() for test environments.
  import('./commands/audio-commands.js').then(mod => {
    try { mod.registerAudioCommands && mod.registerAudioCommands(engineInstance); } catch (e) { structuredLog('WARN', 'registerAudioCommands failed', { error: e?.message || String(e) }); }
  }).catch((e) => {
    try {
      // eslint-disable-next-line no-undef
      const req = typeof require !== 'undefined' ? require('./commands/audio-commands.js') : null;
      if (req && req.registerAudioCommands) req.registerAudioCommands(engineInstance);
    } catch (err) {
      structuredLog('WARN', 'Failed to register audio commands', { error: err?.message || String(err) });
    }
  });

  // Register media commands directly - no wrapper indirection needed
  registerMediaCommands(engineInstance);

  // Register settings and debug command modules
  registerSettingsCommands(engineInstance);
  registerPersistenceCommands(engineInstance);
  registerDebugCommands(engineInstance);
  registerPerformanceCommands(engineInstance);
  registerDiagnosticsCommands(engineInstance);
  registerModeCommands(engineInstance);

  return engineInstance;
}