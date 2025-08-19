// File: web/video/frame-processor.js


import { settings } from '../core/state.js';
import { structuredLog } from '../utils/logging.js';
import { getCurrentGrid } from '../core/grid-manager.js';

let lastFrameData = null;
let regionCounter = 0; // To assign unique IDs to regions

export async function processFrameWithState(frameData, width, height) {
  if (!lastFrameData) {
    lastFrameData = new Uint8ClampedArray(frameData);
    return { cues: [], movingRegions: [] };
  }


  const movingRegions = [];
  const visited = new Array(width * height).fill(false);
  const { motionThreshold } = settings;

  const MIN_REGION_SIZE = 10; 
  const SIZE_BONUS_FACTOR = 1.5; 

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x);
      const pixelIndex = i * 4;
      if (visited[i]) continue;

      // Simple grayscale 
      const currentGray = (frameData[pixelIndex] + frameData[pixelIndex + 1] + frameData[pixelIndex + 2]) / 3;
      const lastGray = (lastFrameData[pixelIndex] + lastFrameData[pixelIndex + 1] + lastFrameData[pixelIndex + 2]) / 3;
      const diff = Math.abs(currentGray - lastGray);

      if (diff > motionThreshold / 2) { 
        const region = floodFill(x, y, width, height, frameData, lastFrameData, visited);

        if (region.size > MIN_REGION_SIZE) {
       
          const sizeBonus = 1.0 + (Math.log(region.size) * SIZE_BONUS_FACTOR);
          
          const effectiveIntensity = region.avgIntensity * sizeBonus;

          if (effectiveIntensity > motionThreshold) {
            movingRegions.push({
              id: region.id,
              x: region.avgX / region.size,
              y: region.avgY / region.size,
              intensity: Math.min(1.0, (region.avgIntensity / 255.0) * 2.0), // Normalize intensity
              size: region.size,
            });
          }
        }
      }
    }
  }

  lastFrameData.set(frameData);
  const cues = mapRegionsToCues(movingRegions, width, height);

  return { cues, movingRegions };
}

function floodFill(startX, startY, width, height, frameData, lastFrameData, visited) {
  const stack = [[startX, startY]];
  const region = {
    id: regionCounter++, // Assign a unique, incrementing ID
    size: 0,
    avgX: 0,
    avgY: 0,
    totalIntensity: 0,
    avgIntensity: 0,
  };
  const motionThreshold = settings.motionThreshold;

  while (stack.length > 0) {
    const [x, y] = stack.pop();
    const i = y * width + x;
    const pixelIndex = i * 4;

    if (x < 0 || x >= width || y < 0 || y >= height || visited[i]) {
      continue;
    }

    const currentGray = (frameData[pixelIndex] + frameData[pixelIndex + 1] + frameData[pixelIndex + 2]) / 3;
    const lastGray = (lastFrameData[pixelIndex] + lastFrameData[pixelIndex + 1] + lastFrameData[pixelIndex + 2]) / 3;
    const diff = Math.abs(currentGray - lastGray);

    if (diff > motionThreshold / 2) {
      visited[i] = true;
      region.size++;
      region.avgX += x;
      region.avgY += y;
      region.totalIntensity += diff;

      // Add neighbors to the stack
      stack.push([x + 1, y]);
      stack.push([x - 1, y]);
      stack.push([x, y + 1]);
      stack.push([x, y - 1]);
    }
  }
  
  if (region.size > 0) {
    region.avgIntensity = region.totalIntensity / region.size;
  }

  // Reset counter if it gets too large to prevent overflow issues
  if (regionCounter > 1000000) {
      regionCounter = 0;
  }

  return region;
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
        pan: (normalizedX * 2) - 1, // Pan from -1 (left) to 1 (right)
        intensity: region.intensity,
      };
    }
    return null;
  }).filter(Boolean); // Filter out null notes
}