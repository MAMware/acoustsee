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
    if (s.isProcessing) {
      engine.dispatch('stopProcessing', payload);
    } else {
      engine.dispatch('startProcessing', payload);
    }
  });

  // Start processing: start camera, allocate buffer, and initiate the processing loop.
  registerCommandHandler('startProcessing', async ({ state: s, payload }) => {
    try {
      const { videoEl, canvasEl } = payload || {};
      try {
        await mediaStartCamera(videoEl, { facingMode: 'environment' });
      } catch (cameraError) {
        structuredLog('ERROR', 'command.startProcessing: mediaStartCamera failed', { error: cameraError?.message || String(cameraError) });
        // Attempt best-effort user notification if engine dispatch is available
        try { if (engine && typeof engine.dispatch === 'function') engine.dispatch('announceMessage', { message: 'Camera failed to start.' }); } catch (_) {}
        throw cameraError;
      }
      
      // Store MediaStream in isolated variable, NOT in shared state (prevents cloning errors)
      if (videoEl && videoEl.srcObject) {
        _activeMediaStream = videoEl.srcObject;
      }

      // Fix race condition: await video play to ensure metadata is loaded
      videoEl.srcObject = _activeMediaStream;
      await videoEl.play(); // This is the critical fix.

      _videoElForScheduler = videoEl;
      _canvasElForScheduler = canvasEl;

      // Initialize video pipeline AFTER stream is ready
      try {
        await initializeVideo({
          videoElement: videoEl,
          engine: engine,
          motionThreshold: s.motionThreshold,
          workerTransferEnabled: s.workerTransferEnabled,
          dualModeWIP: s.dualModeWIP
        });
      } catch (e) {
        structuredLog('ERROR', 'initializeVideo failed in startProcessing', { error: e?.message || String(e) });
        // Continue anyway - the app can still run without video processing
      }

      // Proactively allocate a reusable frame buffer for zero-copy transfers
      try {
        const w = (videoEl && videoEl.videoWidth) || (canvasEl && canvasEl.width) || 0;
        const h = (videoEl && videoEl.videoHeight) || (canvasEl && canvasEl.height) || 0;
        if (w > 0 && h > 0 && s.workerTransferEnabled) {
          allocateFrameBuffer(w, h);
        }
      } catch (e) {
        structuredLog('WARN', 'startProcessing: allocateFrameBuffer failed', { error: e?.message });
      }

      s.isProcessing = true;
      // Note: The scheduler itself will remain in engine.js for now, as it's a core process,
      // but this command is what turns it on. The engine's _runScheduled function will
      // now use the _videoElForScheduler and _canvasElForScheduler variables from this module.
      // A future refactor could move the scheduler out as well. R250906: could the canvas used for a future grid testing/feature that is touch reactive ?

      // We return the payload so the engine's scheduler can access it.
      return { videoEl: _videoElForScheduler, canvasEl: _canvasElForScheduler };

    } catch (e) {
      structuredLog('ERROR', 'command.startProcessing failed', { error: e?.message || String(e) });
      logger.logError?.(e);
      throw e;
    }
  });

  // Stop processing: stop camera, clear timer, reset flags.
  registerCommandHandler('stopProcessing', async ({ state: s, payload }) => {
    try {
      const { videoEl } = payload || {};
  s.isProcessing = false;

      mediaStopCamera(videoEl);
      // Clean up the isolated MediaStream
      if (_activeMediaStream) {
        _activeMediaStream.getTracks().forEach(track => track.stop());
        _activeMediaStream = null;
      }
      _videoElForScheduler = null;
      _canvasElForScheduler = null;
      return { stopped: true };
    } catch (e) {
      structuredLog('WARN', 'command.stopProcessing failed', { error: e?.message || String(e) });
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
