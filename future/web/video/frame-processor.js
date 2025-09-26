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

  startMotionWorker();
  // startDepthWorker(); // etc.

  try {
    const { videoElement, engine } = config;
    if (!videoElement || !videoElement.srcObject) {
      throw new Error("Video element or srcObject is not available.");
    }
    
    if (!('transferControlToOffscreen' in HTMLCanvasElement.prototype) || typeof MediaStreamTrackProcessor === 'undefined') {
      throw new Error('Required browser APIs (OffscreenCanvas, MediaStreamTrackProcessor) are not supported.');
    }
    
    frameProviderWorker = new Worker(new URL('./workers/frame-provider-worker.js', import.meta.url), { type: 'module' });
    if (_config.registerWorker) _config.registerWorker(frameProviderWorker, 'FrameProvider');

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const offscreenCanvas = canvas.transferControlToOffscreen();
    
    const [track] = videoElement.srcObject.getVideoTracks();
    const trackProcessor = new MediaStreamTrackProcessor({ track });
    const streamReader = trackProcessor.readable;

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

  } catch (e) {
    structuredLog('ERROR', 'Failed to initialize video pipeline.', { error: e });
    throw e;
  }
}