// File: web/core/engine.js
// R291025 if unused import are not needed anymore, remove.
// R24925: A cleanup is observerd as needed 
// R29925: too much leftovers, clean ASAP
// Minimal headless engine: owns state and exposes a dispatch API for commands.

import { createInitialState } from './state.js';
import { structuredLog, throttleError, shouldSample } from '../utils/logging.js';
import { generateTraceId } from '../utils/trace-id.js';
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
import { mergeOrchestrationState } from './orchestration-state.js';

// Core engine state and functionality


export function createEngine() {
  let state = createInitialState();
  
  // Initialize orchestration state on engine creation
  state = mergeOrchestrationState(state);
  
  const listeners = new Set();
  const handlers = Object.create(null);
  const benchmarkListeners = new Set();
  // Simple event bus for lifecycle and cross-module events
  const eventBus = new Map();
  
  // Resource request handlers (ADR-0011: Event-driven DOM provisioning)
  const resourceHandlers = new Map();
  
  // Unified EventBus instance (injected after engine creation)
  let unifiedEventBus = null;
  
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

  // Keep a small in-memory registry to avoid noisy repeated errors R171025 lets explain this approach better, e.g. "how much memory? is it ram?"
  const _invalidListenerSeen = new Set();
  const _listenerErrorCounts = new Map();
  const _selectiveListeners = new Map(); // Maps selector functions to callbacks and their last state
  
  function notifyListeners() {
    for (const candidate of Array.from(listeners)) {
      // Validate listener is callable. If not, remove and warn once.
      if (typeof candidate !== 'function') {
        const key = String(candidate);
        if (!_invalidListenerSeen.has(key)) {
          _invalidListenerSeen.add(key);
          structuredLog('WARN', 'Engine: removed non-function listener', { listenerType: typeof candidate });
        }
        listeners.delete(candidate);
        continue;
      }

      try {
        candidate(state);
      } catch (e) {
        const t = throttleError(e, { sampleEvery: 50 });
        if (t.log) {
          structuredLog('WARN', 'engine listener error', { error: e?.message, stack: e?.stack, occurrences: t.occurrences });
          try { logger.logError && logger.logError(e); } catch (er) {}
        }
      }
    }
    
    // Notify selective listeners: only if their selector result changed
    for (const [selector, entry] of _selectiveListeners) {
      try {
        const newValue = selector(state);
        const oldValue = entry.lastValue;
        // Only call callback if selected value changed (shallow equality)
        if (newValue !== oldValue) {
          entry.lastValue = newValue;
          entry.callback(newValue, oldValue);
        }
      } catch (e) {
        const t = throttleError(e, { sampleEvery: 50 });
        if (t.log) {
          structuredLog('WARN', 'engine selective listener error', { error: e?.message, stack: e?.stack });
        }
      }
    }
  }

  function onStateChange(fn) {
    if (typeof fn !== 'function') {
      structuredLog('WARN', 'onStateChange: attempted to register non-function listener', { listenerType: typeof fn });
      return () => {};
    }
    listeners.add(fn);
    try { fn(state); } catch (e) { 
      // If initial call throws, record it but avoid spamming
      const errKey = e && e.message ? `${e.name || 'Error'}:${e.message}` : 'unknown_init_listener_error';
      const prev = _listenerErrorCounts.get(errKey) || 0;
      _listenerErrorCounts.set(errKey, prev + 1);
      if (prev === 0) structuredLog('WARN', 'engine listener initial call failed', { error: e?.message });
    }
    return () => listeners.delete(fn);
  }

  /**
   * Selective subscription: only calls callback when selector(state) changes.
   * Reduces re-renders by only firing callbacks for state slices that matter to the listener.
   * Example: subscribe(s => s.isProcessing, (processing) => {...})
   * @param {Function} selector - Function that extracts a value from state
   * @param {Function} callback - Called with (newValue, oldValue) when selector result changes
   * @returns {Function} Unsubscribe function
   */
  function subscribe(selector, callback) {
    if (typeof selector !== 'function' || typeof callback !== 'function') {
      structuredLog('WARN', 'subscribe: selector and callback must be functions', { selectorType: typeof selector, callbackType: typeof callback });
      return () => {};
    }
    try {
      const initialValue = selector(state);
      const entry = { lastValue: initialValue, callback };
      _selectiveListeners.set(selector, entry);
      // Call once with initial value
      callback(initialValue, undefined);
    } catch (e) {
      structuredLog('WARN', 'subscribe: initial selector call failed', { error: e?.message });
    }
    return () => _selectiveListeners.delete(selector);
  }

  function setState(newState) {
    Object.assign(state, newState);
    notifyListeners();
  }

  function getState() {
    // return a shallow copy to encourage immutability at the boundary
    try { return { ...state }; } catch (e) { return state; }
  }

  // --- STATE SELECTORS (ADR-0011: Hexagonal Architecture Purity) ---
  // Encapsulate state structure to prevent Law of Demeter violations in UI
  // UI should use selectors instead of accessing deep state properties
  
  /**
   * Get metrics data (FPS, memory, performance stats)
   * @returns {Object} Metrics object with null-safe access
   */
  function getMetrics() {
    return {
      fps: state.orchestration?.metrics?.fps ?? 0,
      memoryUsageMB: state.metrics?.memoryUsageMB ?? 0,
      activeWorkers: state.orchestration?.metrics?.activeWorkers ?? 0,
      frameLatencyMs: state.orchestration?.metrics?.frameLatencyMs ?? 0,
      audioLatencyMs: state.metrics?.audioLatencyMs ?? 0,
      // Add other metrics as needed
    };
  }

  /**
   * Get orchestration state (active extractors, capabilities, decision log)
   * @returns {Object} Orchestration data with null-safe access
   */
  function getOrchestration() {
    return {
      activeExtractor: state.orchestration?.activeExtractor ?? null,
      activeFrameProvider: state.orchestration?.activeFrameProvider ?? null,
      capabilities: state.orchestration?.capabilities ?? {},
      decisionLog: state.orchestration?.decisionLog ?? [],
      currentMode: state.currentMode ?? 'flow',
      isProcessing: state.orchestration?.isProcessing ?? false,
      metrics: state.orchestration?.metrics ?? {},
      videoWorkerDebugConfig: state.videoWorkerDebugConfig ?? null,
    };
  }

  /**
   * Get video state (current mode, canvas usage, frame provider)
   * @returns {Object} Video state with null-safe access
   */
  function getVideoState() {
    return {
      currentMode: state.currentMode ?? 'flow',
      usingCanvas: state.videoCapture?.usingCanvas ?? false,
      detectedAt: state.videoCapture?.detectedAt ?? null,
      activeFrameProvider: state.orchestration?.activeFrameProvider ?? null,
      frameProviderOverride: state.frameProviderOverride ?? null,
    };
  }

  // --- RESOURCE REQUEST API (ADR-0011: Headless Core) ---
  // Core layer requests resources (video elements, etc.) via events
  // UI adapter provides them without Core knowing about DOM
  
  /**
   * Request a resource from the UI layer
   * @param {string} resourceType - 'VIDEO_ELEMENT', 'AUDIO_ELEMENT', etc.
   * @param {Object} config - Request configuration
   * @returns {Promise<any>} The requested resource
   */
  async function requestResource(resourceType, config = {}) {
    const handler = resourceHandlers.get(resourceType);
    if (!handler) {
      structuredLog('ERROR', `No handler registered for resource: ${resourceType}`);
      throw new Error(`Resource not available: ${resourceType}`);
    }
    
    try {
      const resource = await handler(config);
      structuredLog('DEBUG', `Resource provided: ${resourceType}`);
      return resource;
    } catch (error) {
      structuredLog('ERROR', `Resource request failed: ${resourceType}`, {
        error: error.message
      });
      throw error;
    }
  }
  
  /**
   * Register a handler for resource requests (called by UI adapters)
   * @param {string} resourceType - 'VIDEO_ELEMENT', 'AUDIO_ELEMENT', etc.
   * @param {Function} handler - Function that returns the resource
   * @returns {Function} Unsubscribe function
   */
  function onResourceRequest(resourceType, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Resource handler must be a function');
    }
    
    resourceHandlers.set(resourceType, handler);
    structuredLog('DEBUG', `Resource handler registered: ${resourceType}`);
    
    return () => {
      resourceHandlers.delete(resourceType);
      structuredLog('DEBUG', `Resource handler unregistered: ${resourceType}`);
    };
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

  async function dispatch(commandName, payload = {}, options = {}) {
    const handler = handlers[commandName];
    
    if (!handler) {
      structuredLog('WARN', `Engine: no handler for command ${commandName}`);
      return { ok: false, error: `no handler: ${commandName}` };
    }
    try {
      // Generate or inherit traceId for event correlation
      const traceId = options.traceId || payload.traceId || generateTraceId();
      
      // Emit to unified EventBus before executing handler
      if (unifiedEventBus) {
        try {
          unifiedEventBus.emit({
            type: 'command',
            category: commandName,
            timestamp: Date.now(),
            data: payload,
            traceId: traceId
          });
        } catch (err) {
          // Silently fail - don't break command dispatch if EventBus has issues R311025 id rather do no have silent fails
          console.warn('Failed to emit command to EventBus:', err);
        }
      }
      
      // Enhanced debug logging for command dispatch
      const handlerInfo = {
        command: commandName,
        handlerExists: !!handler,
        availableHandlers: Object.keys(handlers).filter(k => k.includes(commandName)),
        traceId: traceId
      };
      
      // Aggressive sampling for DEBUG logs to reduce dev panel spam
      const isHighFrequencyCommand = ['audioCuesReady', 'logFrameBenchmark'].includes(commandName);
      const isPerformanceCommand = ['startProcessing', 'stopProcessing', 'switchMode', 'setFrameProviderThrottle'].includes(commandName);
      
      // Performance commands are now handled by ingest system, so reduce their direct logging
      let shouldLog = false;
      if (isPerformanceCommand) {
        shouldLog = shouldSample('workerProcessing'); // Only 5% chance for performance commands (ingest handles them)
      } else if (isHighFrequencyCommand) {
        shouldLog = Math.random() < 0.02; // Only 2% chance for high-frequency commands
      } else {
        shouldLog = shouldSample('audioSynthesis'); // 10% chance for other commands
      }
      
      if (shouldLog) {
        structuredLog('DEBUG', `Engine dispatch ${commandName}`, { payload, ...handlerInfo });
      }
      
      // Pass traceId to handler via context
      const result = await handler({ state, payload, dispatch, emit, traceId });
      
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
    subscribe,
    getState,
    setState,
    // State Selectors (ADR-0011) - prevent Law of Demeter violations
    getMetrics,
    getOrchestration,
    getVideoState,
    // Resource Request API (ADR-0011) - headless core pattern
    requestResource,
    onResourceRequest,
    onBenchmarkRequired,
    // Expose telemetry for testing/inspecting fallback counters
    getTelemetry: () => ({ ..._telemetry }),
    // TODO R311025 address R240619 
    // Allow external modules to query benchmark listeners for performance tuning R240619: tell me more about this
    getBenchmarkListeners: () => Array.from(benchmarkListeners),
    // Inject unified EventBus after engine creation (dependency injection pattern)
    setEventBus: (eventBusRef) => {
      unifiedEventBus = eventBusRef;
      structuredLog('DEBUG', 'Engine: unified EventBus injected', {});
    },

    // Expose injected EventBus for convenience/access by UI modules
    // Some UI modules expect `engine.eventBus` to be present; set it here.
    // NOTE: This is a shallow convenience reference to the injected bus.
    // The canonical contract remains dependency injection via setEventBus().
    // eslint-disable-next-line accessor-pairs
    get eventBus() { return unifiedEventBus; },
    // Expose traceId generator for explicit use
    generateTraceId: generateTraceId
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
    // Defensive check: ensure result and gridFlows exist
    if (!result || !result.gridFlows) {
      structuredLog('WARN', 'flowCuesReady: invalid or missing result data', { 
        hasResult: !!result,
        hasGridFlows: !!result?.gridFlows,
        resultKeys: result ? Object.keys(result) : []
      });
      return state; // Return unchanged state
    }
    
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