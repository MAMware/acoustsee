// filepath: future/web/video/frame-processor.js
import { structuredLog } from '../utils/logging.js';
import { rgbaToY } from './videoframe-helper.js';

// --- Module State ---
let _config = {};
let frameProviderWorker = null;
let motionWorker = null;
// ... add placeholders for future specialist workers (depthWorker, etc.)

// --- Helper Functions ---
function startMotionWorker() {
  if (motionWorker) return;
  try {
    motionWorker = new Worker(new URL('./workers/motion-worker.js', import.meta.url), { type: 'module' });
    if (_config.registerWorker) _config.registerWorker(motionWorker, 'MotionSpecialist');
    motionWorker.onmessage = (e) => {
      // This worker now uses a custom event system for promises
      const event = new CustomEvent('motionResult', { detail: e.data });
      motionWorker.dispatchEvent(event);
    };
    structuredLog('INFO', 'Motion Specialist worker started.');
  } catch (e) {
    structuredLog('ERROR', 'Failed to start Motion Specialist worker.', { error: e });
  }
}

function processWithMotionWorker(frameData, width, height) {
  return new Promise(resolve => {
    if (!motionWorker) return resolve({ movingRegions: [] });

    const messageHandler = (event) => {
      const data = event.detail;
      if (data.type === 'motion') {
        motionWorker.removeEventListener('motionResult', messageHandler);
        const { coordsBuffer, intensBuffer, count } = data;
        const coords = new Uint16Array(coordsBuffer);
        const intens = new Uint8Array(intensBuffer);
        const movingRegions = [];
        for (let i = 0; i < count; i++) {
          movingRegions.push({ x: coords[i * 2], y: coords[i * 2 + 1], intensity: intens[i] });
        }
        resolve({ movingRegions });
      }
    };
    motionWorker.addEventListener('motionResult', messageHandler);

    const yBuf = rgbaToY(frameData, width, height);
    motionWorker.postMessage({
      type: 'frame', yBuffer: yBuf.buffer, w: width, h: height,
      threshold: _config.motionThreshold
    }, [yBuf.buffer]);
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

  try {
    const { videoElement, engine } = config;
    if (!videoElement || !videoElement.srcObject) {
      throw new Error("Video element or srcObject is not available.");
    }
    
    structuredLog('DEBUG', 'initializeVideo: Video element validated', { 
      hasVideoElement: !!videoElement, 
      hasSrcObject: !!videoElement.srcObject,
      videoWidth: videoElement.videoWidth,
      videoHeight: videoElement.videoHeight 
    });
    
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
      if (type === 'frame') {
        const state = engine.getState();
        const frameData = new Uint8ClampedArray(payload.imageDataBuffer);
        let results = {};

        if (state.currentMode === 'flow') {
          results = await processWithMotionWorker(frameData, payload.width, payload.height);
        } else if (state.currentMode === 'focus') {
          const [motion] = await Promise.all([
             processWithMotionWorker(frameData, payload.width, payload.height),
             // processWithDepthWorker(...) when ready
          ]);
          results = { ...motion };
        }
        
        results.frameId = payload.frameId;
        results.startTime = payload.startTime;
        
        const grid = _config.getCurrentGrid();
        if (grid && grid.mapFunction) {
          const gridOutput = grid.mapFunction(frameData, payload.width, payload.height, null, results);
          if (gridOutput && gridOutput.cues && gridOutput.cues.length > 0) {
            engine.dispatch('audioCuesReady', {
              cues: gridOutput.cues,
              frameId: payload.frameId,
              startTime: payload.startTime
            });
          }
        }
      } else if (type === 'ready') {
        structuredLog('INFO', 'Frame provider worker is ready');
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

  } catch (e) {
    structuredLog('ERROR', 'Failed to initialize video pipeline.', { error: e.message, stack: e.stack });
    throw e;
  }
}