// File: web/core/frame-processor.js
import { settings } from "./state.js";
import { dispatchEvent } from "./dispatcher.js";
import { structuredLog } from "../utils/logging.js";

// Module-level state for tracking previous frame data for motion detection
let prevFrameDataLeft = null;
let prevFrameDataRight = null;

export async function mapFrameToNotes(frameData, width, height) {
  // Guard against invalid dimensions or missing frame data
  if (!frameData || width <= 0 || height <= 0) {
    structuredLog('WARN', 'mapFrameToNotes: Invalid frame data or dimensions, skipping.', { width, height, hasFrameData: !!frameData });
    return { notes: [], avgIntensity: 0 };
  }
  
  try {
    // Use cached grids loaded at startup
    const availableGrids = settings.availableGrids;
    const grid = availableGrids.find((g) => g.id === settings.gridType);
    if (!grid) {
      console.error(`Grid not found: ${settings.gridType}`);
      dispatchEvent("logError", { message: `Grid not found: ${settings.gridType}` });
      return { notes: [], avgIntensity: 0 };
    }
    const gridModule = await import(`../synthesis-grids/${grid.id}.js`);
    const mapFunction = gridModule[`mapFrameTo${grid.id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')}`];
    if (!mapFunction) {
      console.error(`Map function for ${grid.id} not found`);
      dispatchEvent("logError", { message: `Map function for ${grid.id} not found` });
      return { notes: [], avgIntensity: 0 };
    }
    // Determine split buffers and copy full RGBA pixels
    const halfWidth = Math.floor(width / 2);
    const frameSize = halfWidth * height * 4;
    const leftFrameData = new Uint8ClampedArray(frameSize);
    const rightFrameData = new Uint8ClampedArray(frameSize);

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < halfWidth; x++) {
        const fullIdx = (y * width + x) * 4;
        const halfIdx = (y * halfWidth + x) * 4;
        // Copy left RGBA
        leftFrameData.set(frameData.subarray(fullIdx, fullIdx + 4), halfIdx);
        // Copy right RGBA
        const fullIdxR = (y * width + x + halfWidth) * 4;
        rightFrameData.set(frameData.subarray(fullIdxR, fullIdxR + 4), halfIdx);
      }
    }
    // Pass module-level state to the mapping function
    const leftResult = mapFunction(leftFrameData, halfWidth, height, prevFrameDataLeft, -1);
    const rightResult = mapFunction(rightFrameData, halfWidth, height, prevFrameDataRight, 1);
    
    // Update module-level state for the next frame
    prevFrameDataLeft = leftResult.newFrameData;
    prevFrameDataRight = rightResult.newFrameData;

    const allNotes = [...(leftResult.notes || []), ...(rightResult.notes || [])];
    const avgIntensity = (leftResult.avgIntensity + rightResult.avgIntensity) / 2;

    return {
      notes: allNotes,
      avgIntensity,
    };
  } catch (err) {
    console.error("mapFrameToNotes error:", err.message);
    dispatchEvent("logError", { message: `Frame mapping error: ${err.message}` });
    // Reset state on error to prevent cascading issues
    prevFrameDataLeft = null;
    prevFrameDataRight = null;
    return { notes: [], avgIntensity: 0 };
  }
}

// Expose mapFrameToNotes as processFrame for dispatcher
export { mapFrameToNotes as processFrame };

/** Cleanup function for frame processor */
export async function cleanupFrameProcessor() {
  try {
    structuredLog('INFO', 'cleanupFrameProcessor: Resetting frame processor state');
    // Reset module-level state
    prevFrameDataLeft = null;
    prevFrameDataRight = null;
  } catch (err) {
    structuredLog('ERROR', 'cleanupFrameProcessor error', { message: err.message });
    dispatchEvent('logError', { message: `Frame processor cleanup error: ${err.message}` });
  }
}