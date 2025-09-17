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
import { processFrameWithState } from '../../video/frame-processor.js';
import * as audioProcessor from '../../audio/audio-processor.js';

// These variables will be managed by the command handlers, keeping them out of the main engine. 
let _videoElForScheduler = null;
let _canvasElForScheduler = null;

export function registerMediaCommands(engine) {
  const { registerCommandHandler } = engine;

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
      if (videoEl && videoEl.srcObject) s.stream = videoEl.srcObject;

      _videoElForScheduler = videoEl;
      _canvasElForScheduler = canvasEl;

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
      s.stream = null;
      _videoElForScheduler = null;
      _canvasElForScheduler = null;
      return { stopped: true };
    } catch (e) {
      structuredLog('WARN', 'command.stopProcessing failed', { error: e?.message || String(e) });
      throw e;
    }
  });

  // Actual frame processing handler: draw video -> read pixels -> call frame-processor. R250905: is this the legacy fallback? what about avoiding the video draw, could that be possible?
  registerCommandHandler('processFrame', async ({ state: s, payload }) => {
    try {
      // The payload here will be provided by the engine's internal scheduler
      const { videoEl, canvasEl } = payload;
      if (!videoEl || !canvasEl || videoEl.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
        return null;
      }
      
      const w = videoEl.videoWidth;
      const h = videoEl.videoHeight;
      if (w === 0 || h === 0) return null;
// R17925 why we do processing here? what about SRP? shouldnt be done separately and monitored?
  const ctx = canvasEl.getContext('2d');
  // TODO: Performance note — this drawImage/getImageData sequence forces a
  // GPU -> CPU synchronous readback on every frame which is a major
  // performance bottleneck (high CPU usage, GC pressure, and frame jank).
  // For future work, replace this with a zero-copy or GPU-accelerated
  // pipeline. Options to consider:
  //  - Use requestVideoFrameCallback + WebGL to process frames on the GPU.
  //  - Use an OffscreenCanvas with transferControlToOffscreen and run
  //    pixel-processing in a Worker to avoid main-thread copies.
  //  - Where available, use VideoFrame and WebCodecs to access frame
  //    data more efficiently without rasterizing to a 2D canvas.
  // Leaving this todo here documents the hotspot for future optimization
  // efforts.
  ctx.drawImage(videoEl, 0, 0, w, h);
      const img = ctx.getImageData(0, 0, w, h);

      let frameBufferToUse = img.data;

      // Logic for using a reusable buffer (zero-copy path)
      if (s._frameBuffer) {
          if (s._frameBuffer.length === img.data.length) {
              s._frameBuffer.set(img.data);
              frameBufferToUse = s._frameBuffer;
          } else {
              // Handle resolution change: reallocate if necessary
              if (s.workerTransferEnabled) {
                  structuredLog('INFO', 'processFrame: Resolution changed, reallocating frame buffer.');
                  allocateFrameBuffer(w, h);
                  if (s._frameBuffer && s._frameBuffer.length === img.data.length) {
                    s._frameBuffer.set(img.data);
                    frameBufferToUse = s._frameBuffer;
                  }
              }
          }
      }

      const result = await processFrameWithState(frameBufferToUse, w, h);
      
      if (result && Array.isArray(result.cues) && result.cues.length > 0) {
        await audioProcessor.playCues(result.cues);
      }
      
      return result;

    } catch (e) {
      structuredLog('WARN', 'command.processFrame failed', { error: e?.message || String(e) });
      logger.logError?.(e);
      return null;
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
