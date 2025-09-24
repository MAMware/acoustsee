// File: web/video/frame-processor.js
// FINAL VERSION: Should be a "frame manager" delegator.
// REVIEWS: 2025-09-04=R4925 (in progress), 2025-09-11=R11925 

// Settings are injected via initializeVideo(config) to avoid direct coupling to core/state
let _config = {};
// Capture a fallback import meta url when available (most bundlers expose import.meta.url)
// Note: do NOT reference `import.meta` at module top-level — many test runners
// (Jest in CJS mode) cannot parse it. Tests or bundlers can inject a value via
// initializeVideo({ importMetaUrl: '...' }) if needed.
let importMetaUrl = undefined;
import { structuredLog } from '../utils/logging.js';
import { getCurrentGrid as defaultGetCurrentGrid } from '../core/grid-manager.js';
import { registerWorker as defaultRegisterWorker, unregisterWorker as defaultUnregisterWorker } from '../ui/dev-panel/worker-monitor.js';
import { extractYFromVideoFrame, rgbaToY } from './videoframe-helper.js';  //R4925: feels slopy and much of the same 
import { getDispatchEvent } from '../core/context.js';

let frameWorker = null;
let motionWorker = null;
let workerEnabled = false;
let frameWorkerId = null;
let _pendingResolve = null;
let _prevFrameData = null; // used for synchronous fallback motion detection and tests
let _motionInFlight = false; // R4925: lets explain how we achieve this
// Allow these helpers to be injected via initializeVideo for testability / isolation
let _getCurrentGrid = defaultGetCurrentGrid;
let _registerWorker = defaultRegisterWorker;
let _unregisterWorker = defaultUnregisterWorker;

let frameProviderWorker = null;

// --- Worker Lifecycle Management ---
function startFrameWorker() {
  // Respect the dual-mode WIP guard: do not spawn heavy workers while the
  // prototype is marked WIP. This prevents accidental heavy CPU usage during
  // testing and lets the UI stay responsive.
  try {
    if (_config && _config.dualModeWIP) {
      structuredLog('WARN', 'startFrameWorker skipped: dualModeWIP enabled (ARCH-3)');
      return null;
    }
  } catch (e) { /* ignore guard check errors and continue to start worker */ }
  if (frameWorker) return frameWorker;
  try {
  // Prefer using an injected Worker constructor (for tests) and an injected
  // base URL for worker assets. This avoids using import.meta at module load
  // time which is not supported in some test runners.
  const WorkerCtor = _config && _config.WorkerCtor ? _config.WorkerCtor : (typeof Worker !== 'undefined' ? Worker : null);
  // Build a small prioritized list of candidate worker URLs to try. This
  // improves robustness when hosting setups rewrite paths or when import.meta
  // is unavailable in runtime environments.
  const candidates = [];
  try {
    if (_config && _config.workerBaseUrl) candidates.push(new URL('./workers/frame-worker.js', _config.workerBaseUrl).href);
  } catch (e) {}
  try { if (typeof importMetaUrl !== 'undefined' && importMetaUrl) candidates.push(new URL('./workers/frame-worker.js', importMetaUrl).href); } catch (e) {}
  // Root-relative and repo-relative fallbacks. Prefer constructing absolute
  // URLs from a reasonable runtime anchor (`_config.workerBaseUrl`,
  // importMetaUrl, or document.baseURI) rather than hard-coding leading
  // '/' which will break when hosted under a subpath.
  try {
    // If a workerBaseUrl is configured, construct relative to it
    if (_config && _config.workerBaseUrl) candidates.push(new URL('./workers/frame-worker.js', _config.workerBaseUrl).href);
  } catch (e) {}
  try { if (typeof importMetaUrl !== 'undefined' && importMetaUrl) candidates.push(new URL('./workers/frame-worker.js', importMetaUrl).href); } catch (e) {}
  try { if (typeof document !== 'undefined' && document.baseURI) candidates.push(new URL('./video/workers/frame-worker.js', document.baseURI).href); } catch (e) {}
  candidates.push('./video/workers/frame-worker.js');
  candidates.push('./workers/frame-worker.js');
  let frameWorkerPath = null;
  if (!WorkerCtor) throw new Error('No Worker constructor available');
  // Try candidates until one successfully constructs a Worker. This avoids
  // hard 404s when a hosting environment serves an HTML fallback for unknown
  // paths.
  let lastErr = null;
  for (let i = 0; i < candidates.length; i++) {
    const p = candidates[i];
    try {
      frameWorker = new WorkerCtor(p, { type: 'module' });
      frameWorkerPath = p;
      break;
    } catch (e) {
      lastErr = e;
      // continue to next candidate
    }
  }
  if (!frameWorker) {
    // As a last-ditch attempt, throw the last error so the caller can log.
    throw lastErr || new Error('Failed to construct Frame Worker from any candidate path');
  }
    frameWorker.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'result' && _pendingResolve) {
        _pendingResolve(msg.result);
        _pendingResolve = null;
      }
    };
    frameWorker.onerror = (e) => {
      structuredLog('ERROR', 'frameWorker error', e.message || e);
    };
  try { frameWorkerId = registerWorker(frameWorker, 'frame-worker'); } catch (e) { frameWorkerId = null; }
  try { frameWorkerId = (_registerWorker ? _registerWorker(frameWorker, 'frame-worker') : null); } catch (e) { frameWorkerId = null; }
  workerEnabled = true;
    return frameWorker;
  } catch (e) {
    structuredLog('WARN', 'startFrameWorker failed', e);
    frameWorker = null;
    workerEnabled = false;
    return null;
  }
}

function startMotionWorker() {
  // Respect the dual-mode WIP guard: avoid starting the motion worker when in simulated WIP mode.
  try {
    if (_config && _config.dualModeWIP) {
      structuredLog('WARN', 'startMotionWorker skipped: dualModeWIP enabled (ARCH-3)');
      return null;
    }
  } catch (e) { /* ignore guard check errors and continue to start worker */ }
  if (motionWorker) return motionWorker;
  try {
    // Resolve worker path using injected base URL or importMetaUrl if provided.
    const WorkerCtor = _config && _config.WorkerCtor ? _config.WorkerCtor : (typeof Worker !== 'undefined' ? Worker : null);
    const candidates = [];
    try {
      if (_config && _config.workerBaseUrl) candidates.push(new URL('./workers/motion-worker.js', _config.workerBaseUrl).href);
    } catch (e) {}
    try { if (importMetaUrl) candidates.push(new URL('./workers/motion-worker.js', importMetaUrl).href); } catch (e) {}
    try {
      if (_config && _config.workerBaseUrl) candidates.push(new URL('./workers/motion-worker.js', _config.workerBaseUrl).href);
    } catch (e) {}
    try { if (importMetaUrl) candidates.push(new URL('./workers/motion-worker.js', importMetaUrl).href); } catch (e) {}
    try { if (typeof document !== 'undefined' && document.baseURI) candidates.push(new URL('./video/workers/motion-worker.js', document.baseURI).href); } catch (e) {}
    candidates.push('./video/workers/motion-worker.js');
    candidates.push('./workers/motion-worker.js');
    let motionWorkerPath = null;
    if (!WorkerCtor) throw new Error('No Worker constructor available');
    let lastErr = null;
    for (let i = 0; i < candidates.length; i++) {
      const p = candidates[i];
      try {
        motionWorker = new WorkerCtor(p, { type: 'module' });
        motionWorkerPath = p;
        break;
      } catch (e) {
        lastErr = e;
      }
    }
    if (!motionWorker) throw lastErr || new Error('Failed to construct Motion Worker from any candidate path');
  motionWorker.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'motion' && _pendingResolve) {
        // resolve pending frame promise with movingRegions constructed from flat buffers , R4925: How this allows us to efficiently process motion data without unnecessary overhead.
        try {
          const coords = new Uint16Array(msg.coordsBuffer || new ArrayBuffer(0));
          const ints = new Uint8Array(msg.intensBuffer || new ArrayBuffer(0));
          const regions = [];
          for (let i = 0; i < msg.count; i++) {
            regions.push({ x: coords[i * 2], y: coords[i * 2 + 1], intensity: ints[i] });
          }
          _pendingResolve({ movingRegions: regions });
          _pendingResolve = null;
          _motionInFlight = false;
        } catch (e) {
          _pendingResolve({ movingRegions: [] });
          _pendingResolve = null;
          _motionInFlight = false;
        }
      } else if (msg.type === 'ready') {
        structuredLog('INFO', 'motionWorker ready', { features: msg.features });
      }
    };
    motionWorker.onerror = (e) => { structuredLog('ERROR', 'motionWorker error', e.message || e); };
  try { if (_registerWorker) _registerWorker(motionWorker, 'motion-worker'); } catch (e) {}
    return motionWorker;
  } catch (e) {
    structuredLog('WARN', 'startMotionWorker failed', e);
    motionWorker = null;
    return null;
  }
}

function stopMotionWorker() {
  if (!motionWorker) return;
  try { motionWorker.terminate(); } catch (e) {}
  motionWorker = null;
}

function stopFrameWorker() {
  if (!frameWorker) return;
  try { frameWorker.terminate(); } catch (e) { /* ignore */ }
  try { if (frameWorkerId) unregisterWorker(frameWorkerId); } catch (e) {}
  frameWorker = null;
  workerEnabled = false;
}

export function enableFrameWorker(enable = true, config = {}) {
  // Merge any provided config (workerBaseUrl, WorkerCtor, etc.) into the
  // internal _config so the start*Worker functions can prefer injected values.
  try {
    if (config && typeof config === 'object') {
      _config = Object.assign({}, _config, config);
      if (config.workerBaseUrl) {
        // Normalize workerBaseUrl: allow passing a basePath that points at the
        // directory containing `video/` (main.js passes basePath + 'video/').
        try {
          // If a path ends with 'video/' allow constructing relative URLs from it
          _config.workerBaseUrl = config.workerBaseUrl;
        } catch (e) { /* ignore */ }
      }
    }
  } catch (e) {}
  if (enable) startFrameWorker();
  else stopFrameWorker();
}

export function enableMotionWorker(enable = true) {
  if (enable) startMotionWorker(); else stopMotionWorker();
}

export function shutdownFrameWorker() {
  stopFrameWorker();
}

export function enableWorkerTransfer(enable) {
  _config.workerTransferEnabled = !!enable;
  structuredLog('INFO', `Worker buffer transfer set to: ${_config.workerTransferEnabled}`);
}

// Process a frame by delegating to the worker. Returns a Promise that resolves
// to an object shaped like { movingRegions: [...] }.
function processFrameViaWorker(frameBuffer, width, height) {
  return new Promise((resolve, reject) => {
    try {
      const w = startFrameWorker();
      if (!w) return resolve({ movingRegions: [] });
      _pendingResolve = resolve;

  // Tiny debug: confirm what threshold we're sending
  try { console.debug('processFrameViaWorker -> motionThreshold', _config.motionThreshold); } catch (e) {}

      // Use the motion worker: extract Y plane and send minimal buffer
      try {
        const mw = startMotionWorker();
        if (!mw) {
          // fallback to old frame worker path
          if (_config.workerTransferEnabled && frameBuffer && frameBuffer.buffer) {
            const ab = frameBuffer.buffer;
            w.postMessage({ type: 'process', frameBuffer: ab, width, height, settings: { motionThreshold: _config.motionThreshold }, transferred: true }, [ab]);
          } else {
            w.postMessage({ type: 'process', frameBuffer, width, height, settings: { motionThreshold: _config.motionThreshold } }, [frameBuffer.buffer ? frameBuffer.buffer : frameBuffer]);
          }
          return;
        }

        // Avoid sending multiple frames concurrently to the motion worker
        if (_motionInFlight) return resolve({ movingRegions: [] });
        _motionInFlight = true;

        // frameBuffer may be an RGBA buffer; attempt to extract Y quickly on main thread
        let yBuf = null;
        try {
          // frameBuffer could be an ArrayBuffer or Uint8ClampedArray. Normalize.
          const arr = frameBuffer.buffer ? new Uint8ClampedArray(frameBuffer) : new Uint8ClampedArray(frameBuffer);
          yBuf = rgbaToY(arr, width, height);
        } catch (e) {
          // fallback: try to send raw buffer
          try { yBuf = new Uint8Array(frameBuffer.buffer || frameBuffer); } catch (e2) { yBuf = null; }
        }

        if (!yBuf) {
          // fallback to frame worker if Y extraction failed
          w.postMessage({ type: 'process', frameBuffer, width, height, settings: { motionThreshold: _config.motionThreshold } }, [frameBuffer.buffer ? frameBuffer.buffer : frameBuffer]);
          _motionInFlight = false;
          return;
        }

        // Send Y buffer as transferable
        _pendingResolve = resolve;
        try {
          mw.postMessage({ type: 'frame', ts: Date.now(), w: width, h: height, yBuffer: yBuf.buffer, step: 6, threshold: _config.motionThreshold }, [yBuf.buffer]);
        } catch (e) {
          // if posting fails, clear state and fallback
          _motionInFlight = false;
          _pendingResolve = null;
          resolve({ movingRegions: [] });
        }
        return;
      } catch (e) {
        // fallback to old behavior
        if (_config.workerTransferEnabled && frameBuffer && frameBuffer.buffer) {
          const ab = frameBuffer.buffer;
          w.postMessage({ type: 'process', frameBuffer: ab, width, height, settings: { motionThreshold: _config.motionThreshold }, transferred: true }, [ab]);
        } else {
          w.postMessage({ type: 'process', frameBuffer, width, height, settings: { motionThreshold: _config.motionThreshold } }, [frameBuffer.buffer ? frameBuffer.buffer : frameBuffer]);
        }
      }
    } catch (e) {
      resolve({ movingRegions: [] });
    }
  });
}


/**
 * The main coordinator for the video processing pipeline.
 *
 * This function is called by the engine's scheduler for each video frame. It orchestrates
 * the analysis of the frame, preferring to offload heavy work to a Web Worker. It then
 * uses the currently active "grid" module to map the analysis results into an array of
 * abstract `cues` that can be understood by the audio subsystem.
 *
 * @param {Uint8ClampedArray|ArrayBuffer} frameData - The raw pixel data of the video frame.
 * @param {number} width - The width of the video frame.
 * @param {number} height - The height of the video frame.
 * @returns {Promise<Object>} A promise that resolves to an object containing the processing
 *   results, primarily `{ cues: Array<Object>, movingRegions: Array<Object> }`.
 */

// Helper function to wrap worker communication in a Promise
function processWithMotionWorker(frameData, width, height) {
  return new Promise(resolve => {
    if (!motionWorker) return resolve({ movingRegions: [] });

    const messageHandler = (event) => {
      if (event.data.type === 'motion') {
        motionWorker.removeEventListener('message', messageHandler);
        // Reconstruct the regions from the worker's compact format
        const { coordsBuffer, intensBuffer, count } = event.data;
        const coords = new Uint16Array(coordsBuffer);
        const intens = new Uint8Array(intensBuffer);
        const movingRegions = [];
        for (let i = 0; i < count; i++) {
          movingRegions.push({ x: coords[i * 2], y: coords[i * 2 + 1], intensity: intens[i] });
        }
        resolve({ movingRegions });
      }
    };
    motionWorker.addEventListener('message', messageHandler);

    // Your existing `motion-worker.js` expects a Y-plane buffer. We can create it here.
    const yBuf = rgbaToY(frameData, width, height);
    motionWorker.postMessage({
      type: 'frame',
      yBuffer: yBuf.buffer,
      w: width, h: height,
      threshold: _config.motionThreshold
    }, [yBuf.buffer]);
  });
}

/**
 * Initialize the video module with injected configuration.
 * @param {Object} config - { engineDispatch, motionThreshold, workerTransferEnabled, dualModeWIP, workerFactory, videoElement, getEngineState, engineOnStateChange }
 */
export async function initializeVideo(config = {}) {
  _config = Object.assign({}, _config, config || {});
  // Allow tests to pass a Worker constructor or a base URL for worker files
  if (config && config.workerBaseUrl) _config.workerBaseUrl = config.workerBaseUrl;
  if (config && config.WorkerCtor) _config.WorkerCtor = config.WorkerCtor;
  // Provide importMetaUrl fallback if tests provided one
  if (config && config.importMetaUrl) importMetaUrl = config.importMetaUrl;
  // Allow injection of helper functions to avoid importing app-wide globals in tests
  if (config && typeof config.getCurrentGrid === 'function') _getCurrentGrid = config.getCurrentGrid;
  if (config && typeof config.registerWorker === 'function') _registerWorker = config.registerWorker;
  if (config && typeof config.unregisterWorker === 'function') _unregisterWorker = config.unregisterWorker;
  if (_config.workerFactory) {
    // workerFactory support can be implemented to override worker creation where needed.
  }

  // Start all potential specialist workers so they are ready.
  // Your existing logic for startMotionWorker() etc. is perfect here.
  startMotionWorker(); 
  // startDepthWorker(); // When ready
  // startObjectSegmentationWorker(); // When ready

  // --- Initialize the Frame Provider ---
  try {
    const videoElement = config.videoElement; // Assuming videoElement is passed in config
    if (!('transferControlToOffscreen' in HTMLCanvasElement.prototype)) {
      throw new Error('OffscreenCanvas not supported.');
    }
    
    frameProviderWorker = new Worker(new URL('./workers/frame-provider-worker.js', import.meta.url), { type: 'module' });
    if (_registerWorker) _registerWorker(frameProviderWorker, 'FrameProvider');

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const offscreenCanvas = canvas.transferControlToOffscreen();
    
    const [track] = videoElement.srcObject.getVideoTracks();
    const trackProcessor = new MediaStreamTrackProcessor({ track });
    const streamReader = trackProcessor.readable;

    frameProviderWorker.postMessage({
      type: 'init',
      payload: { canvas: offscreenCanvas, streamReader }
    }, [offscreenCanvas, streamReader]);

    // This is the new core logic loop.
    frameProviderWorker.onmessage = async (event) => {
      const { type, payload } = event.data;
      if (type === 'frame') {
        // We have a clean, transferable frame!
        // Now, orchestrate the work based on the current mode.
        const dispatch = getDispatchEvent();
        let state = {};
        if (dispatch) {
          // Assuming a way to query state; adjust if needed
          dispatch('getState', (s) => { state = s; });
        }
        const frameData = new Uint8ClampedArray(payload.imageDataBuffer);

        let results = {};
        if (state.currentMode === 'flow') {
          // In flow mode, we only need motion.
          results = await processWithMotionWorker(frameData, payload.width, payload.height);
        } else if (state.currentMode === 'focus') {
          // In focus mode, we might want motion, depth, and objects.
          const [motion, depth] = await Promise.all([
             processWithMotionWorker(frameData, payload.width, payload.height),
             // processWithDepthWorker(frameData, payload.width, payload.height) // Future
          ]);
          results = { ...motion, ...depth };
        }
        
        // Final step: Use the grid to map results to audio cues.
        const grid = _getCurrentGrid();
        if (grid && grid.mapFunction) {
          const { cues } = grid.mapFunction(frameData, payload.width, payload.height, null, results);
          if (cues && cues.length > 0) {
            if (dispatch) dispatch('audioCuesReady', { cues });
          }
        }
      }
    };

    // Hook into the engine's processing state to start/stop the provider
    const dispatch = getDispatchEvent();
    if (dispatch) {
      dispatch('onStateChange', (state) => {
        if (state.isProcessing) {
          frameProviderWorker.postMessage({ type: 'start' });
        } else {
          frameProviderWorker.postMessage({ type: 'stop' });
        }
      });
    }

  } catch (e) {
    structuredLog('ERROR', 'Failed to initialize Frame Provider pipeline.', { error: e });
  }

  return {
    processFrame: processFrameWithState,
    setGrid: (gridId) => { /* engine should call core/grid-manager to update grid */ },
    setMotionThreshold: (v) => { _config.motionThreshold = v; },
    teardown: () => { stopFrameWorker(); stopMotionWorker(); if (frameProviderWorker) frameProviderWorker.terminate(); }
  };
}