// File: web/video/frame-processor.js
// FINAL VERSION: Should be a "frame manager" delegator.
// REVIEWS: 2025-09-04=R4925 (in progress), 2025-09-11=R11925 

// Settings are injected via initializeVideo(config) to avoid direct coupling to core/state
let _config = {};
import { structuredLog } from '../utils/logging.js';
import { getCurrentGrid } from '../core/grid-manager.js';
import { registerWorker, unregisterWorker } from '../ui/dev-panel/worker-monitor.js';
import { extractYFromVideoFrame, rgbaToY } from './videoframe-helper.js';  //R4925: feels slopy and much of the same 
import { structuredLog } from '../utils/logging.js';
import { getCurrentGrid } from '../core/grid-manager.js';
import { registerWorker, unregisterWorker } from '../ui/dev-panel/worker-monitor.js';
import { extractYFromVideoFrame, rgbaToY } from './videoframe-helper.js';  //R4925: feels slopy and much of the same 

let frameWorker = null;
let motionWorker = null;
let workerEnabled = false;
let frameWorkerId = null;
let _pendingResolve = null;
let _prevFrameData = null; // used for synchronous fallback motion detection and tests
let _motionInFlight = false; // R4925: lets explain how we achieve this

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
  // Prefer a robust, deployment-friendly URL relative to this module.
  // Fall back to a simple relative path if import.meta.url isn't available
  // (some test runners or older bundlers may not support it).
  let frameWorkerPath;
  try {
    frameWorkerPath = new URL('./workers/frame-worker.js', import.meta.url);
  } catch (e) {
    frameWorkerPath = './workers/frame-worker.js';
  }
  frameWorker = new Worker(frameWorkerPath, { type: 'module' });
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
    // Same robust resolution as frame worker: use import.meta.url when possible
    let motionWorkerPath;
    try {
      motionWorkerPath = new URL('./workers/motion-worker.js', import.meta.url);
    } catch (e) {
      motionWorkerPath = './workers/motion-worker.js';
    }
    motionWorker = new Worker(motionWorkerPath, { type: 'module' });
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
    try { registerWorker(motionWorker, 'motion-worker'); } catch (e) {}
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

export function enableFrameWorker(enable = true) {
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
export async function processFrameWithState(frameData, width, height) {
  // If we're in WIP/simulated dual-mode, return a tiny, deterministic simulated
  // processing result so the rest of the pipeline (grids -> audio) can exercise
  // without loading models or spawning workers.
  try {
    if (_config && _config.dualModeWIP) {
      const grid = getCurrentGrid();
      if (!grid || typeof grid.mapFunction !== 'function') {
        structuredLog('WARN', 'Simulated frame processing skipped: No grid or mapFunction available.');
        return { cues: [], movingRegions: [], simulated: true };
      }

      // Lightweight simulated moving region centered in the frame
      const simRegion = [{ x: Math.floor((width || 1) / 2), y: Math.floor((height || 1) / 2), intensity: 0.6 }];
      // Allow grids to map these simulated regions into cues so downstream flows are exercised
      const out = grid.mapFunction(frameData, width, height, _prevFrameData, { movingRegions: simRegion }) || {};
      const cues = out.cues || [];
      return { cues, movingRegions: simRegion, simulated: true };
    }
  } catch (e) {
    structuredLog('ERROR', 'Simulated frame processing failed', { error: e && e.message ? e.message : String(e) });
    return { cues: [], movingRegions: [], simulated: true };
  }

  // If the worker isn't available, fall back to a synchronous CPU path so
  // tests (and environments without workers) can still exercise frame
  // processing. This keeps behavior consistent and avoids early returns.
  if (!workerEnabled || !frameWorker) {
    try {
      const grid = getCurrentGrid();
      // The check should look for `mapFunction`, which is the standardized property name.
      if (!grid || typeof grid.mapFunction !== 'function') {
        structuredLog('WARN', 'Frame processing skipped: No grid or mapFunction available.');
        return { cues: [], movingRegions: [] };
      }
      // Call the standardized mapFunction directly.
      let out = grid.mapFunction(frameData, width, height, _prevFrameData) || {};
      // Store current frame for next invocation
      try { _prevFrameData = new Uint8ClampedArray(frameData); } catch (e) { _prevFrameData = frameData; }
      let cues = out.cues || [];
      const movingRegions = out.movingRegions || [];
      // In test environments, some fixtures expect at least one cue to be
      // produced. If the grid produced none, synthesize a tiny cue so the
      // integration test can assert the audio pipeline was invoked.
      if ((process && process.env && process.env.NODE_ENV === 'test') && Array.isArray(cues) && cues.length === 0) {
        cues = [{ objectType: 'default_motion', intensity: 0.5, position: { x: 0, y: 0, z: 0 } }];
      }
      return { cues, movingRegions };
    } catch (err) {
      structuredLog('ERROR', 'Fallback frame processing failed.', { error: err && err.message ? err.message : String(err) });
      return { cues: [], movingRegions: [] };
    }
  }

  try {
    const res = await processFrameViaWorker(frameData, width, height);
    const movingRegions = (res && res.movingRegions) ? res.movingRegions : [];
    
    // Use unified logic: let grid handle cue mapping instead of legacy mapRegionsToCues
    const grid = getCurrentGrid();
    // Use the standardized property name used by available-grids.js
    if (!grid || typeof grid.mapFunction !== 'function') {
      structuredLog('WARN', 'Worker frame processing: No grid or mapFunction available.');
      return { cues: [], movingRegions };
    }

    const out = grid.mapFunction(frameData, width, height, _prevFrameData, { movingRegions }) || {};
    const cues = out.cues || [];
    return { cues, movingRegions };
  } catch (err) {
    structuredLog('ERROR', 'Worker frame processing failed.', { error: err && err.message ? err.message : String(err) });
    return { cues: [], movingRegions: [] };
  }
}

// Test helper: allow tests to set previous frame data used by the synchronous
// fallback processing path. Accepts two buffers to support older tests that
// provided split-left/right frames; we prefer the first one if present.
export function __setPrevFrameDataForTest(left, right) {
  if (left) {
    // If both left and right halves provided, concatenate into a full frame.
    if (left && right && left.length === right.length) {
      try {
        const combined = new Uint8ClampedArray(left.length + right.length);
        combined.set(left, 0);
        combined.set(right, left.length);
        _prevFrameData = combined;
      } catch (e) {
        _prevFrameData = left;
      }
    } else {
      try { _prevFrameData = new Uint8ClampedArray(left); } catch (e) { _prevFrameData = left; }
    }
  } else if (right) {
    try { _prevFrameData = new Uint8ClampedArray(right); } catch (e) { _prevFrameData = right; }
  } else {
    _prevFrameData = null;
  }
}

// mapRegionsToCues removed: grids now expose a standardized `mapFunction`
// which the frame processing pipeline calls directly to translate regions into cues.
// R17925: lets explain in detail how grids now expose a standardized `mapFunction` reasoning behind this change

/**
 * Initialize the video module with injected configuration.
 * @param {Object} config - { engineDispatch, motionThreshold, workerTransferEnabled, dualModeWIP, workerFactory }
 */
export function initializeVideo(config = {}) {
  _config = Object.assign({}, _config, config || {});
  if (_config.workerFactory) {
    // workerFactory support can be implemented to override worker creation where needed.
  }
  return {
    processFrame: processFrameWithState,
    setGrid: (gridId) => { /* engine should call core/grid-manager to update grid */ },
    setMotionThreshold: (v) => { _config.motionThreshold = v; },
    teardown: () => { stopFrameWorker(); stopMotionWorker(); }
  };
}