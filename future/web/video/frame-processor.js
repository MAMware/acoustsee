// File: web/video/frame-processor.js
// FINAL VERSION: Pure manager that delegates all detection work to the worker.

import { settings } from '../core/state.js';
import { structuredLog } from '../utils/logging.js';
import { getCurrentGrid } from '../core/grid-manager.js';

let frameWorker = null;
let workerEnabled = false;
let _pendingResolve = null;

// --- Worker Lifecycle Management ---
function startFrameWorker() {
  if (frameWorker) return frameWorker;
  try {
    frameWorker = new Worker(new URL('../workers/frame-worker.js', import.meta.url), { type: 'module' });
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
    workerEnabled = true;
    return frameWorker;
  } catch (e) {
    structuredLog('WARN', 'startFrameWorker failed', e);
    frameWorker = null;
    workerEnabled = false;
    return null;
  }
}

function stopFrameWorker() {
  if (!frameWorker) return;
  try { frameWorker.terminate(); } catch (e) { /* ignore */ }
  frameWorker = null;
  workerEnabled = false;
}

export function enableFrameWorker(enable = true) {
  if (enable) startFrameWorker();
  else stopFrameWorker();
}

export function shutdownFrameWorker() {
  stopFrameWorker();
}

export function enableWorkerTransfer(enable) {
  settings.workerTransferEnabled = !!enable;
  structuredLog('INFO', `Worker buffer transfer set to: ${settings.workerTransferEnabled}`);
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
      try { console.debug('processFrameViaWorker -> motionThreshold', settings.motionThreshold); } catch (e) {}

      // Use transfer when available to avoid copying large buffers
      try {
        if (settings.workerTransferEnabled && frameBuffer && frameBuffer.buffer) {
          const ab = frameBuffer.buffer;
          w.postMessage({ type: 'process', frameBuffer: ab, width, height, settings: { motionThreshold: settings.motionThreshold }, transferred: true }, [ab]);
        } else {
          w.postMessage({ type: 'process', frameBuffer, width, height, settings: { motionThreshold: settings.motionThreshold } }, [frameBuffer.buffer ? frameBuffer.buffer : frameBuffer]);
        }
      } catch (e) {
        // fallback: try without transfer
        w.postMessage({ type: 'process', frameBuffer, width, height, settings: { motionThreshold: settings.motionThreshold } });
      }
    } catch (e) {
      resolve({ movingRegions: [] });
    }
  });
}


export async function processFrameWithState(frameData, width, height) {
  if (!workerEnabled || !frameWorker) {
    structuredLog('WARN', 'Frame processing skipped: Worker not enabled.');
    return { cues: [], movingRegions: [] };
  }

  try {
    const res = await processFrameViaWorker(frameData, width, height);
    const movingRegions = (res && res.movingRegions) ? res.movingRegions : [];
    const cues = mapRegionsToCues(movingRegions, width, height);
    return { cues, movingRegions };
  } catch (err) {
    structuredLog('ERROR', 'Worker frame processing failed.', { error: err && err.message ? err.message : String(err) });
    return { cues: [], movingRegions: [] };
  }
}

function mapRegionsToCues(regions, width, height) {
  const grid = getCurrentGrid();
  if (!grid) {
    structuredLog('ERROR', 'mapRegionsToCues: Could not get current grid from manager.');
    return [];
  }

  return regions.map(region => {
    const normalizedX = region.x / width;
    const normalizedY = region.y / height;
    const note = grid.getNote(normalizedX, normalizedY);

    if (note) {
      return {
        id: region.id,
        type: 'default_motion',
        pitch: note.pitch,
        pan: (normalizedX * 2) - 1,
        intensity: region.intensity,
      };
    }
    return null;
  }).filter(Boolean);
}
 