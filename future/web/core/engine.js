// File: web/core/engine.js
// R24925: A cleanup is observerd as needed 
// Minimal headless engine: owns state and exposes a dispatch API for commands.
import { settings } from './state.js';
import { structuredLog } from '../utils/logging.js';
import logger from '../utils/logging.js';
import { getText, speakText, announceMessage } from '../utils/utils.js'; // <-- REDUCED IMPORTS
import { startCamera as mediaStartCamera, stopCamera as mediaStopCamera, isCameraActive } from './media-controller.js';
import { startMic, stopMic } from './microphone-controller.js'; //R24925 TODO:REDUCTION
import { setMicStream, setAutoFpsBenchmark, allocateFrameBuffer } from './state.js';
import { getPreferredIntervalMs } from '../utils/performance.js';
import * as audioProcessor from '../audio/audio-processor.js';
import { registerTouchGestureCommands } from './commands/touch-gesture-commands.js'; 
import { registerMediaCommands } from './commands/media-commands.js';
import { registerSettingsCommands } from './commands/settings-commands.js';
import { registerDebugCommands } from './commands/debug-commands.js';
import { registerUICommands } from './commands/ui-commands.js';
import { registerPerformanceCommands } from './commands/performance-commands.js';
import { registerSonificationCommands } from './commands/sonification-commands.js'; 
import { initializeScheduler } from './scheduler.js'; 
import { registerDiagnosticsCommands } from './commands/diagnostics-commands.js'; 

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

  // --- Scheduler internals (single-run lock + one-pending-frame) ---
  // These live in the engine closure and are manipulated by start/stopProcessing
  let _processingLock = false;
  let _pending = false;
  let _lastRunTs = 0;
  let _schedulerTimerId = null;
  let _videoElForScheduler = null;
  let _canvasElForScheduler = null;

  async function _runScheduled() {
    try {
      // If not processing anymore, bail out
      if (!state.isProcessing) {
        _schedulerTimerId = null;
        return;
      }

      // If a frame is already running, mark pending and return
      if (_processingLock) {
        _pending = true;
        return;
      }

      _processingLock = true;
      _pending = false;

      const now = Date.now();
      // determine preferred interval (ms) - respects autoFPS and persisted benchmarks
      let targetMs = 0;
      try { targetMs = await getPreferredIntervalMs(); } catch (e) { targetMs = Math.max(8, Math.round(1000 / Math.max(1, Number(state.updateInterval) || 15))); }

      // Enforce minimum spacing since last run
      const since = Math.max(0, now - (_lastRunTs || 0));
      if (since < targetMs) {
        // schedule for remaining time
        const delay = Math.max(1, Math.round(targetMs - since));
        _processingLock = false;
        _schedulerTimerId = setTimeout(_runScheduled, delay);
        state.processingTimerId = _schedulerTimerId;
        return;
      }

      _lastRunTs = Date.now();
      // Await the dispatch to ensure the processing lock is held for the entire duration
      // of the frame analysis (prevents concurrent processing of frames).
      try {
        await dispatch('processFrame', { videoEl: _videoElForScheduler, canvasEl: _canvasElForScheduler });
      } catch (e) { structuredLog('WARN', 'scheduler dispatch processFrame failed', { error: e?.message }); }

      _processingLock = false;

      // If a pending frame was requested while we were running, schedule next immediately
      if (_pending) {
        _pending = false;
        _schedulerTimerId = setTimeout(_runScheduled, 0);
      } else {
        // otherwise schedule next respecting targetMs
        _schedulerTimerId = setTimeout(_runScheduled, targetMs);
      }
      state.processingTimerId = _schedulerTimerId;
    } catch (e) {
  structuredLog('WARN', 'scheduler run failed', { error: e?.message || String(e) });
  try { logger.logError && logger.logError(e); } catch (er) {}
      _processingLock = false;
      _schedulerTimerId = setTimeout(_runScheduled, Math.max(8, Math.round(1000 / Math.max(1, Number(state.updateInterval) || 15))));
      state.processingTimerId = _schedulerTimerId;
    }
  }

  async function dispatch(commandName, payload = {}) {
    const handler = handlers[commandName];
    if (!handler) {
      structuredLog('WARN', `Engine: no handler for command ${commandName}`);
      return { ok: false, error: `no handler: ${commandName}` };
    }
    try {
      // Only log noisy commands like processFrame if verbose debug logging is enabled.
      if (commandName !== 'processFrame') {
        structuredLog('DEBUG', `Engine dispatch ${commandName}`, { payload });
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
  
  // --- MEDIA WRAPPER HANDLERS ---
  // These wrappers delegate to the media module which registers its handlers under
  // namespaced keys (see registration below). Wrappers manage the engine scheduler
  // state and timer.
  registerCommandHandler('startProcessing', async (context) => {
    const mediaHandler = handlers['__media_startProcessing'];
    if (!mediaHandler) throw new Error('media startProcessing handler not registered');
    const result = await mediaHandler(context);
    _videoElForScheduler = result?.videoEl || null;
    _canvasElForScheduler = result?.canvasEl || null;
    state.isProcessing = true;

    if (_schedulerTimerId != null) clearTimeout(_schedulerTimerId);
    _schedulerTimerId = setTimeout(_runScheduled, 0);
    state.processingTimerId = _schedulerTimerId;
    return { timerId: _schedulerTimerId };
  });

  registerCommandHandler('stopProcessing', async (context) => {
    const mediaHandler = handlers['__media_stopProcessing'];
    if (!mediaHandler) throw new Error('media stopProcessing handler not registered');
    const result = await mediaHandler(context);

    if (_schedulerTimerId != null) {
      clearTimeout(_schedulerTimerId);
      _schedulerTimerId = null;
    }
    _processingLock = false;
    _pending = false;
    state.processingTimerId = null;
    state.isProcessing = false;
    _videoElForScheduler = null;
    _canvasElForScheduler = null;

    return result;
  });

  // --- INITIALIZE ALL COMMAND HANDLERS ---
  const engineInstance = {
    dispatch,
    registerCommandHandler,
    onStateChange,
    getState,
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
  registerSonificationCommands(engineInstance); 
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

  // Register media-related command handlers under a namespaced key to avoid
  // colliding with the engine's public wrapper handlers. Media module will
  // register `startProcessing`, `stopProcessing`, `processFrame` which we
  // expose as `__media_startProcessing`, etc.
  registerMediaCommands({
    registerCommandHandler: (name, fn) => { handlers[`__media_${name}`] = fn; },
    dispatch: engineInstance.dispatch,
  });

  // Register settings and debug command modules
  registerSettingsCommands(engineInstance);
  registerDebugCommands(engineInstance);
  registerUICommands(engineInstance);
  registerPerformanceCommands(engineInstance);
  registerDiagnosticsCommands(engineInstance);

  return engineInstance;
}