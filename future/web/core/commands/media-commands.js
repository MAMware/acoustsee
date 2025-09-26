// File: web/core/commands/media-commands.js
// Handles commands related to starting, stopping, and processing media streams.
// MAMware review R250905: microphone-controller.js seems better consolidated into media-controller.js

import { settings } from '../state.js';
import { structuredLog } from '../../utils/logging.js';
import { output as coreLoggerOutput } from '../../utils/core-logger.js';
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
  
  
  structuredLog('INFO', 'MEDIA-COMMANDS: Registering command handlers...');
  coreLoggerOutput('info', 'MEDIA-COMMANDS: Registering command handlers...');

  // Wrap async handlers to catch and log errors properly
  const wrapAsyncHandler = (handlerName, handler) => {
    return async (args) => {
      structuredLog('DEBUG', `ASYNC-HANDLER: ${handlerName} starting`, args);
      coreLoggerOutput('debug', `ASYNC-HANDLER: ${handlerName} starting`);
      try {
        const result = await handler(args);
        structuredLog('DEBUG', `ASYNC-HANDLER: ${handlerName} completed`, { result });
        coreLoggerOutput('debug', `ASYNC-HANDLER: ${handlerName} completed`);
        return result;
      } catch (error) {
        structuredLog('ERROR', `ASYNC-HANDLER: ${handlerName} failed`, { 
          error: error.message, 
          stack: error.stack 
        });
        coreLoggerOutput('error', `ASYNC-HANDLER: ${handlerName} failed - ${error.message}`);
        throw error;
      }
    };
  };

  // The "Dumb" Toggle Handler - Its ONLY job is to delegate.
  registerCommandHandler('toggleProcessing', ({ state: s, payload }) => {
    structuredLog('DEBUG', 'COMMAND: toggleProcessing received', { isProcessing: s.isProcessing });
    coreLoggerOutput('debug', `COMMAND: toggleProcessing received - isProcessing: ${s.isProcessing}`);
    if (s.isProcessing) {
      engine.dispatch('stopProcessing', payload);
    } else {
      engine.dispatch('startProcessing', payload);
    }
  });

    // The "Smart" Start Handler - SOLE OWNER of starting the processing lifecycle.
  registerCommandHandler('startProcessing', wrapAsyncHandler('startProcessing', async ({ state: s, payload }) => {
    structuredLog('DEBUG', 'COMMAND: startProcessing handler called', { isProcessing: s.isProcessing, payload });
    coreLoggerOutput('debug', `COMMAND: startProcessing handler called - isProcessing: ${s.isProcessing}`);
    
    if (s.isProcessing) {
      structuredLog('WARN', 'COMMAND: startProcessing aborted - already processing');
      coreLoggerOutput('warn', 'COMMAND: startProcessing aborted - already processing');
      return; // Prevent re-entry
    }
    
    try {
      s.isProcessing = true;
      structuredLog('INFO', 'COMMAND: Start processing initiated.');
      coreLoggerOutput('info', 'COMMAND: Start processing initiated.');

      structuredLog('DEBUG', 'COMMAND: Requesting camera permissions...');
      coreLoggerOutput('debug', 'COMMAND: Requesting camera permissions...');
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      _activeMediaStream = stream;
      structuredLog('DEBUG', 'COMMAND: Camera stream acquired successfully.');
      coreLoggerOutput('debug', 'COMMAND: Camera stream acquired successfully.');

      // Better DOM element resolution with fallback
      let videoEl = payload?.videoEl;
      if (!videoEl && typeof window !== 'undefined' && window.DOM?.videoFeed) {
        videoEl = window.DOM.videoFeed;
        structuredLog('DEBUG', 'COMMAND: Using DOM.videoFeed element');
        coreLoggerOutput('debug', 'COMMAND: Using DOM.videoFeed element');
      } else if (!videoEl) {
        // Create a temporary video element if none provided
        videoEl = document.createElement('video');
        videoEl.setAttribute('playsinline', 'true');
        videoEl.setAttribute('muted', 'true');
        structuredLog('DEBUG', 'COMMAND: Created temporary video element');
        coreLoggerOutput('debug', 'COMMAND: Created temporary video element');
      }

      videoEl.srcObject = _activeMediaStream;
      structuredLog('DEBUG', 'COMMAND: Stream assigned to video element, waiting for play...');
      coreLoggerOutput('debug', 'COMMAND: Stream assigned to video element, waiting for play...');
      
      await videoEl.play();
      structuredLog('INFO', 'COMMAND: Video stream is active and metadata loaded.');
      coreLoggerOutput('info', 'COMMAND: Video stream is active and metadata loaded.');

      structuredLog('DEBUG', 'COMMAND: Initializing video pipeline...');
      coreLoggerOutput('debug', 'COMMAND: Initializing video pipeline...');
      await initializeVideo({
        videoElement: videoEl,
        engine: engine,
        getEngineState: () => engine.getState(),
        getCurrentGrid: () => engine.getState().currentGrid,
        registerWorker: window.__acoustseeDevPanelRegisterWorker,
        motionThreshold: s.motionThreshold,
      });
      
      structuredLog('INFO', 'COMMAND: startProcessing COMPLETED successfully.');
      coreLoggerOutput('info', 'COMMAND: startProcessing COMPLETED successfully.');

    } catch (err) {
      structuredLog('ERROR', 'COMMAND: startProcessing FAILED.', { error: err.message, stack: err.stack });
      coreLoggerOutput('error', `COMMAND: startProcessing FAILED - ${err.message}`);
      if (_activeMediaStream) {
        _activeMediaStream.getTracks().forEach(track => track.stop());
        _activeMediaStream = null;
      }
      s.isProcessing = false;
      throw err; // Re-throw to help with debugging
    }
  }));

  // The "Smart" Stop Handler - SOLE OWNER of stopping the processing lifecycle.
  registerCommandHandler('stopProcessing', ({ state: s }) => {
    structuredLog('INFO', 'COMMAND: stopProcessing begins.');
    coreLoggerOutput('info', 'COMMAND: stopProcessing begins.');
    if (_activeMediaStream) {
      _activeMediaStream.getTracks().forEach(track => track.stop());
      _activeMediaStream = null;
    }
    // Any necessary teardown for video/audio pipelines can be dispatched from here.
    s.isProcessing = false;
    structuredLog('INFO', 'COMMAND: stopProcessing COMPLETED.');
    coreLoggerOutput('info', 'COMMAND: stopProcessing COMPLETED.');
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
  
  structuredLog('INFO', 'MEDIA-COMMANDS: All command handlers registered successfully.');
  coreLoggerOutput('info', 'MEDIA-COMMANDS: All command handlers registered successfully.');
}
