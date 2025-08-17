// Minimal headless engine: owns state and exposes a dispatch API for commands.
import { settings } from './state.js';
import { structuredLog } from '../utils/logging.js';
import { getText, speakText, setLanguage, translatePage, announceMessage } from '../utils/utils.js';
import { trackFeatureUse } from '../core/ingest.js';
import { startCamera as mediaStartCamera, stopCamera as mediaStopCamera, isCameraActive } from './media-controller.js';
import { startMic, stopMic } from './microphone-controller.js';
import { computeAutoIntervalBenchmark, getPreferredIntervalMs } from '../utils/performance.js';
import { setAutoFpsBenchmark } from './state.js';
import { processFrameWithState } from '../video/frame-processor.js';
import { playCues, playAudio, resizeOscillatorPool } from '../audio/audio-processor.js';

export function createEngine() {
  const state = settings; // legacy shared settings object for incremental migration
  const listeners = new Set();
  const handlers = Object.create(null);
  const benchmarkListeners = new Set();

  function notifyListeners() {
    for (const fn of Array.from(listeners)) {
      try { fn(state); } catch (e) { structuredLog('WARN', 'engine listener error', { error: e?.message }); }
    }
  }

  function onStateChange(fn) {
    listeners.add(fn);
    try { fn(state); } catch (e) { /* best-effort */ }
    return () => listeners.delete(fn);
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
      // dispatch frame processing (fire-and-forget)
      try { dispatch('processFrame', { videoEl: _videoElForScheduler, canvasEl: _canvasElForScheduler }); } catch (e) { structuredLog('WARN', 'scheduler dispatch processFrame failed', { error: e?.message }); }

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
      structuredLog('DEBUG', `Engine dispatch ${commandName}`, { payload });
      const result = await handler({ state, payload, dispatch });
      // notify after handler runs in case it mutated shared state
      notifyListeners();
      return { ok: true, result };
    } catch (err) {
      structuredLog('ERROR', `Engine handler ${commandName} failed`, { message: err?.message || String(err) });
      return { ok: false, error: err?.message || String(err) };
    }
  }

  // --- Register a couple of small, safe handlers for incremental migration ---
  registerCommandHandler('toggleSettingsMode', async ({ state: s }) => {
    s.isSettingsMode = !s.isSettingsMode;
    return { state: s };
  });

  registerCommandHandler('announceSettingsMode', async ({ state: s }) => {
    try {
      const key = s.isSettingsMode ? 'button6.tts.settingsToggle.on' : 'button6.tts.settingsToggle.off';
      const msg = await getText(key).catch(() => null);
      if (msg && typeof speakText === 'function') speakText(msg);
    } catch (e) {
      structuredLog('WARN', 'announceSettingsMode failed', { error: e?.message });
    }
  });

  // Cycle language: compute next language id, persist via setLanguage, run translation pass
  registerCommandHandler('cycleLanguage', async ({ state: s }) => {
    try {
      const langs = (s.availableLanguages || []).map(l => l.id);
      if (!langs || langs.length === 0) return;
      const current = s.language || langs[0];
      const idx = Math.max(0, langs.indexOf(current));
      const next = langs[(idx + 1) % langs.length];
  // Persist selection and preload translations
  await setLanguage(next);
  s.language = next;
      // Re-run translation pass for the document
      try { await translatePage(document); } catch (e) { /* best-effort */ }
      // Announce change
      const languageName = next; // renderer may compute nicer display name
      try {
        const announce = await getText('button3.tts.languageSelect', { state: languageName });
        announceMessage(announce);
        if (typeof speakText === 'function') speakText(announce);
      } catch (e) {
        // fallback
        const fallback = await getText('language.set', { languageName }).catch(() => `Language set to ${languageName}`);
        announceMessage(fallback);
        if (typeof speakText === 'function') speakText(fallback);
      }
      try { trackFeatureUse('language-switch', { language: next }); } catch (e) {}
    } catch (e) {
      structuredLog('ERROR', 'engine.cycleLanguage failed', { error: e?.message || String(e) });
    }
  });

  // Camera controls: payload may include { videoEl, canvasEl }
  registerCommandHandler('startCamera', async ({ state: s, payload }) => {
    try {
      const { videoEl, canvasEl } = payload || {};
      await mediaStartCamera(videoEl, { facingMode: 'environment' });
      // Notify that stream is active in settings
  if (videoEl && videoEl.srcObject) s.stream = videoEl.srcObject;
  // Start frame capture if UI exposed functions on DOM
  try { if (videoEl && videoEl._startCameraFrameCapture) videoEl._startCameraFrameCapture(); } catch (e) {}
  return { started: true };
    } catch (e) {
      structuredLog('ERROR', 'engine.startCamera failed', { error: e?.message || String(e) });
      throw e;
    }
  });

  registerCommandHandler('stopCamera', async ({ state: s, payload }) => {
    try {
      const { videoEl } = payload || {};
      mediaStopCamera(videoEl);
      if (videoEl) {
        try { if (videoEl._stopCameraFrameCapture) videoEl._stopCameraFrameCapture(); } catch (e) {}
      }
  s.stream = null;
  return { started: false };
    } catch (e) {
      structuredLog('WARN', 'engine.stopCamera failed', { error: e?.message || String(e) });
      throw e;
    }
  });

  registerCommandHandler('toggleCamera', async ({ state: s, payload }) => {
    const { videoEl } = payload || {};
    const active = isCameraActive();
    try {
      if (active) {
        const res = await handlers.stopCamera({ state: s, payload });
        s.stream = null;
        return res;
      } else {
        const res = await handlers.startCamera({ state: s, payload });
        s.stream = (videoEl && videoEl.srcObject) || s.stream;
        return res;
      }
    } catch (e) {
      structuredLog('WARN', 'toggleCamera handler failed', { error: e?.message || String(e) });
      return { started: isCameraActive() };
    }
  });

  // Auto FPS toggle: flip flag; benchmark is UI responsibility but engine stores the flag
  registerCommandHandler('toggleAutoFps', async ({ state: s }) => {
    s.autoFPS = !s.autoFPS;
    return { state: s };
  });

  // Toggle microphone: start/stop mic stream and persist in state.micStream
  registerCommandHandler('toggleMicrophone', async ({ state: s }) => {
    try {
      if (s.micStream) {
        stopMic(s.micStream);
        s.micStream = null;
        return { micActive: false };
      }
      const stream = await startMic({ audio: true });
      s.micStream = stream;
      return { micActive: true };
    } catch (e) {
      structuredLog('WARN', 'toggleMicrophone failed', { error: e?.message || String(e) });
      throw e;
    }
  });

  // Start processing: start camera, set interval to call processFrame, set isProcessing flag
  registerCommandHandler('startProcessing', async ({ state: s, payload }) => {
    try {
      const { videoEl, canvasEl } = payload || {};
      // Start camera if not active
      await mediaStartCamera(videoEl, { facingMode: 'environment' });
      if (videoEl && videoEl.srcObject) s.stream = videoEl.srcObject;
      // initialize scheduler loop (single-run lock + one-pending-frame)
      // keep some scheduler state in closure so stopProcessing can cancel it
      if (!this || typeof this === 'undefined') {
        // noop - ensure closure exists
      }
      // store DOM refs for scheduler
      _videoElForScheduler = videoEl;
      _canvasElForScheduler = canvasEl;
      s.isProcessing = true;
      // kick off the scheduler immediately (it will respect target interval)
      try {
        if (_schedulerTimerId != null) try { clearTimeout(_schedulerTimerId); } catch (e) {}
        _schedulerTimerId = setTimeout(_runScheduled, 0);
      } catch (e) {
        structuredLog('WARN', 'startProcessing scheduler start failed', { error: e?.message });
      }
      s.processingTimerId = _schedulerTimerId;
      return { timerId: _schedulerTimerId };
    } catch (e) {
      structuredLog('ERROR', 'engine.startProcessing failed', { error: e?.message || String(e) });
      throw e;
    }
  });

  // Stop processing: stop camera, clear timer, reset flags
  registerCommandHandler('stopProcessing', async ({ state: s, payload }) => {
    try {
      const { videoEl } = payload || {};
      // clear scheduler timer if present
      try {
        if (_schedulerTimerId != null) {
          clearTimeout(_schedulerTimerId);
          _schedulerTimerId = null;
        }
      } catch (e) { /* ignore */ }
      // reset scheduler state
      _processingLock = false;
      _pending = false;
      s.processingTimerId = null;
      s.isProcessing = false;
      try { mediaStopCamera(videoEl); } catch (e) { /* ignore */ }
      s.stream = null;
      // clear DOM refs
      _videoElForScheduler = null;
      _canvasElForScheduler = null;
      return { stopped: true };
    } catch (e) {
      structuredLog('WARN', 'engine.stopProcessing failed', { error: e?.message || String(e) });
      throw e;
    }
  });

  // Actual frame processing handler: draw video -> read pixels -> call frame-processor
  registerCommandHandler('processFrame', async ({ state: s, payload }) => {
    try {
      const { videoEl, canvasEl } = payload || {};
      if (!videoEl || !canvasEl) return null;
      if (videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return null;
      const w = videoEl.videoWidth || canvasEl.width || 0;
      const h = videoEl.videoHeight || canvasEl.height || 0;
      if (w === 0 || h === 0) return null;
      const ctx = canvasEl.getContext('2d');
      try { ctx.drawImage(videoEl, 0, 0, w, h); } catch (e) { return null; }
      const img = ctx.getImageData(0, 0, w, h);
  const result = await processFrameWithState(img.data, w, h);
  // Dispatch audioPlayCues intent for other modules to consume
  try { dispatch('audioPlayCues', { cues: result.cues }); } catch (e) { /* best-effort */ }
      return result;
    } catch (e) {
      structuredLog('WARN', 'engine.processFrame failed', { error: e?.message || String(e) });
      return null;
    }
  });

  // Play notes: delegate to audio module
  registerCommandHandler('audioPlayCues', async ({ state: s, payload }) => {
    try {
      const cues = payload ? payload.cues : [];
      if (!Array.isArray(cues) || cues.length === 0) return { played: false };
      try { await playCues(cues); } catch (e) { structuredLog('WARN', 'audioPlayCues playCues failed', { error: e?.message }); }
      return { played: true, count: cues.length };
    } catch (e) {
      structuredLog('WARN', 'audioPlayCues handler failed', { error: e?.message || String(e) });
      return { played: false };
    }
  });

  // Backward-compatibility: keep audioPlayNotes for modules that still use it.
  registerCommandHandler('audioPlayNotes', async ({ state: s, payload }) => {
    try {
      const notes = payload && payload.result && payload.result.notes ? payload.result.notes : (payload && payload.notes) || [];
      if (!Array.isArray(notes) || notes.length === 0) return { played: false };
      try { await playAudio(notes); } catch (e) { structuredLog('WARN', 'audioPlayNotes playAudio failed', { error: e?.message }); }
      return { played: true, count: notes.length };
    } catch (e) {
      structuredLog('WARN', 'audioPlayNotes handler failed', { error: e?.message || String(e) });
      return { played: false };
    }
  });

  // Save settings: persist selected user settings to localStorage and speak feedback
  registerCommandHandler('saveSettings', async ({ state: s }) => {
    try {
      const settingsToSave = {
        gridType: s.gridType,
        synthesisEngine: s.synthesisEngine,
        language: s.language,
        autoFPS: s.autoFPS,
        updateInterval: s.updateInterval,
        dayNightMode: s.dayNightMode,
        ttsEnabled: s.ttsEnabled,
        resetStateOnError: s.resetStateOnError,
        audioResumeAttempts: s.audioResumeAttempts,
        audioResumeDelayMs: s.audioResumeDelayMs,
        maxNotes: s.maxNotes
      };
      localStorage.setItem('acoustsee-settings', JSON.stringify(settingsToSave));
      const msg = await getText('button4.tts.saveSettings').catch(() => null);
      if (msg) speakText(msg);
      return { saved: true };
    } catch (err) {
      structuredLog('ERROR', 'saveSettings error', { message: err.message, stack: err.stack });
      const errorMsg = await getText('button4.tts.saveError').catch(() => null);
      if (errorMsg) speakText(errorMsg);
      return { saved: false };
    }
  });

  // Load settings: read from localStorage, validate, apply to state and resize audio pool
  registerCommandHandler('loadSettings', async ({ state: s, dispatch: engineDispatch }) => {
    try {
      const savedSettings = localStorage.getItem('acoustsee-settings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        const expected = {
          gridType: 'string',
          synthesisEngine: 'string',
          language: 'string',
          autoFPS: 'boolean',
          updateInterval: 'number',
          dayNightMode: 'string',
          ttsEnabled: 'boolean',
          resetStateOnError: 'boolean',
          audioResumeAttempts: 'number',
          audioResumeDelayMs: 'number',
          maxNotes: 'number'
        };
        for (const key in expected) {
          if (Object.hasOwn(parsed, key) && typeof parsed[key] === expected[key]) {
            s[key] = parsed[key];
          }
        }
        const msg = await getText('button5.tts.loadSettings.loaded').catch(() => null);
        if (msg) speakText(msg);
        try { resizeOscillatorPool(s.maxNotes); } catch (e) { structuredLog('WARN', 'resizeOscillatorPool failed after loadSettings', { err: e?.message || String(e) }); }
      } else {
        const msg = await getText('button5.tts.loadSettings.none').catch(() => null);
        if (msg) speakText(msg);
      }
    } catch (err) {
      structuredLog('ERROR', 'Load settings error', { message: err.message, stack: err.stack });
      const errorMsg = await getText('button5.tts.loadError').catch(() => null);
      if (errorMsg) speakText(errorMsg);
    } finally {
      // notify UI via engine.dispatch of the updated state
      try { await dispatch('updateUI', { settingsMode: s.isSettingsMode, streamActive: !!s.stream, micActive: !!s.micStream }); } catch (e) {}
      return { loaded: true };
    }
  });

  // Cycle Grid: pick next available grid and resize audio pool if grid specifies maxNotes
  registerCommandHandler('cycleGrid', async ({ state: s }) => {
    try {
      const { availableGrids } = s;
      if (!availableGrids || availableGrids.length === 0) {
        structuredLog('WARN', 'cycleGrid: No available grids to toggle.');
        return { ok: false };
      }
      const idx = Math.max(0, (availableGrids.findIndex(g => g.id === s.gridType)));
      const next = availableGrids[(idx + 1) % availableGrids.length];
      s.gridType = next.id;
      if (next.maxNotes) {
        try { resizeOscillatorPool(next.maxNotes); } catch (e) { structuredLog('WARN', 'resizeOscillatorPool failed on cycleGrid', { err: e?.message || String(e) }); }
      }
      const msg = await getText('button1.tts.gridSelect', { state: s.gridType }).catch(() => null);
      if (msg) speakText(msg);
      try { await dispatch('updateUI', { settingsMode: s.isSettingsMode, streamActive: !!s.stream, micActive: !!s.micStream }); } catch (e) {}
      return { grid: s.gridType };
    } catch (e) {
      structuredLog('ERROR', 'cycleGrid error', { message: e?.message || String(e) });
      return { ok: false };
    }
  });

  /**
   * cycleFramerate
   * ----------------
   * Headless command to cycle the application's framerate settings.
   * Behavior (migrated from UI):
   * - If `state.autoFPS` is true, turn it off and set `updateInterval` to 1000/20 (20 FPS).
   * - Otherwise, cycle through fps options [20, 30, 60]. When reaching 60, enable `autoFPS`.
   * - Notify listeners (UI) by dispatching an `updateUI` event.
   *
   * Inputs: none (operates directly on `state`) 
   * Outputs: returns an object with the new `autoFPS` and `updateInterval` values.
   * Error modes: logs and returns { ok: false } on unexpected failures.
   */
  // Cycle framerate / toggle autoFPS: move UI logic into engine so it is headless.
  // Logic mirrors web/ui/ui-settings.js Button 4 (normal mode) behavior.
  registerCommandHandler('cycleFramerate', async ({ state: s, dispatch: engineDispatch }) => {
    try {
      if (s.autoFPS) {
        s.autoFPS = false;
        s.updateInterval = 1000 / 20;
      } else {
        const fpsOptions = [20, 30, 60];
  const currentFps = Math.round(1000 / s.updateInterval);
  const idx = fpsOptions.indexOf(currentFps);
        s.autoFPS = idx === fpsOptions.length - 1;
        if (!s.autoFPS) {
          // if idx is -1 (not found), default to first option
          const nextIdx = (idx === -1) ? 0 : (idx + 1);
          s.updateInterval = 1000 / fpsOptions[nextIdx];
        }
      }
      // notify any UI listeners of the change
      try { await dispatch('updateUI', { settingsMode: s.isSettingsMode, streamActive: !!s.stream, micActive: !!s.micStream }); } catch (e) {}
      // Return fps metadata
      return { autoFPS: s.autoFPS, updateInterval: s.updateInterval };
    } catch (e) {
      structuredLog('WARN', 'cycleFramerate failed', { error: e?.message || String(e) });
      return { ok: false };
    }
  });

  // Called after camera start completes. If autoFPS is enabled, notify listeners
  registerCommandHandler('cameraDidStart', async ({ state: s, payload }) => {
    try {
      if (s.autoFPS) {
        for (const fn of Array.from(benchmarkListeners)) {
          try { fn(payload); } catch (e) { structuredLog('WARN', 'benchmark listener failed', { error: e?.message }); }
        }
      }
    } catch (e) {
      structuredLog('WARN', 'cameraDidStart failed', { error: e?.message || String(e) });
    }
  });

  // Accept the computed interval (ms) and persist as updateInterval (FPS) and benchmark metadata
  registerCommandHandler('setFrameInterval', async ({ state: s, payload }) => {
    try {
      const { intervalMs, sampleCount = 1 } = payload || {};
      if (!intervalMs || !Number.isFinite(intervalMs)) return { ok: false };
      const fps = Math.max(8, Math.min(30, Math.round(1000 / intervalMs)));
      s.updateInterval = fps;
      // Persist benchmark results in state helper if available
      try { setAutoFpsBenchmark({ intervalMs, sampleCount, safetyFactor: s.autoFpsBenchmark?.safetyFactor || 0.7 }); } catch (e) {}
      // Let subscribers know
      return { fps, intervalMs };
    } catch (e) {
      structuredLog('WARN', 'setFrameInterval failed', { error: e?.message || String(e) });
      return { ok: false };
    }
  });

  return {
    dispatch,
    registerCommandHandler,
    onStateChange,
  getState,
  onBenchmarkRequired,
  };
}
