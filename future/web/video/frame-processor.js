// filepath: future/web/video/frame-processor.js
import { structuredLog } from '../utils/logging.js';
import { rgbaToY } from './videoframe-helper.js';
import { 
  executeCriticalOperation, 
  AccessibilityError, 
  showCriticalError 
} from '../utils/error-handling.js';

// --- ADD THESE SIMULATED WORKER FUNCTIONS at the top of the file, after the imports ---
async function simulateObjectDetection(motionResults) {
  // Use detected objects from motion worker
  const detectedObjects = motionResults.objects.map(obj => ({
    label: obj,
    confidence: 0.8,
    position: { x: 100, y: 100 } // Placeholder
  }));
  return { detectedObjects };
}

async function simulateShapeAnalysis(object) {
  // Pretend all detected objects are "tall and thin".
  if (object) {
    return {
      shape: { verticality: 0.9, horizontality: 0.2, complexity: 0.3 }
    };
  }
  return { shape: {} };
}
// --- END SIMULATED WORKERS ---

// --- Module State ---
let _config = {};
let frameProviderWorker = null;
let motionWorker = null;
let depthWorker = null;

// --- Helper Functions ---
function startMotionWorker() {
  if (motionWorker) return;
  try {
    const workerPath = state.currentMode === 'hybrid' ? './workers/image-worker.js' : './workers/motion-worker.js';
    motionWorker = new Worker(new URL(workerPath, import.meta.url), { type: 'module' });
    if (_config.registerWorker) _config.registerWorker(motionWorker, 'MotionSpecialist');
    
    // Add error handler for worker crashes
    motionWorker.onerror = (error) => {
      structuredLog('ERROR', 'Motion worker error', { 
        message: error.message, 
        filename: error.filename, 
        lineno: error.lineno 
      });
    };
    
    motionWorker.onmessage = (e) => {
      // This worker now uses a custom event system for promises
      const event = new CustomEvent('motionResult', { detail: e.data });
      motionWorker.dispatchEvent(event);
    };
    structuredLog('INFO', 'Motion Specialist worker started.');
    
    // Start depth worker for hybrid/focus
    if (state.currentMode === 'hybrid' || state.currentMode === 'focus') {
      startDepthWorker();
    }
  } catch (e) {
    structuredLog('ERROR', 'Failed to start Motion Specialist worker.', { error: e });
  }
}

function startDepthWorker() {
  if (depthWorker) return;
  try {
    depthWorker = new Worker(new URL('./workers/depth-worker.js', import.meta.url), { type: 'module' });
    if (_config.registerWorker) _config.registerWorker(depthWorker, 'DepthSpecialist');
    
    depthWorker.onerror = (error) => {
      structuredLog('ERROR', 'Depth worker error', { 
        message: error.message, 
        filename: error.filename, 
        lineno: error.lineno 
      });
    };
    
    depthWorker.onmessage = (e) => {
      if (e.data.type === 'depthCues') {
        engine.dispatch('depthCuesReady', e.data.result);
      }
    };
    structuredLog('INFO', 'Depth Specialist worker started.');
  } catch (e) {
    structuredLog('ERROR', 'Failed to start Depth Specialist worker.', { error: e });
  }
}

let prevFrameData = null;

function processWithMotionWorker(frameData, width, height) {
  return new Promise(resolve => {
    if (!motionWorker) return resolve({ movingRegions: [], textureGrid: [], objects: [], inferredBPM: 100 });

    const messageHandler = (event) => {
      const data = event.detail;
      if (data.type === 'flowCues') {
        motionWorker.removeEventListener('motionResult', messageHandler);
        const { result } = data;
        // Convert to old format for compatibility
        const movingRegions = result.gridFlows.flat().map(f => ({ x: 0, y: 0, intensity: f.mag * 10 })); // Placeholder
        const motionResults = { ...result, movingRegions };
        // Dispatch new cues for hybrid mode
        engine.dispatch('flowCuesReady', motionResults);
        if (motionResults.objects.length > 0) engine.dispatch('objectCuesReady', { objects: motionResults.objects });
        if (Math.abs(motionResults.inferredBPM - (state.bpm || 100)) > 5) {
          engine.dispatch('bpmUpdate', { bpm: motionResults.inferredBPM });
        }
        resolve(motionResults);
      }
    };
    motionWorker.addEventListener('motionResult', messageHandler);

    const frame = { data: frameData, width, height };
    const prevFrame = prevFrameData ? { data: prevFrameData, width, height } : frame;
    motionWorker.postMessage({
      type: 'processFrame', frame, prevFrame, gridSize: { rows: 4, cols: 4 }
    });
    if (depthWorker) {
      depthWorker.postMessage({
        type: 'processFrame', frame, prevFrame, gridSize: { rows: 4, cols: 4 }
      });
    }
    prevFrameData = frameData.slice();
  });
}

/**
 * Initializes the modern, off-thread video processing pipeline.
 * This is the single, correct entry point for video processing.
 */
export async function initializeVideo(config) {
  _config = { ..._config, ...config };
  
  structuredLog('DEBUG', 'initializeVideo: Starting video pipeline initialization', config);

  startMotionWorker();
  // startDepthWorker(); // etc.

  return await executeCriticalOperation('video-processing', async () => {
    const { videoElement, engine } = config;
    if (!videoElement || !videoElement.srcObject) {
      throw new AccessibilityError(
        "Camera access is required for visual-to-audio conversion",
        'VIDEO_SOURCE_UNAVAILABLE',
        { hasVideoElement: !!videoElement, hasSrcObject: !!videoElement?.srcObject }
      );
    }
    
    // Only log video validation occasionally to reduce dev panel spam
    if (Math.random() < 0.1) {
      structuredLog('DEBUG', 'initializeVideo: Video element validated', { 
        hasVideoElement: !!videoElement, 
        hasSrcObject: !!videoElement.srcObject,
        videoWidth: videoElement.videoWidth,
        videoHeight: videoElement.videoHeight 
      });
    }
    
    // Check for required APIs with better fallback handling
    const hasOffscreenCanvas = 'transferControlToOffscreen' in HTMLCanvasElement.prototype;
    const hasMediaStreamTrackProcessor = typeof MediaStreamTrackProcessor !== 'undefined';
    
    if (!hasOffscreenCanvas) {
      structuredLog('WARN', 'OffscreenCanvas not supported, video processing may be limited');
      // For now, we'll still throw since our current architecture requires it
      throw new Error('OffscreenCanvas is required but not supported in this browser');
    }
    
    if (!hasMediaStreamTrackProcessor) {
      structuredLog('WARN', 'MediaStreamTrackProcessor not supported, trying alternative approach');
      // We could implement a Canvas2D fallback here, but for now let's see if this is the issue
      throw new Error('MediaStreamTrackProcessor is required but not supported in this browser');
    }
    
    structuredLog('DEBUG', 'initializeVideo: Starting frame provider worker...');
    frameProviderWorker = new Worker(new URL('./workers/frame-provider-worker.js', import.meta.url), { type: 'module' });
    if (_config.registerWorker) _config.registerWorker(frameProviderWorker, 'FrameProvider');
    
    // Expose worker globally for dev panel throttling controls
    window.frameProviderWorker = frameProviderWorker;

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;
    structuredLog('DEBUG', 'initializeVideo: Canvas created', { width: canvas.width, height: canvas.height });
    
    const offscreenCanvas = canvas.transferControlToOffscreen();
    
    const [track] = videoElement.srcObject.getVideoTracks();
    if (!track) {
      throw new Error('No video track found in MediaStream');
    }
    
    const trackProcessor = new MediaStreamTrackProcessor({ track });
    const streamReader = trackProcessor.readable;
    
    structuredLog('DEBUG', 'initializeVideo: Sending init message to frame provider worker...');

    frameProviderWorker.postMessage(
      { type: 'init', payload: { canvas: offscreenCanvas, streamReader } },
      [offscreenCanvas, streamReader]
    );

    // This onmessage handler IS the Orchestrator.
    frameProviderWorker.onmessage = async (event) => {
      const { type, payload } = event.data;
      if (type !== 'frame') return;

      const state = engine.getState();
      const frameData = new Uint8ClampedArray(payload.imageDataBuffer);
      const grid = _config.getCurrentGrid();
      let dispatchPayload = null;

      // Only log every 30th frame to avoid flooding console
      if (payload.frameId && payload.frameId % 30 === 0) {
        structuredLog('DEBUG', 'Frame processor: Received frame', { 
          mode: state.currentMode, 
          hasGrid: !!grid, 
          gridId: grid?.id 
        });
      }

      if (state.currentMode === 'flow') {
        const motionResults = await processWithMotionWorker(frameData, payload.width, payload.height);
        
        // Dispatch new cues
        engine.dispatch('flowCuesReady', motionResults);
        if (motionResults.objects.length > 0) engine.dispatch('objectCuesReady', { objects: motionResults.objects });
        if (Math.abs(motionResults.inferredBPM - (state.bpm || 100)) > 5) {
          engine.dispatch('bpmUpdate', { bpm: motionResults.inferredBPM });
        }
        
        // Log textureGrid for debug
        if (window.location.search.includes('debug=true')) {
          structuredLog('DEBUG', 'Cues', { textureGrid: motionResults.textureGrid, objects: motionResults.objects });
        }
        
        // Very aggressive sampling - only log every 100th frame to reduce dev panel spam
        if (payload.frameId && payload.frameId % 100 === 0) {
          structuredLog('DEBUG', 'Frame processor: Motion results', { 
            movingRegions: motionResults.movingRegions.length 
          });
        }
        
        if (grid && grid.mapFunction) {
          const gridOutput = grid.mapFunction(frameData, payload.width, payload.height, null, motionResults);
          structuredLog('DEBUG', 'Grid cues generated', { cueCount: gridOutput?.cues?.length || 0, mode: state.currentMode, motionPresent: !!motionResults });
          if (gridOutput && gridOutput.cues && gridOutput.cues.length > 0) {
            // In Flow mode, the payload includes the cues array
            dispatchPayload = { cues: gridOutput.cues };
            // Only log every 30th frame to avoid flooding console
            if (payload.frameId && payload.frameId % 30 === 0) {
              structuredLog('DEBUG', 'Frame processor: Generated cues for Flow mode', { 
                cuesCount: gridOutput.cues.length 
              });
            }
          }
        }

      } else if (state.currentMode === 'focus') {
        // In Focus mode, run specialists and generate a rich payload
        const motionResults = await processWithMotionWorker(frameData, payload.width, payload.height);
        
        // Dispatch new cues
        engine.dispatch('flowCuesReady', motionResults);
        if (motionResults.objects.length > 0) engine.dispatch('objectCuesReady', { objects: motionResults.objects });
        if (Math.abs(motionResults.inferredBPM - (state.bpm || 100)) > 5) {
          engine.dispatch('bpmUpdate', { bpm: motionResults.inferredBPM });
        }
        
        const objectResults = await simulateObjectDetection(motionResults);

        if (objectResults.detectedObjects.length > 0) {
          const mainObject = objectResults.detectedObjects[0];
          const shapeResults = await simulateShapeAnalysis(mainObject);

          // Part A: Create the Primary "Identity" Cue with an 'isPrimary' flag
          const primaryCue = {
            objectType: mainObject.label, // 'bottle' from our simulation
            intensity: mainObject.confidence,
            position: mainObject.position,
            isPrimary: true
          };

          // Part B: Use the Grid as a "Sonic Sculptor" to create the "sheet music"
          let secondaryCues = [];
          if (grid && grid.mapFunction) {
             const gridOutput = grid.mapFunction(null, payload.width, payload.height, null, shapeResults);
             secondaryCues = (gridOutput && gridOutput.cues) || [];
          }
          structuredLog('DEBUG', 'Grid cues generated', { cueCount: secondaryCues.length, mode: state.currentMode, motionPresent: !!objectResults });

          // If the grid didn't produce any "form" cues, create a simple default one.
          if (secondaryCues.length === 0) {
            secondaryCues.push({ pitch: 440, intensity: 0.8, position: mainObject.position });
          }

          // Combine into a single standardized cues array (primary first)
          const combinedCues = [primaryCue, ...secondaryCues];
          dispatchPayload = { cues: combinedCues };
        }
      }
      
      if (dispatchPayload) {
        structuredLog('INFO', 'Dispatching audioCuesReady', { cueCount: dispatchPayload.cues ? dispatchPayload.cues.length : 0, mode: state.currentMode });
        engine.dispatch('audioCuesReady', {
          cues: dispatchPayload.cues || [],
          frameId: payload.frameId,
          startTime: payload.startTime
        });
        // Robust fallback: also dispatch direct audio play command which may be
        // consumed by older or alternate audio handlers expecting this event.
        try {
          engine.dispatch && engine.dispatch('audioPlayCues', { cues: dispatchPayload.cues || [] });
          structuredLog('DEBUG', 'Frame processor: Also dispatched audioPlayCues fallback', { cueCount: dispatchPayload.cues.length });
        } catch (e) {
          structuredLog('WARN', 'Frame processor: Failed to dispatch audioPlayCues fallback', { error: e?.message || String(e) });
        }
      }
    };

    engine.onStateChange(state => {
      if (!frameProviderWorker) return;
      if (state.isProcessing) {
        frameProviderWorker.postMessage({ type: 'start' });
      } else {
        frameProviderWorker.postMessage({ type: 'stop' });
      }
    });
    
    structuredLog('INFO', 'initializeVideo: Video pipeline initialization completed successfully');
    return true; // Success indicator
  }, { 
    videoElement: config?.videoElement, 
    hasCamera: !!config?.videoElement?.srcObject 
  });
}