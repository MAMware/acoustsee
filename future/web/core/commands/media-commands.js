// File: web/core/commands/media-commands.js
// Handles commands related to starting, stopping, and processing media streams.
// MAMware review R250905: microphone-controller.js seems better consolidated into media-controller.js

import { settings } from '../state.js';
import { structuredLog } from '../../utils/logging.js';
import logger from '../../utils/logging.js';
import { startCamera as mediaStartCamera, stopCamera as mediaStopCamera, isCameraActive } from '../media-controller.js';
import { startMic, stopMic } from '../microphone-controller.js';
import { setMicStream } from '../state.js'; //R260905: lets talk more about this pattern
import { allocateFrameBuffer } from '../state.js';
import * as audioProcessor from '../../audio/audio-processor.js';
import { initializeVideo } from '../../video/frame-processor.js';

// These variables will be managed by the command handlers, keeping them out of the main engine. 
let _videoElForScheduler = null;
let _canvasElForScheduler = null;
let _activeMediaStream = null; // Isolate the MediaStream here to prevent state cloning errors

export function registerMediaCommands(engine) {
  const { registerCommandHandler } = engine;

  // 1. The "Dumb" Toggle Handler
  // Its ONLY job is to delegate. It does not change state.
  registerCommandHandler('toggleProcessing', ({ state: s, payload }) => {
    structuredLog('DEBUG', 'COMMAND: toggleProcessing received.', { isCurrentlyProcessing: s.isProcessing });
    if (s.isProcessing) {
      engine.dispatch('stopProcessing', payload);
    } else {
      engine.dispatch('startProcessing', payload);
    }
  });

  // 2. The "Smart" Start Handler
  // It is the SOLE OWNER of setting isProcessing to TRUE.
  registerCommandHandler('startProcessing', async ({ state: s, payload }) => {
    structuredLog('INFO', 'COMMAND: startProcessing begins.');
    if (_activeMediaStream) {
      structuredLog('WARN', 'COMMAND: startProcessing aborted, stream already active.');
      return;
    }
    
    try {
      // Set state to true BEFORE the async operation.
      // This immediately prevents the toggle from being triggered again.
      s.isProcessing = true;
      structuredLog('DEBUG', 'COMMAND: State set to isProcessing: true.');

      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      _activeMediaStream = stream;

      const videoEl = payload.videoEl || window.DOM.videoFeed;
      videoEl.srcObject = _activeMediaStream;
      await videoEl.play();

      await initializeVideo({
        videoElement: videoEl,
        engine: engine,
        getEngineState: () => engine.getState(),
        engineDispatch: (evt, p) => engine.dispatch(evt, p),
        engineOnStateChange: (cb) => engine.onStateChange(cb),
        getCurrentGrid: () => engine.getState().currentGrid,
        registerWorker: window.__acoustseeDevPanelRegisterWorker,
        unregisterWorker: window.__acoustseeDevPanelUnregisterWorker
      });
      structuredLog('INFO', 'COMMAND: startProcessing COMPLETED successfully.');

    } catch (err) {
      structuredLog('ERROR', 'COMMAND: startProcessing FAILED.', { error: err.message, stack: err.stack });
      // On failure, clean up and set state back to false.
      if (_activeMediaStream) {
        _activeMediaStream.getTracks().forEach(track => track.stop());
        _activeMediaStream = null;
      }
      s.isProcessing = false;
    }
  });

  // 3. The "Smart" Stop Handler
  // It is the SOLE OWNER of setting isProcessing to FALSE.
  registerCommandHandler('stopProcessing', ({ state: s }) => {
    structuredLog('INFO', 'COMMAND: stopProcessing begins.');
    if (_activeMediaStream) {
      _activeMediaStream.getTracks().forEach(track => track.stop());
      _activeMediaStream = null;
    }
    s.isProcessing = false;
    structuredLog('INFO', 'COMMAND: stopProcessing COMPLETED.');
  });
 
  // Toggle camera: start or stop camera depending on state
  registerCommandHandler('toggleCamera', async ({ state: s, payload }) => {
    try {
      const videoEl = payload?.videoEl;
      if (isCameraActive(videoEl || null) || s.isProcessing) {
        await mediaStopCamera(videoEl);
        return { cameraActive: false };
      } else {
        await mediaStartCamera(videoEl, { facingMode: 'environment' }); //is this the right approach? R250905
        return { cameraActive: true };
      }
    } catch (e) {
      structuredLog('WARN', 'toggleCamera failed', { error: e?.message || String(e) });
      return { ok: false };
    }
  });

  // Toggle microphone: start or stop mic and update state //R250905: this logic seems entangled between have start and stopMic, the toggle and stream, seems overcomplicated 
  registerCommandHandler('toggleMicrophone', async ({ state: s, payload }) => {
    try {
      if (s.micStream) {
        stopMic(s.micStream);
        setMicStream(null);
        s.micStream = null;
        return { micActive: false };
      } else {
        const stream = await startMic();
        if (stream) {
          setMicStream(stream);
          s.micStream = stream;
          return { micActive: true };
        }
        return { micActive: false };
      }
    } catch (e) {
      structuredLog('WARN', 'toggleMicrophone failed', { error: e?.message || String(e) });
      return { ok: false };
    }
  });
}
