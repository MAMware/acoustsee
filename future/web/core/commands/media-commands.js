// File: web/core/commands/media-commands.js
// Handles commands related to starting, stopping, and processing media streams.

import { structuredLog } from '../../utils/logging.js';
import { 
  executeCriticalOperation, 
  AccessibilityError, 
  showCriticalError 
} from '../../utils/error-handling.js';
import { 
  categorizeMediaError, 
  trackCameraPermissionDenial, 
  emitCameraErrorEvent 
} from '../../utils/ingest.js';
import { startCamera as mediaStartCamera, stopCamera as mediaStopCamera, isCameraActive, startMic, stopMic } from '../media-controller.js';
// Do not import audio-processor directly in command modules; use engine.audioApi
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

      // CRITICAL: Audio system must be initialized before processing video
      // The entire application purpose is visual-to-audio conversion
      if (!engine.audioApi) {
        const err = new Error('Audio system not initialized. Power-on gesture must complete audio initialization before starting video processing.');
        structuredLog('ERROR', 'COMMAND: startProcessing BLOCKED - Audio system not ready', { error: err.message });
        throw err;
      }

      if (s.isProcessing) {
        structuredLog('WARN', 'COMMAND: startProcessing aborted - already processing');
        return; // Prevent re-entry
      }

      try {
        structuredLog('INFO', 'COMMAND: Start processing initiated.');

        structuredLog('DEBUG', 'COMMAND: Requesting camera permissions...');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        _activeMediaStream = stream;
        structuredLog('DEBUG', 'COMMAND: Camera stream acquired successfully.');

        // ADR-0011: Request video element from UI layer (headless core pattern)
        // Core layer should never create DOM elements directly
        let videoEl = payload?.videoEl;
        if (!videoEl) {
          try {
            // Request from UI adapter
            videoEl = await engine.requestResource('VIDEO_ELEMENT', {
              reason: 'camera-preview',
              stream
            });
            structuredLog('DEBUG', 'COMMAND: Video element provided by UI adapter');
          } catch (resourceError) {
            // Fallback: check window.DOM (backward compatibility)
            if (typeof window !== 'undefined' && window.DOM?.videoFeed) {
              videoEl = window.DOM.videoFeed;
              structuredLog('DEBUG', 'COMMAND: Using DOM.videoFeed fallback');
            } else {
              throw new Error('No video element available. UI adapter not initialized?');
            }
          }
        }

        // Attach and play stream (play errors are non-fatal for autoplay policies)
        try { videoEl.srcObject = _activeMediaStream; } catch (_) {}
        try { await videoEl.play(); } catch (e) { /* ignore autoplay rejects */ }

        // Mark processing state (serializable via engine.setState when available)
        if (typeof engine.setState === 'function') {
          engine.setState({ isProcessing: true });
        } else {
          s.isProcessing = true;
        }

        // Hand off to the new initializeVideoPipeline command for heavy lifting
        await engine.dispatch('initializeVideoPipeline', { videoEl, stream });

        structuredLog('INFO', 'COMMAND: startProcessing initiation completed.');
      } catch (err) {
        // Enhanced error handling: categorize camera-specific errors
        const categorized = categorizeMediaError(err);
        
        structuredLog('ERROR', 'COMMAND: startProcessing FAILED.', { 
          error: err.message, 
          stack: err.stack,
          errorType: categorized.errorType,
          errorCategory: categorized.errorCategory,
          isDenial: categorized.isDenial
        });

        // Track camera-specific permission denials and hardware issues for analytics
        if (categorized.isDenial || categorized.isHardwareIssue) {
          trackCameraPermissionDenial(err, {
            traceId: payload?.traceId || null,
            additionalContext: {
              command: 'startProcessing',
              stage: 'getUserMedia'
            }
          });
          
          // Emit structured event for ingest system to categorize separately
          emitCameraErrorEvent(engine, categorized.errorCategory, {
            message: err.message,
            isDenial: categorized.isDenial,
            isHardwareIssue: categorized.isHardwareIssue
          });
        }

        if (_activeMediaStream) {
          try { _activeMediaStream.getTracks().forEach(track => track.stop()); } catch (_) {}
          _activeMediaStream = null;
        }
        if (typeof engine.setState === 'function') engine.setState({ isProcessing: false });
        throw err; // Re-throw to help with debugging
      }
  }));

  // Debug-only: allow dev panel to configure which video workers are enabled
  registerCommandHandler('updateVideoWorkerDebugConfig', ({ state: s, payload }) => {
    const enabled = payload && payload.enabled ? payload.enabled : {};
    const current = s.orchestration || {};
    const prevDebug = current.videoWorkerDebugConfig || {};
    const nextDebug = Object.assign({}, prevDebug, enabled);

    try {
      engine.setState({
        orchestration: Object.assign({}, current, {
          videoWorkerDebugConfig: nextDebug,
        }),
      });
      structuredLog('DEBUG', 'COMMAND: updateVideoWorkerDebugConfig applied', { enabled: nextDebug });
    } catch (e) {
      structuredLog('WARN', 'COMMAND: updateVideoWorkerDebugConfig failed to update state', { error: e.message });
    }
  });

    // New: initializeVideoPipeline - dedicated video pipeline initialization
    registerCommandHandler('initializeVideoPipeline', wrapAsyncHandler('initializeVideoPipeline', async ({ state: s, payload }) => {
      const { videoEl, stream } = payload || {};
      if (!videoEl || !stream) {
        throw new Error('initializeVideoPipeline requires { videoEl, stream } payload');
      }

      // Keep a module-scoped reference for teardown
      _activeMediaStream = stream;

      try {
        structuredLog('INFO', 'COMMAND: Initializing video pipeline...');

        // Publish source video size into state and keep it updated
        const updateVideoSize = () => {
          try {
            const w = Number(videoEl.videoWidth) || 0;
            const h = Number(videoEl.videoHeight) || 0;
            if (w > 0 && h > 0) {
              const cur = engine.getState().videoSize || {};
              if (cur.width !== w || cur.height !== h) {
                engine.setState({ videoSize: { width: w, height: h } });
              }
            }
          } catch (_) {}
        };
        try {
          updateVideoSize();
          videoEl.addEventListener('loadedmetadata', updateVideoSize, { passive: true });
          videoEl.addEventListener('resize', updateVideoSize, { passive: true });
          videoEl.addEventListener('playing', updateVideoSize, { passive: true });
        } catch (_) {}

        // Allocate a reusable frame buffer for worker transfer path if enabled
        try {
          const w = Number(videoEl.videoWidth) || 0;
          const h = Number(videoEl.videoHeight) || 0;
          if (s.workerTransferEnabled && w > 0 && h > 0) {
            engine.dispatch('allocateFrameBuffer', { width: w, height: h });
          }
        } catch (e) { /* best-effort */ }

        const currentState = engine.getState();
        const orchestration = currentState.orchestration || {};
        const debugWorkerEnabled = orchestration.videoWorkerDebugConfig || null;

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
            const currentGrid = state.availableGrids.find(grid => grid.id === state.gridType);
            if (!currentGrid) {
              structuredLog('WARN', 'Current grid not found', { gridType: state.gridType, availableGrids: state.availableGrids.map(g => g.id) });
              return state.availableGrids[0];
            }
            return currentGrid;
          },
          debugWorkerEnabled,
          registerWorker: window.__acoustseeDevPanelRegisterWorker,
          motionThreshold: s.motionThreshold,
        });

        structuredLog('INFO', 'COMMAND: initializeVideoPipeline COMPLETED successfully.');
        return { ok: true };
      } catch (err) {
        structuredLog('ERROR', 'COMMAND: initializeVideoPipeline FAILED.', { error: err.message, stack: err.stack });
        // Best-effort cleanup of stream on failure
        if (_activeMediaStream) {
          try { _activeMediaStream.getTracks().forEach(t => { try { t.stop(); } catch (_) {} }); } catch (_) {}
          _activeMediaStream = null;
        }
        throw err;
      }
    }));

  // The "Smart" Stop Handler - SOLE OWNER of stopping the processing lifecycle.
  registerCommandHandler('stopProcessing', ({ state: s, payload }) => {
    // Capture call stack to identify who called stopProcessing
    const callStack = new Error().stack;
    const callerInfo = callStack?.split('\n')[2]?.trim() || 'unknown';
    
    structuredLog('INFO', 'COMMAND: stopProcessing begins.', { 
      caller: callerInfo,
      hasPayload: !!payload,
      isProcessing: s.isProcessing 
    });
    
    if (_activeMediaStream) {
      _activeMediaStream.getTracks().forEach(track => track.stop());
      _activeMediaStream = null;
    }
    
    // CRITICAL FIX: Send empty cues to all synths to force voice cleanup
    try {
      if (engine.audioApi && typeof engine.audioApi.playCues === 'function') {
        engine.audioApi.playCues([]); // Send empty array to stop all voices
        structuredLog('DEBUG', 'Sent empty cues array to stop synth voices');
      }
    } catch (err) {
      structuredLog('ERROR', 'Failed to stop synth voices', { error: err.message });
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
        await mediaStartCamera(videoEl, { facingMode: 'environment' }, s);
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
        engine.dispatch('setMicStream', { stream: null });
        return { micActive: false };
      } else {
        const stream = await startMic();
        if (stream) {
          engine.dispatch('setMicStream', { stream });
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
