// Minimal headless engine: owns state and exposes a dispatch API for commands.
import { settings } from './state.js';
import { structuredLog } from '../utils/logging.js';
import { getText, speakText, setLanguage, translatePage, announceMessage } from '../utils/utils.js';
import { trackFeatureUse } from '../core/ingest.js';
import { startCamera as mediaStartCamera, stopCamera as mediaStopCamera, isCameraActive } from './media-controller.js';
import { startMic, stopMic } from './microphone-controller.js';
import { computeAutoIntervalBenchmark } from '../utils/performance.js';
import { setAutoFpsBenchmark } from './state.js';

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
