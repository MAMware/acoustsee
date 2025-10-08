// File: web/core/media-controller.js
import { trackFeatureUse } from '../core/ingest.js';
import { addSessionError } from '../utils/performance.js';
import { structuredLog } from '../utils/logging.js';
import { getText, announceMessage, speakText } from '../utils/utils.js';

let _cameraStream = null;

export async function startCamera(videoEl, constraints = { facingMode: 'environment' }, state = null) {
  try {
    const c = { video: { facingMode: constraints.facingMode }, audio: false };
    
    structuredLog('INFO', 'Requesting camera access', { constraints: c });
    
    const stream = await navigator.mediaDevices.getUserMedia(c);
    _cameraStream = stream;
    if (videoEl) videoEl.srcObject = stream;
    try { await videoEl.play(); } catch (e) { /* ignore play rejections */ }
    
    // Rich logging with i18n + accessibility
    structuredLog('INFO', 'cameraStartSuccess', { device: 'camera' }, {
      state,
      getTextFn: getText,
      announceMessageFn: announceMessage,
      speakTextFn: speakText,
      translate: true,
      announce: true,
      toast: true,
    });
    
    try { trackFeatureUse('camera-start', { timestamp: Date.now() }); } catch (e) {}
    return stream;
  } catch (err) {
    addSessionError({ message: 'start-camera-failed', error: err?.message || String(err) });
    
    // Rich error logging with TTS for accessibility
    structuredLog('ERROR', 'cameraStartFailed', { error: err.message }, {
      state,
      getTextFn: getText,
      announceMessageFn: announceMessage,
      speakTextFn: speakText,
      translate: true,
      announce: true,
      speak: true,  // Speak errors for accessibility!
      toast: true,
    });
    
    try {
      try { const r = require('./reporting.js'); r.reportError(err); }
      catch (e) { import('./reporting.js').then(m => { m.reportError(err); }).catch(() => {}); }
    } catch (e) {}
    throw err;
  }
}

export function stopCamera(videoEl) {
  try {
    if (_cameraStream) {
      _cameraStream.getTracks().forEach(t => t.stop());
      _cameraStream = null;
    }
    if (videoEl) {
      try { videoEl.pause(); } catch (e) {}
      try { videoEl.srcObject = null; } catch (e) {}
    }
    
    structuredLog('INFO', 'Camera stopped', { device: 'camera' }, { toast: true });
    
    try { trackFeatureUse('camera-stop', { timestamp: Date.now() }); } catch (e) {}
  } catch (err) {
    addSessionError({ message: 'stop-camera-failed', error: err?.message || String(err) });
    
    structuredLog('ERROR', 'Failed to stop camera', { error: err.message });
    
    try {
      try { const r = require('./reporting.js'); r.reportError(err); }
      catch (e) { import('./reporting.js').then(m => { m.reportError(err); }).catch(() => {}); }
    } catch (e) {}
    throw err;
  }
}

export function isCameraActive() {
  return !!_cameraStream;
}

// --- Microphone helpers ---
export async function startMic(constraints = { audio: true }, state = null) {
  try {
    if (!navigator?.mediaDevices?.getUserMedia) throw new Error('getUserMedia not available');
    
    structuredLog('INFO', 'Requesting microphone access', { constraints });
    
    const stream = await navigator.mediaDevices.getUserMedia(constraints);
    
    // Rich logging with i18n + accessibility
    structuredLog('INFO', 'micStartSuccess', { device: 'microphone' }, {
      state,
      getTextFn: getText,
      announceMessageFn: announceMessage,
      speakTextFn: speakText,
      translate: true,
      announce: true,
      toast: true,
    });
    
    return stream;
  } catch (err) {
    // Rich error logging with TTS for accessibility
    structuredLog('ERROR', 'micStartFailed', { error: err.message }, {
      state,
      getTextFn: getText,
      announceMessageFn: announceMessage,
      speakTextFn: speakText,
      translate: true,
      announce: true,
      speak: true,  // Speak errors for accessibility!
      toast: true,
    });
    throw err;
  }
}

export function stopMic(stream) {
  try {
    if (!stream) return;
    const tracks = stream.getTracks ? stream.getTracks() : [];
    tracks.forEach(t => {
      try { t.stop(); } catch (e) {}
    });
  } catch (e) {
    // best-effort
  }
}

// Helper for setting mic stream into shared state without creating a circular
// dependency on core/state.js. Tests patch this function to assert behavior. R17925 dependency on core/state.js, how?
export function setMicStream(stream, setFn) {
  // If a setter function is provided, call it (used by tests to simulate state storage)
  if (typeof setFn === 'function') return setFn(stream);
  // Otherwise, return the stream so callers can assign it to shared state.
  return stream;
}
