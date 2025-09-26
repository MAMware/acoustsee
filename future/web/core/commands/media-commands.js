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

  // Toggle processing: simple handler that dispatches start or stop based on current state
  registerCommandHandler('toggleProcessing', ({ state: s, payload }) => {
    structuredLog('DEBUG', 'COMMAND: toggleProcessing received.', { isCurrentlyProcessing: s.isProcessing });
    if (s.isProcessing) {
      engine.dispatch('stopProcessing', payload);
    } else {
      engine.dispatch('startProcessing', payload);
    }
  });

  // Start processing: start camera, allocate buffer, and initiate the processing loop.
  registerCommandHandler('startProcessing', async ({ state: s, payload }) => {
    structuredLog('INFO', 'COMMAND: startProcessing begins.');
    if (_activeMediaStream) {
      structuredLog('WARN', 'COMMAND: startProcessing aborted, stream already active.');
      return;
    }

    try {
      const { videoEl, canvasEl } = payload || {};
      structuredLog('DEBUG', 'COMMAND: Requesting user media...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      _activeMediaStream = stream;
      structuredLog('DEBUG', 'COMMAND: Media stream acquired.');

      const videoElement = videoEl || (typeof window !== 'undefined' ? window.DOM?.videoFeed : null);
      if (videoElement) {
        videoElement.srcObject = _activeMediaStream;

        structuredLog('DEBUG', 'COMMAND: Awaiting video.play()...');
        await videoElement.play();
        structuredLog('INFO', 'COMMAND: video.play() resolved. Metadata is ready.');
      }

      _videoElForScheduler = videoElement;
      _canvasElForScheduler = canvasEl;

      structuredLog('DEBUG', 'COMMAND: Initializing video pipeline...');
      await initializeVideo({
        videoElement: videoElement,
        engine: engine,
        motionThreshold: s.motionThreshold,
        workerTransferEnabled: s.workerTransferEnabled,
        dualModeWIP: s.dualModeWIP
      });
      structuredLog('INFO', 'COMMAND: Video pipeline initialized successfully.');

      // Proactively allocate a reusable frame buffer for zero-copy transfers
      try {
        const w = (videoElement && videoElement.videoWidth) || (canvasEl && canvasEl.width) || 0;
        const h = (videoElement && videoElement.videoHeight) || (canvasEl && canvasEl.height) || 0;
        if (w > 0 && h > 0 && s.workerTransferEnabled) {
          allocateFrameBuffer(w, h);
        }
      } catch (e) {
        structuredLog('WARN', 'startProcessing: allocateFrameBuffer failed', { error: e?.message });
      }

      structuredLog('DEBUG', 'COMMAND: Setting state to isProcessing: true.');
      s.isProcessing = true;
      structuredLog('INFO', 'COMMAND: startProcessing COMPLETED successfully.');

      // We return the payload so the engine's scheduler can access it.
      return { videoEl: _videoElForScheduler, canvasEl: _canvasElForScheduler };

    } catch (err) {
      structuredLog('ERROR', 'COMMAND: startProcessing FAILED.', { error: err.message, stack: err.stack });
      // Cleanup on failure
      if (_activeMediaStream) {
        _activeMediaStream.getTracks().forEach(track => track.stop());
        _activeMediaStream = null;
      }
      s.isProcessing = false;
      throw err;
    }
  });

  // Stop processing: stop camera, clear timer, reset flags.
  registerCommandHandler('stopProcessing', async ({ state: s, payload }) => {
    structuredLog('INFO', 'COMMAND: stopProcessing begins.');
    try {
      const { videoEl } = payload || {};
      s.isProcessing = false;

      if (_activeMediaStream) {
        _activeMediaStream.getTracks().forEach(track => track.stop());
        _activeMediaStream = null;
      }
      _videoElForScheduler = null;
      _canvasElForScheduler = null;
      structuredLog('INFO', 'COMMAND: stopProcessing COMPLETED.');
      return { stopped: true };
    } catch (e) {
      structuredLog('ERROR', 'command.stopProcessing failed', { error: e?.message || String(e) });
      logger.logError?.(e);
      throw e;
    }
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
