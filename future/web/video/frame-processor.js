// File: web/video/frame-processor.js
// Final version incorporating all performance and safety optimizations.

import { settings } from '../core/state.js';
import { structuredLog } from '../utils/logging.js';
import { getCurrentGrid } from '../core/grid-manager.js';

let lastFrameData = null;
let regionCounter = 0;

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
    lastFrameData = new Uint8ClampedArray(frameData);
    return { cues: [], movingRegions: [] };
  }

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