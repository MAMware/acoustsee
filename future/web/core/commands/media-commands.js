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

  // The "Dumb" Toggle Handler - Its ONLY job is to delegate.
  registerCommandHandler('toggleProcessing', ({ state: s, payload }) => {
    if (s.isProcessing) {
      engine.dispatch('stopProcessing', payload);
    } else {
      engine.dispatch('startProcessing', payload);
    }
  });

    // The "Smart" Start Handler - SOLE OWNER of starting the processing lifecycle.
  registerCommandHandler('startProcessing', async ({ state: s, payload }) => {
    structuredLog('DEBUG', 'COMMAND: startProcessing handler called', { isProcessing: s.isProcessing, payload });
    
    if (s.isProcessing) {
      structuredLog('WARN', 'COMMAND: startProcessing aborted - already processing');
      return; // Prevent re-entry
    }
    
    try {
      s.isProcessing = true;
      structuredLog('INFO', 'COMMAND: Start processing initiated.');

      structuredLog('DEBUG', 'COMMAND: Requesting camera permissions...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      _activeMediaStream = stream;
      structuredLog('DEBUG', 'COMMAND: Camera stream acquired successfully.');

      // Better DOM element resolution with fallback
      let videoEl = payload?.videoEl;
      if (!videoEl && typeof window !== 'undefined' && window.DOM?.videoFeed) {
        videoEl = window.DOM.videoFeed;
        structuredLog('DEBUG', 'COMMAND: Using DOM.videoFeed element');
      } else if (!videoEl) {
        // Create a temporary video element if none provided
        videoEl = document.createElement('video');
        videoEl.setAttribute('playsinline', 'true');
        videoEl.setAttribute('muted', 'true');
        structuredLog('DEBUG', 'COMMAND: Created temporary video element');
      }

      videoEl.srcObject = _activeMediaStream;
      structuredLog('DEBUG', 'COMMAND: Stream assigned to video element, waiting for play...');
      
      await videoEl.play();
      structuredLog('INFO', 'COMMAND: Video stream is active and metadata loaded.');

      structuredLog('DEBUG', 'COMMAND: Initializing video pipeline...');
      await initializeVideo({
        videoElement: videoEl,
        engine: engine,
        getEngineState: () => engine.getState(),
        getCurrentGrid: () => engine.getState().currentGrid,
        registerWorker: window.__acoustseeDevPanelRegisterWorker,
        motionThreshold: s.motionThreshold,
      });
      
      structuredLog('INFO', 'COMMAND: startProcessing COMPLETED successfully.');

    } catch (err) {
      structuredLog('ERROR', 'COMMAND: startProcessing FAILED.', { error: err.message, stack: err.stack });
      if (_activeMediaStream) {
        _activeMediaStream.getTracks().forEach(track => track.stop());
        _activeMediaStream = null;
      }
      s.isProcessing = false;
      throw err; // Re-throw to help with debugging
    }
  });

  // The "Smart" Stop Handler - SOLE OWNER of stopping the processing lifecycle.
  registerCommandHandler('stopProcessing', ({ state: s }) => {
    structuredLog('INFO', 'COMMAND: stopProcessing begins.');
    if (_activeMediaStream) {
      _activeMediaStream.getTracks().forEach(track => track.stop());
      _activeMediaStream = null;
    }
    // Any necessary teardown for video/audio pipelines can be dispatched from here.
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
