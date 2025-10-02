// File: web/core/commands/media-commands.js
// Handles commands related to starting, stopping, and processing media streams.
// MAMware review R250905: microphone-controller.js seems better consolidated into media-controller.js

import { settings, setMicStream, allocateFrameBuffer } from '../state.js';
import { structuredLog } from '../../utils/logging.js';
import { 
  executeCriticalOperation, 
  AccessibilityError, 
  showCriticalError 
} from '../../utils/error-handling.js';
import { startCamera as mediaStartCamera, stopCamera as mediaStopCamera, isCameraActive } from '../media-controller.js';
import { startMic, stopMic } from '../microphone-controller.js';
import * as audioProcessor from '../../audio/audio-processor.js';
import { initializeVideo } from '../../video/frame-processor.js';

// Core media command functionality

// These variables will be managed by the command handlers, keeping them out of the main engine. 
let _videoElForScheduler = null;
let _canvasElForScheduler = null;
let _activeMediaStream = null; // Isolate the MediaStream here to prevent state cloning errors

export function registerMediaCommands(engine) {
  const { registerCommandHandler } = engine;
  
  structuredLog('INFO', 'MEDIA-COMMANDS: Registering command handlers...');

  // Wrap async handlers to catch and log errors properly
  const wrapAsyncHandler = (handlerName, handler) => {
    return async (args) => {
      structuredLog('DEBUG', `ASYNC-HANDLER: ${handlerName} starting`, args);
      try {
        const result = await handler(args);
        structuredLog('DEBUG', `ASYNC-HANDLER: ${handlerName} completed`, { result });
        return result;
      } catch (error) {
        structuredLog('ERROR', `ASYNC-HANDLER: ${handlerName} failed`, { 
          error: error.message, 
          stack: error.stack 
        });
        throw error;
      }
    };
  };

  // The "Dumb" Toggle Handler - Its ONLY job is to delegate.
  registerCommandHandler('toggleProcessing', ({ state: s, payload }) => {
    structuredLog('DEBUG', 'COMMAND: toggleProcessing received', { isProcessing: s.isProcessing });
    if (s.isProcessing) {
      engine.dispatch('stopProcessing', payload);
    } else {
      engine.dispatch('startProcessing', payload);
    }
  });

    // The "Smart" Start Handler - SOLE OWNER of starting the processing lifecycle.
  registerCommandHandler('startProcessing', wrapAsyncHandler('startProcessing', async ({ state: s, payload }) => {
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

      // Change to INFO level since this is important initialization information
      structuredLog('INFO', 'COMMAND: Initializing video pipeline...');
      await initializeVideo({
        videoElement: videoEl,
        engine: engine,
        getEngineState: () => engine.getState(),
        getCurrentGrid: () => {
          const state = engine.getState();
          if (!state.availableGrids || state.availableGrids.length === 0) {
            structuredLog('WARN', 'No grids available for getCurrentGrid');
            return null;
          }
          // Find the grid with the current gridType
          const currentGrid = state.availableGrids.find(grid => grid.id === state.gridType);
          if (!currentGrid) {
            structuredLog('WARN', 'Current grid not found', { gridType: state.gridType, availableGrids: state.availableGrids.map(g => g.id) });
            return state.availableGrids[0]; // Fallback to first available grid
          }
          return currentGrid;
        },
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
  }));

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
    return await executeCriticalOperation('media-controller', async () => {
      const videoEl = payload?.videoEl;
      if (isCameraActive(videoEl || null) || s.isProcessing) {
        await mediaStopCamera(videoEl);
        return { cameraActive: false };
      } else {
        await mediaStartCamera(videoEl, { facingMode: 'environment' });
        return { cameraActive: true };
      }
    }, {
      hasVideoElement: !!payload?.videoEl,
      currentlyProcessing: !!s.isProcessing,
      cameraCurrentlyActive: isCameraActive(payload?.videoEl || null)
    }).catch(error => {
      // If camera fails, show critical error since visual-to-audio needs camera
      if (error.isAccessibilityError) {
        showCriticalError(
          'Camera Access Failed',
          'AcoustSee requires camera access to convert visual information to audio. Please allow camera permissions and try again.',
          { 
            error: error.message,
            code: error.code,
            troubleshooting: 'Check camera permissions in browser settings'
          }
        );
      }
      return { ok: false, error: error.message };
    });
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
}
