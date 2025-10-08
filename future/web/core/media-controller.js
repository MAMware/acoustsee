// File: web/core/media-controller.js
import { trackFeatureUse } from '../core/ingest.js';
import { addSessionError } from '../utils/performance.js';
import { announceMessage, getText } from '../utils/utils.js';
import { notifyDev as notifyDebug } from '../ui/dev-panel/dev-notifier.js';

let _cameraStream = null;

export async function startCamera(videoEl, constraints = { facingMode: 'environment' }, state = null) {
  try {
    const c = { video: { facingMode: constraints.facingMode }, audio: false };
    const stream = await navigator.mediaDevices.getUserMedia(c);
    _cameraStream = stream;
    if (videoEl) videoEl.srcObject = stream;
    try { await videoEl.play(); } catch (e) { /* ignore play rejections */ }
    try { trackFeatureUse('camera-start', { timestamp: Date.now() }); } catch (e) {}
    return stream;
  } catch (err) {
    addSessionError({ message: 'start-camera-failed', error: err?.message || String(err) });
    try {
      // Show an accessible, translated witness via the debug UI and announcements.
      await notifyDebug({ key: 'camera.unable', persistent: true, tts: true, state });
    } catch (e) {
      try {
        const msg = await getText('camera.unable', {}, state);
        announceMessage(msg);
      } catch (e2) {
        announceMessage('Unable to access camera.');
      }
    }
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
    try { trackFeatureUse('camera-stop', { timestamp: Date.now() }); } catch (e) {}
  } catch (err) {
    addSessionError({ message: 'stop-camera-failed', error: err?.message || String(err) });
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
export async function startMic(constraints = { audio: true }) {
  if (!navigator?.mediaDevices?.getUserMedia) throw new Error('getUserMedia not available');
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  return stream;
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
