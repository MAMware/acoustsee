// File: web/core/commands/media-commands.js
// Handles commands related to starting, stopping, and processing media streams.

import { structuredLog } from '../../utils/logging.js';
import { 
  executeCriticalOperation, 
  AccessibilityError, 
  showCriticalError,
  showAudioFailureIndicator
} from '../../utils/error-handling.js';
import { hapticCount, announceMessage } from '../../utils/utils.js';
import { 
  categorizeMediaError, 
  trackCameraPermissionDenial, 
  emitCameraErrorEvent 
} from '../../utils/ingest.js';
import { startCamera as mediaStartCamera, stopCamera as mediaStopCamera, isCameraActive, startMic, stopMic } from '../media-controller.js';
// Do not import audio-processor directly in command modules; use engine.audioApi
import { initializeVideo, disposeVideo } from '../../video/frame-processor.js';

// Core media command functionality

// ISSUE #3 FIX: Module-level singleton state breaks the Engine concept.
// Previous: let _activeMediaStream = null; (persists across Engine destroy/recreate)
// Solution: Use MediaAdapter class instance managed by Engine lifecycle.
// This allows clean destroy/recreate for unit tests or app reset.

/**
 * MediaAdapter: Manages media resources (streams, elements) with Engine lifecycle.
 * 
 * Benefits over module-level singletons:
 * 1. Engine can cleanly destroy and recreate without stale references
 * 2. Unit tests can create fresh MediaAdapter per test
 * 3. Resources are explicitly tied to Engine instance lifetime
 * 4. Prevents memory leaks from orphaned MediaStream references
 */
class MediaAdapter {
  constructor() {
    this.activeMediaStream = null;
    this.videoElement = null;
    this.canvasElement = null;
    this.isDisposed = false;
  }
  
  setMediaStream(stream) {
    if (this.isDisposed) {
      structuredLog('WARN', 'MediaAdapter: attempted to set stream on disposed adapter');
      return;
    }
    this.activeMediaStream = stream;
  }
  
  getMediaStream() {
    return this.activeMediaStream;
  }
  
  stopMediaStream() {
    if (this.activeMediaStream) {
      try {
        this.activeMediaStream.getTracks().forEach(track => {
          try { track.stop(); } catch (_) {}
        });
      } catch (_) {}
      this.activeMediaStream = null;
    }
  }
  
  setVideoElement(el) {
    this.videoElement = el;
  }
  
  setCanvasElement(el) {
    this.canvasElement = el;
  }
  
  /**
   * Dispose all resources. Called when Engine is destroyed.
   */
  dispose() {
    structuredLog('DEBUG', 'MediaAdapter: disposing all resources');
    this.stopMediaStream();
    this.videoElement = null;
    this.canvasElement = null;
    this.isDisposed = true;
  }
}

// Symbol key to store MediaAdapter on engine instance
const MEDIA_ADAPTER_KEY = Symbol.for('acoustsee.mediaAdapter');

/**
 * Get or create MediaAdapter for this engine instance
 * @param {Object} engine - The engine instance
 * @returns {MediaAdapter} The adapter instance
 */
function getMediaAdapter(engine) {
  if (!engine[MEDIA_ADAPTER_KEY]) {
    engine[MEDIA_ADAPTER_KEY] = new MediaAdapter();
    
    // Register cleanup on engine dispose if available
    if (typeof engine.onDispose === 'function') {
      engine.onDispose(() => {
        engine[MEDIA_ADAPTER_KEY]?.dispose();
        delete engine[MEDIA_ADAPTER_KEY];
      });
    }
  }
  return engine[MEDIA_ADAPTER_KEY];
}

export function registerMediaCommands(engine) {
  const { registerCommandHandler } = engine;
  
  // Get the MediaAdapter for this engine instance
  const mediaAdapter = getMediaAdapter(engine);
  
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
        const err = new AccessibilityError(
          'Audio system not initialized. Power-on gesture must complete audio initialization before starting video processing.',
          'AUDIO_SYSTEM_NOT_INITIALIZED',
          { stage: 'startProcessing', hasAudioApi: false }
        );
        structuredLog('ERROR', 'COMMAND: startProcessing BLOCKED - Audio system not ready', { error: err.message });
        // Accessibility alert: haptic + announcement for blind users
        hapticCount(3); // 3 pulses = critical error
        announceMessage('Error: Audio system not ready. Please tap to activate audio first.');
        showAudioFailureIndicator('Audio Not Ready - When app starts Tap PowerOn at center of the screen First');
        throw err;
      }

      // CRITICAL FIX (Issue #1): Validate AudioContext is not suspended
      // For blind users, a silent app is indistinguishable from a broken app
      const audioContext = engine.audioApi?.context || engine.audioApi?.audioManager?.context;
      if (audioContext && audioContext.state === 'suspended') {
        // Attempt to resume the AudioContext
        try {
          await audioContext.resume();
          structuredLog('INFO', 'COMMAND: AudioContext resumed successfully from suspended state');
        } catch (resumeError) {
          const err = new AccessibilityError(
            'Audio is suspended and cannot be resumed. Please tap the screen to enable audio.',
            'AUDIO_CONTEXT_SUSPENDED',
            { 
              contextState: audioContext.state, 
              resumeError: resumeError?.message,
              stage: 'startProcessing'
            }
          );
          structuredLog('ERROR', 'COMMAND: startProcessing BLOCKED - AudioContext suspended', { 
            error: err.message,
            contextState: audioContext.state
          });
          // ACCESSIBILITY ALERT: Critical for blind users
          hapticCount(3); // 3 pulses = critical error pattern
          announceMessage('Error: Audio is suspended. Please tap the screen to enable sound.');
          showAudioFailureIndicator('Audio Suspended - Tap to Enable');
          throw err;
        }
      }

      if (s.isProcessing) {
        structuredLog('WARN', 'COMMAND: startProcessing aborted - already processing');
        return; // Prevent re-entry
      }

      try {
        structuredLog('INFO', 'COMMAND: Start processing initiated.');

        structuredLog('DEBUG', 'COMMAND: Requesting camera permissions...');
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        mediaAdapter.setMediaStream(stream);
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
        try { videoEl.srcObject = mediaAdapter.getMediaStream(); } catch (_) {}
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

        if (mediaAdapter.getMediaStream()) {
          mediaAdapter.stopMediaStream();
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

  // Set preferred video source (auto, MediaStreamTrackProcessor, Canvas2D)
  registerCommandHandler('setPreferredVideoSource', ({ state: s, payload }) => {
    const source = payload && payload.source !== undefined ? payload.source : null;
    const current = s.videoCapture || {};

    try {
      engine.setState({
        videoCapture: Object.assign({}, current, {
          preferredSource: source, // null = auto, or explicit source name
        }),
      });
      structuredLog('INFO', 'COMMAND: setPreferredVideoSource applied', { source });
    } catch (e) {
      structuredLog('WARN', 'COMMAND: setPreferredVideoSource failed', { error: e.message });
    }
  });

    // New: initializeVideoPipeline - dedicated video pipeline initialization
    registerCommandHandler('initializeVideoPipeline', wrapAsyncHandler('initializeVideoPipeline', async ({ state: s, payload }) => {
      const { videoEl, stream } = payload || {};
      if (!videoEl || !stream) {
        throw new Error('initializeVideoPipeline requires { videoEl, stream } payload');
      }

      // Store stream reference in MediaAdapter for teardown (Issue #3 fix)
      mediaAdapter.setMediaStream(stream);

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
        // Best-effort cleanup of stream on failure using MediaAdapter
        mediaAdapter.stopMediaStream();
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
    
    // Issue #3 fix: Use MediaAdapter for stream cleanup
    mediaAdapter.stopMediaStream();
    
    // CRITICAL FIX: Send empty cues to all synths to force voice cleanup
    try {
      if (engine.audioApi && typeof engine.audioApi.playCues === 'function') {
        engine.audioApi.playCues([]); // Send empty array to stop all voices
        structuredLog('DEBUG', 'Sent empty cues array to stop synth voices');
      }
    } catch (err) {
      structuredLog('ERROR', 'Failed to stop synth voices', { error: err.message });
    }
    
    // Dispose video pipeline to terminate all workers
    try {
      disposeVideo();
      structuredLog('DEBUG', 'Video pipeline disposed (all workers terminated)');
    } catch (err) {
      structuredLog('ERROR', 'Failed to dispose video pipeline', { error: err.message });
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

  // Start camera: Lightweight command to get camera stream (no pipeline init)
  registerCommandHandler('startCamera', async ({ state: s, payload }) => {
    try {
      const stream = await mediaStartCamera();
      mediaAdapter.setMediaStream(stream);
      engine.emit('video_capture_started', { timestamp: Date.now() });
      return { ok: true };
    } catch (error) {
      structuredLog('ERROR', 'startCamera failed', { error: error.message });
      return { ok: false, error: error.message };
    }
  });

  // Stop camera: Lightweight command to stop stream
  registerCommandHandler('stopCamera', ({ state: s, payload }) => {
    try {
      mediaAdapter.stopMediaStream();
      engine.emit('video_capture_stopped', { timestamp: Date.now() });
      return { ok: true };
    } catch (error) {
      structuredLog('ERROR', 'stopCamera failed', { error: error.message });
      return { ok: false, error: error.message };
    }
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
