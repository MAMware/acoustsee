// File: web/core/engine.js
// Minimal headless engine: owns state and exposes a dispatch API for commands.
import { settings } from './state.js';
import { structuredLog } from '../utils/logging.js';
import logger from '../utils/logging.js';
import { getAllIdbLogs } from '../utils/idb-logger.js';
import { getText, speakText, setLanguage, translatePage, announceMessage } from '../utils/utils.js';
import { trackFeatureUse } from '../core/ingest.js';
import { startCamera as mediaStartCamera, stopCamera as mediaStopCamera, isCameraActive } from './media-controller.js';
import { startMic, stopMic } from './microphone-controller.js';
import { computeAutoIntervalBenchmark, getPreferredIntervalMs } from '../utils/performance.js';
import { setAutoFpsBenchmark } from './state.js';
import { processFrameWithState } from '../video/frame-processor.js';
import { playCues, resizeOscillatorPool, connectMicrophone, disconnectMicrophone, isAudioReady } from '../audio/audio-processor.js';

export function createEngine() {
  const state = settings; // legacy shared settings object for incremental migration
  const listeners = new Set();
  const handlers = Object.create(null);
  const benchmarkListeners = new Set();

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
      const result = await handler({ state, payload, dispatch });
      // notify after handler runs in case it mutated shared state
      notifyListeners();
      return { ok: true, result };
    } catch (err) {
  structuredLog('ERROR', `Engine handler ${commandName} failed`, { message: err?.message || String(err) });
  try { logger.logError && logger.logError(err); } catch (er) {}
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

  // --- NEW: COMMANDS FOR ACCESSIBLE UI ---

  registerCommandHandler('toggleProcessing', async ({ state: s, payload }) => {
    if (s.isProcessing) {
      await dispatch('stopProcessing', payload);
      const msg = await getText('processing.stopped').catch(() => 'Stopped');
      speakText(msg);
    } else {
      await dispatch('startProcessing', payload);
      const msg = await getText('processing.started').catch(() => 'Started');
      speakText(msg);
    }
  });

  registerCommandHandler('announceStatus', async ({ state: s }) => {
    try {
      const statusKey = s.isProcessing ? 'status.live' : 'status.idle';
      const gridName = s.availableGrids.find(g => g.id === s.gridType)?.name || s.gridType;
      const synthName = s.availableEngines.find(e => e.id === s.synthesisEngine)?.name || s.synthesisEngine;
      
      const msg = await getText('status.full', {
        status: await getText(statusKey),
        grid: gridName,
        synth: synthName
      });
      speakText(msg);
    } catch (e) {
      structuredLog('ERROR', 'announceStatus failed', { error: e.message });
      speakText("Could not announce status.");
    }
  });

  registerCommandHandler('enterSettingsMode', async ({ state: s }) => {
    if (s.isProcessing) {
      await dispatch('stopProcessing'); // Stop processing to avoid distraction
    }
    s.isSettingsMode = true;
    s.settings.currentCategoryIndex = 0; // Start at the first category
    const msg = await getText('settings.enter').catch(() => 'Settings mode. Swipe left or right to choose a category.');
    speakText(msg);
    await dispatch('announceCurrentSettingCategory');
  });

  registerCommandHandler('exitSettingsMode', async ({ state: s }) => {
    s.isSettingsMode = false;
    await dispatch('saveSettings'); // Auto-save on exit
    const msg = await getText('settings.exit').catch(() => 'Exiting settings.');
    speakText(msg);
  });
  
  registerCommandHandler('cycleSettingCategory', async ({ state: s, payload }) => {
    if (!s.isSettingsMode) return;
    const direction = payload.direction || 1; // 1 for right, -1 for left
    const numCategories = s.settings.categories.length;
    s.settings.currentCategoryIndex = (s.settings.currentCategoryIndex + direction + numCategories) % numCategories;
    await dispatch('announceCurrentSettingCategory');
  });
  
  registerCommandHandler('changeCurrentSettingValue', async ({ state: s, payload }) => {
    if (!s.isSettingsMode) return;
    const direction = payload.direction || 1; // 1 for up/right, -1 for down/left
    const categoryId = s.settings.categories[s.settings.currentCategoryIndex];
    
    // Logic to change the value based on the category
    switch (categoryId) {
      case 'grid':
        const grids = s.availableGrids.map(g => g.id);
        const currentGridIndex = grids.indexOf(s.gridType);
        const nextGridIndex = (currentGridIndex + direction + grids.length) % grids.length;
        s.gridType = grids[nextGridIndex];
        break;
      case 'synth':
        const synths = s.availableEngines.map(e => e.id);
        const currentSynthIndex = synths.indexOf(s.synthesisEngine);
        const nextSynthIndex = (currentSynthIndex + direction + synths.length) % synths.length;
        s.synthesisEngine = synths[nextSynthIndex];
        break;
      case 'language': // <-- NEW CASE
        const langs = s.availableLanguages.map(l => l.id);
        const currentLangIndex = langs.indexOf(s.language);
        const nextLangIndex = (currentLangIndex + direction + langs.length) % langs.length;
        const newLang = langs[nextLangIndex];
        await setLanguage(newLang); // This also saves it
        s.language = newLang;
        try { await translatePage(document); } catch (e) { /* best-effort */ }
        break;
      case 'maxNotes':
        const current = Number(s.maxNotes) || 0;
        // step sizes: +1 or -1
        const next = Math.max(1, current + (direction > 0 ? 1 : -1));
        s.maxNotes = next;
        try { resizeOscillatorPool(s.maxNotes); } catch (e) { structuredLog('WARN', 'resizeOscillatorPool failed', { error: e?.message }); }
        break;
      case 'motionThreshold': // Adjust in steps of 20, clamp 20..120
        let newThreshold = (Number(s.motionThreshold) || 20) + (direction * 20);
        newThreshold = Math.max(20, Math.min(120, newThreshold));
        s.motionThreshold = newThreshold;
        break;
    }
    await dispatch('announceCurrentSettingValue');
  });

  registerCommandHandler('announceCurrentSettingCategory', async ({ state: s }) => {
    if (!s.isSettingsMode) return;
    const categoryId = s.settings.categories[s.settings.currentCategoryIndex];
    const categoryName = await getText(`settings.category.${categoryId}`).catch(() => categoryId);
    speakText(categoryName);
  });
  
  registerCommandHandler('announceCurrentSettingValue', async ({ state: s }) => {
    if (!s.isSettingsMode) return;
    const categoryId = s.settings.categories[s.settings.currentCategoryIndex];
    let valueText = '';
    try {
      switch (categoryId) {
        case 'grid':
          valueText = s.availableGrids.find(g => g.id === s.gridType)?.name || s.gridType;
          break;
        case 'synth':
          valueText = s.availableEngines.find(e => e.id === s.synthesisEngine)?.name || s.synthesisEngine;
          break;
        case 'language':
          valueText = s.availableLanguages.find(l => l.id === s.language)?.name || s.language;
          break;
        case 'maxNotes':
          valueText = await getText('settings.value.notes', { count: s.maxNotes });
          break;
        case 'motionThreshold':
          let sensitivity = 'Medium';
          if ((Number(s.motionThreshold) || 0) <= 40) sensitivity = 'High';
          if ((Number(s.motionThreshold) || 0) >= 80) sensitivity = 'Low';
          valueText = await getText('settings.value.sensitivity', {
            level: await getText(`settings.sensitivity.${sensitivity.toLowerCase()}`)
          });
          break;
      }
      speakText(valueText);
    } catch (err) {
      structuredLog('ERROR', 'Failed to announce setting value', { error: err.message });
    }
  });

  // Helper to play a short test cue for debugging audio
  registerCommandHandler('playTestNote', async ({ state: s, payload }) => {
    try {
      const cues = [{ id: 'test-note', pitch: payload?.pitch || 440, pan: 0, intensity: 1.0 }];
      await dispatch('audioPlayCues', { cues });
      return { ok: true };
    } catch (e) {
      structuredLog('WARN', 'playTestNote failed', { error: e?.message });
      return { ok: false, error: e?.message };
    }
  });

  // Handler to resume audio context from UI
  registerCommandHandler('resumeAudio', async ({ state: s }) => {
    try {
      structuredLog('INFO', 'resumeAudio: request received');
      const res = await (async function() {
        try { return await (await import('../audio/audio-processor.js')).resumeAudioContext(); } catch(e) { return { ok: false, error: e?.message || String(e) }; }
      })();
      structuredLog(res.ok ? 'INFO' : 'WARN', 'resumeAudio: result', { ok: !!res.ok, state: res.state, error: res.error });
      if (!res.ok) structuredLog('WARN', 'resumeAudio failed', { error: res.error });
      return res;
    } catch (e) {
      structuredLog('ERROR', 'resumeAudio handler failed', { error: e?.message || String(e) });
      return { ok: false, error: e?.message || String(e) };
    }
  });

  registerCommandHandler('gatherAndSendUserReport', async ({ state }) => {
    try {
      const appState = JSON.stringify(state);
      const logs = JSON.stringify(await getAllIdbLogs());
      
      const reportPayload = {
        type: 'user-report',
        app_state: appState,
        logs: logs,
      };
      
      trackFeatureUse('user-report', reportPayload); 
      
      // Give the user feedback
      const msg = await getText('report.sending').catch(() => 'Thank you. Sending report.');
      speakText(msg);

    } catch (err) {
      structuredLog('ERROR', 'Failed to send user report', { error: err.message });
      const msg = await getText('report.error').catch(() => 'Sorry, the report could not be sent.');
      speakText(msg);
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
      await setLanguage(next);
      s.language = next;
      try { await translatePage(document); } catch (e) { /* best-effort */ }
      const languageName = next;
      try {
        const announce = await getText('button3.tts.languageSelect', { state: languageName });
        announceMessage(announce);
        if (typeof speakText === 'function') speakText(announce);
      } catch (e) {
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
      if (videoEl && videoEl.srcObject) s.stream = videoEl.srcObject;
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

  // Toggle microphone: start/stop mic stream, route audio via audio-processor, and persist in state.micStream
  registerCommandHandler('toggleMicrophone', async ({ state: s }) => {
    try {
      if (s.micStream) {
        // --- Disconnect audio first, then stop the stream ---
        try { disconnectMicrophone(); } catch (e) { /* best-effort */ }
        stopMic(s.micStream);
        s.micStream = null;
        const msg = await getText('mic.off').catch(() => 'Microphone off.');
        speakText(msg);
        return { micActive: false };
      } else {
        // --- Start the stream first, then connect the audio ---
        const stream = await startMic({ audio: true });
        s.micStream = stream;
        // Only attempt to route audio if the audio subsystem is initialized
        if (isAudioReady()) {
          try { connectMicrophone(stream); } catch (e) { structuredLog('WARN', 'connectMicrophone failed', { error: e?.message || String(e) }); }
        } else {
          structuredLog('INFO', 'Audio not ready, mic stream acquired but not connected.');
        }
        const msg = await getText('mic.on').catch(() => 'Microphone on.');
        speakText(msg);
        return { micActive: true };
      }
    } catch (e) {
      structuredLog('WARN', 'toggleMicrophone failed', { error: e?.message || String(e) });
      // Ensure state is clean on failure
      if (s.micStream) {
        try { disconnectMicrophone(); } catch (er) { /* ignore */ }
        try { stopMic(s.micStream); } catch (er) { /* ignore */ }
        s.micStream = null;
      }
      const msg = await getText('mic.error').catch(() => 'Microphone unavailable.');
      speakText(msg);
      throw e;
    }
  });

  // Start processing: start camera, set interval to call processFrame, set isProcessing flag
  registerCommandHandler('startProcessing', async ({ state: s, payload }) => {
    try {
      const { videoEl, canvasEl } = payload || {};
      await mediaStartCamera(videoEl, { facingMode: 'environment' });
      if (videoEl && videoEl.srcObject) s.stream = videoEl.srcObject;
      _videoElForScheduler = videoEl;
      _canvasElForScheduler = canvasEl;
      s.isProcessing = true;
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
  try { logger.logError && logger.logError(e); } catch (er) {}
      throw e;
    }
  });

  // Stop processing: stop camera, clear timer, reset flags
  registerCommandHandler('stopProcessing', async ({ state: s, payload }) => {
    try {
      const { videoEl } = payload || {};
      try {
        if (_schedulerTimerId != null) {
          clearTimeout(_schedulerTimerId);
          _schedulerTimerId = null;
        }
      } catch (e) { /* ignore */ }
      _processingLock = false;
      _pending = false;
      s.processingTimerId = null;
      s.isProcessing = false;
      try { mediaStopCamera(videoEl); } catch (e) { /* ignore */ }
      s.stream = null;
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
      try { dispatch('audioPlayCues', { cues: result.cues }); } catch (e) { /* best-effort */ }
      return result;
    } catch (e) {
  structuredLog('WARN', 'engine.processFrame failed', { error: e?.message || String(e) });
  try { logger.logError && logger.logError(e); } catch (er) {}
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

  // Save settings: persist selected user settings to localStorage and speak feedback
  registerCommandHandler('saveSettings', async ({ state: s }) => {
    try {
      const settingsToSave = {
        gridType: s.gridType,
        synthesisEngine: s.synthesisEngine,
        language: s.language,
        autoFPS: s.autoFPS,
        updateInterval: s.updateInterval,
        maxNotes: s.maxNotes,
        motionThreshold: s.motionThreshold
      };
      localStorage.setItem('acoustsee-settings', JSON.stringify(settingsToSave));
     
      const msg = await getText('settings.saved').catch(() => 'Settings saved successfully.');
      speakText(msg);
      structuredLog('INFO', 'Settings saved to localStorage', settingsToSave);
      return { saved: true };
    } catch (err) {
      structuredLog('ERROR', 'saveSettings error', { message: err.message });
      const errorMsg = await getText('settings.save_error').catch(() => 'Error saving settings.');
      speakText(errorMsg);
      return { saved: false };
    }
  });

  // Load settings: read from localStorage, apply safely, and provide feedback
  registerCommandHandler('loadSettings', async ({ state: s }) => {
    try {
      const savedSettingsJSON = localStorage.getItem('acoustsee-settings');
      if (savedSettingsJSON) {
        const parsed = JSON.parse(savedSettingsJSON);
       
        // Carefully apply loaded settings to the current state
        Object.assign(s, parsed);

        // Post-load actions
        await setLanguage(s.language);
        await translatePage(document);
        resizeOscillatorPool(s.maxNotes);
       
        const msg = await getText('settings.loaded').catch(() => 'Settings loaded successfully.');
        speakText(msg);
        structuredLog('INFO', 'Settings loaded from localStorage', parsed);
      } else {
        const msg = await getText('settings.load_none').catch(() => 'No saved settings found.');
        speakText(msg);
        structuredLog('INFO', 'No saved settings found in localStorage.');
      }
    } catch (err) {
      structuredLog('ERROR', 'Load settings error', { message: err.message });
      const errorMsg = await getText('settings.load_error').catch(() => 'Error loading settings.');
      speakText(errorMsg);
    }
    // No return value needed, state is mutated directly
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
          const nextIdx = (idx === -1) ? 0 : (idx + 1);
          s.updateInterval = 1000 / fpsOptions[nextIdx];
        }
      }
      try { await dispatch('updateUI', { settingsMode: s.isSettingsMode, streamActive: !!s.stream, micActive: !!s.micStream }); } catch (e) {}
      return { autoFPS: s.autoFPS, updateInterval: s.updateInterval };
    } catch (e) {
      structuredLog('WARN', 'cycleFramerate failed', { error: e?.message || String(e) });
      return { ok: false };
    }
  });

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

  registerCommandHandler('setFrameInterval', async ({ state: s, payload }) => {
    try {
      const { intervalMs, sampleCount = 1 } = payload || {};
      if (!intervalMs || !Number.isFinite(intervalMs)) return { ok: false };
      const fps = Math.max(8, Math.min(30, Math.round(1000 / intervalMs)));
      s.updateInterval = fps;
      try { setAutoFpsBenchmark({ intervalMs, sampleCount, safetyFactor: s.autoFpsBenchmark?.safetyFactor || 0.7 }); } catch (e) {}
      return { fps, intervalMs };
    } catch (e) {
      structuredLog('WARN', 'setFrameInterval failed', { error: e?.message || String(e) });
      return { ok: false };
    }
  });

  // --- NEW: DIRECT SETTER HANDLERS FOR DEBUG UI ---
  registerCommandHandler('setGridType', async ({ state: s, payload }) => {
    const newGridId = payload.gridType;
    if (s.availableGrids.find(g => g.id === newGridId)) {
      s.gridType = newGridId;
      structuredLog('INFO', 'DebugUI: Grid type set', { gridType: newGridId });
    }
  });

  registerCommandHandler('setSynthEngine', async ({ state: s, payload }) => {
    const newEngineId = payload.synthEngine;
    if (s.availableEngines.find(e => e.id === newEngineId)) {
      s.synthesisEngine = newEngineId;
      structuredLog('INFO', 'DebugUI: Synth engine set', { synthEngine: newEngineId });
    }
  });

  registerCommandHandler('setMaxNotes', async ({ state: s, payload }) => {
    const maxNotes = parseInt(payload.maxNotes, 10);
    if (!isNaN(maxNotes) && maxNotes >= 1 && maxNotes <= 100) {
      s.maxNotes = maxNotes;
      resizeOscillatorPool(s.maxNotes);
      structuredLog('INFO', 'DebugUI: Max notes set', { maxNotes });
    }
  });

  registerCommandHandler('setMotionThreshold', async ({ state: s, payload }) => {
    const threshold = parseInt(payload.motionThreshold, 10);
    if (!isNaN(threshold) && threshold >= 1 && threshold <= 255) {
      s.motionThreshold = threshold;
      structuredLog('INFO', 'DebugUI: Motion threshold set', { threshold });
    }
  });

  registerCommandHandler('setAutoFPS', async ({ state: s, payload }) => {
    const enabled = !!payload.enabled;
    s.autoFPS = enabled;
    structuredLog('INFO', 'DebugUI: Auto FPS set', { enabled });
  });

  return {
    dispatch,
    registerCommandHandler,
    onStateChange,
    getState,
    onBenchmarkRequired,
  };
}