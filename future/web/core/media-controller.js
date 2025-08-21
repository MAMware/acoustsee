// File: web/core/media-controller.js
import { trackFeatureUse } from '../core/ingest.js';
import { addSessionError } from '../utils/performance.js';
import { announceMessage, getText } from '../utils/utils.js';

let _cameraStream = null;

export async function startCamera(videoEl, constraints = { facingMode: 'environment' }) {
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
      const msg = await getText('camera.unable');
      announceMessage(msg);
    } catch (e) {
      announceMessage('Unable to access camera.');
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
