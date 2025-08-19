// File: web/video/frame-processor.js
// Final version incorporating all performance and safety optimizations.

import { settings } from '../core/state.js';
import { structuredLog } from '../utils/logging.js';
import { getCurrentGrid } from '../core/grid-manager.js';

let lastFrameData = null;
let regionCounter = 0;
// Optional external buffer for reuse (can be set via state.allocateFrameBuffer)
let externalFrameBuffer = null;
// Worker instance and resolver for pending requests
let _worker = null;
let _workerPendingResolve = null;

function startFrameWorker() {
  if (_worker) return _worker;
  try {
    _worker = new Worker(new URL('../workers/frame-worker.js', import.meta.url), { type: 'module' });
    _worker.onmessage = (ev) => {
      const msg = ev.data || {};
      if (msg.type === 'result' && _workerPendingResolve) {
        _workerPendingResolve(msg.result);
        _workerPendingResolve = null;
      }
    };
    return _worker;
  } catch (e) {
    structuredLog('WARN', 'startFrameWorker failed', e);
    _worker = null;
    return null;
  }
}

function stopFrameWorker() {
  try {
    if (_worker) {
      try { _worker.terminate(); } catch (e) {}
      _worker = null;
    }
  } catch (e) {
    // ignore
  }
}

function processFrameViaWorker(frameBuffer, width, height) {
  return new Promise((resolve, reject) => {
    try {
      const w = startFrameWorker();
      if (!w) return resolve({ movingRegions: [] });
      _workerPendingResolve = (res) => resolve(res);
      // Transfer the buffer if possible
      try {
            if (settings.workerTransferEnabled && frameBuffer && frameBuffer.buffer) {
              // Transfer the underlying ArrayBuffer and then recreate a new
              // externalFrameBuffer for future reuse to avoid using a detached buffer.
              const ab = frameBuffer.buffer;
              w.postMessage({ type: 'process', frameBuffer: ab, width, height, motionThreshold: settings.motionThreshold, transferred: true }, [ab]);
              // Recreate a replacement external buffer for subsequent frames
              if (externalFrameBuffer && externalFrameBuffer.length === frameBuffer.length) {
                externalFrameBuffer = new Uint8ClampedArray(externalFrameBuffer.length);
              }
            } else {
              w.postMessage({ type: 'process', frameBuffer, width, height, motionThreshold: settings.motionThreshold }, [frameBuffer.buffer ? frameBuffer.buffer : frameBuffer]);
            }
      } catch (e) {
        // If transfer fails, post without transfer
            w.postMessage({ type: 'process', frameBuffer, width, height, motionThreshold: settings.motionThreshold });
      }
    } catch (e) {
      resolve({ movingRegions: [] });
    }
  });
}

// --- OPTIMIZED HELPER ---
function getGrayAt(frameArr, idx) {
  const base = idx * 4;
  if (base + 2 >= frameArr.length) return 0;
  return (frameArr[base] + frameArr[base + 1] + frameArr[base + 2]) / 3;
}

// --- ROBUST AND OPTIMIZED floodFill (from Agent, with thanks) ---
function floodFill(startX, startY, width, height, frameData, lastFrameData, visited) {
  const threshold = settings.motionThreshold / 2;
  const regionId = ++regionCounter;

  const maxStackSize = width * height;
  const stackX = new Int32Array(maxStackSize);
  const stackY = new Int32Array(maxStackSize);
  let sp = 0; // Stack Pointer

  // Initial push onto the stack
  stackX[sp] = startX;
  stackY[sp] = startY;
  sp++;

  let size = 0;
  let totalIntensityDiff = 0;
  let sumX = 0;
  let sumY = 0;

  while (sp > 0) {
    sp--;
    const x = stackX[sp];
    const y = stackY[sp];

    // Bounds check
    if (x < 0 || x >= width || y < 0 || y >= height) continue;

    const idx = y * width + x;
    // Already visited check
    if (visited[idx]) continue;
    
    // Mark as visited immediately to prevent re-processing from main loop or other branches
    visited[idx] = 1;

    const currentGray = getGrayAt(frameData, idx);
    const lastGray = getGrayAt(lastFrameData, idx);
    const diff = Math.abs(currentGray - lastGray);

    // If there's enough motion, add it to the region and explore its neighbors
    if (diff > threshold) {
      size++;
      totalIntensityDiff += diff;
      sumX += x;
      sumY += y;

      // Push neighbors with stack-capacity guard
      if (sp < maxStackSize - 4) { // Check space for 4 neighbors
          stackX[sp] = x + 1; stackY[sp] = y; sp++;
          stackX[sp] = x - 1; stackY[sp] = y; sp++;
          stackX[sp] = x;     stackY[sp] = y + 1; sp++;
          stackX[sp] = x;     stackY[sp] = y - 1; sp++;
      }
    }
  }

const maxRegionCounter = Math.max(1024, width * height);
  if (regionCounter > maxRegionCounter) regionCounter = 0;

  return { id: regionId, size, avgIntensity, avgX: sumX, avgY: sumY };
}


export async function processFrameWithState(frameData, width, height) {
  if (!lastFrameData) {
    lastFrameData = new Uint8ClampedArray(frameData.length);
  }
  // If enabled, prefer off-main-thread worker-based motion detection. The
  // worker returns moving pixel points; convert them directly into cues to
  // avoid expensive flood-fill work on the main thread.
  if (settings.enableFrameWorker && typeof processFrameViaWorker === 'function') {
    try {
      // Use externalFrameBuffer if provided and sized to avoid extra allocations
      const expectedLen = width * height * 4;
      let bufferToUse = frameData;
      if (externalFrameBuffer && externalFrameBuffer.length === expectedLen) {
        externalFrameBuffer.set(frameData);
        bufferToUse = externalFrameBuffer;
      }

      const res = await processFrameViaWorker(bufferToUse, width, height);
      const pts = (res && res.movingRegions) ? res.movingRegions : [];

      // Map worker points to cues using the active grid
      const grid = getCurrentGrid();
      const cues = [];
      const maxNotes = settings.maxNotes || 8;
      for (let i = 0; i < Math.min(pts.length, maxNotes); i++) {
        const p = pts[i];
        const normalizedX = (p.pixelX || 0) / width;
        const normalizedY = (p.pixelY || 0) / height;
        if (grid && typeof grid.getNote === 'function') {
          const note = grid.getNote(normalizedX, normalizedY);
          if (note) {
            cues.push({
              objectType: 'default_motion',
              intensity: Math.min(1, (p.intensity || 0) / 255),
              position: { x: normalizedX * 2 - 1, y: -((normalizedY * 2 - 1)), z: 0.0 },
            });
          }
        }
      }

      // Update prev buffer for main-thread fallback consistency
      try { lastFrameData.set(frameData); } catch (e) { /* ignore */ }
      return { cues, movingRegions: pts };
    } catch (e) {
      structuredLog('WARN', 'processFrameWithState worker path failed', e);
      // fall through to main-thread processing
    }
  }

  // Fallback: main-thread flood-fill based detection
  const movingRegions = [];
  const visited = new Uint8Array(width * height);
  const { motionThreshold } = settings;
  const MIN_REGION_SIZE = 10;
  const SIZE_BONUS_FACTOR = 1.5;

  // --- SIMPLIFIED MAIN LOOP ---
  // We iterate through every pixel. If it hasn't been visited yet by a previous
  // flood fill, we start a new one from here. The floodFill function itself
  // will handle marking all pixels it touches (both moving and non-moving) as visited.
  for (let i = 0; i < width * height; i++) {
    if (!visited[i]) {
      const x = i % width;
      const y = Math.floor(i / width);
      const region = floodFill(x, y, width, height, frameData, lastFrameData, visited);

      if (region.size > MIN_REGION_SIZE) {
        const sizeBonus = 1.0 + (Math.log(region.size) * SIZE_BONUS_FACTOR);
        const effectiveIntensity = region.avgIntensity * sizeBonus;

        if (effectiveIntensity > motionThreshold) {
          movingRegions.push({
            id: region.id,
            x: region.avgX / region.size,
            y: region.avgY / region.size,
            intensity: Math.min(1.0, (region.avgIntensity / 255.0) * 2.0),
            size: region.size,
          });
        }
      }
    }
  }

  lastFrameData.set(frameData);
  const cues = mapRegionsToCues(movingRegions, width, height);
  return { cues, movingRegions };
}

// Phase 2 helper: allow external modules to provide a reusable frame buffer
export function setExternalFrameBuffer(buf) {
  externalFrameBuffer = buf;
}

// Test/debug helper: explicitly set previous frame data (used in tests and worker migration)
export function setPrevFrameData(buf) {
  if (!buf) return;
  lastFrameData = new Uint8ClampedArray(buf);
}

// Expose worker controls
export function enableFrameWorker(enable = true) {
  settings.enableFrameWorker = !!enable;
  if (!enable) stopFrameWorker();
  else startFrameWorker();
}

export function shutdownFrameWorker() {
  stopFrameWorker();
}

export function enableWorkerTransfer(enable = true) {
  try { settings.workerTransferEnabled = !!enable; } catch (e) { /* ignore */ }
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