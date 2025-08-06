import { settings } from "../core/state.js";
import { dispatchEvent } from "../core/dispatcher.js";
import { structuredLog } from "../utils/logging.js";

// Module-level state for stateful wrapper
let prevFrameDataLeft = null;
let prevFrameDataRight = null;

export async function mapFrameToNotes(frameData, width, height, prevLeft, prevRight) {
  try {
    // Guard against invalid dimensions
    if (!width || !height || width <= 0 || height <= 0) {
      structuredLog('ERROR', 'Invalid dimensions for frame processing', { width, height });
      dispatchEvent("logError", { message: `Invalid dimensions for frame processing: ${width}x${height}` });
      // Reset state on dimension error if configured
      if (settings.resetStateOnError) {
        return { notes: [], prevFrameDataLeft: null, prevFrameDataRight: null, avgIntensity: 0 };
      }
      return { notes: [], prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight, avgIntensity: 0 };
    }

    // Validate frameData
    if (!frameData || !(frameData instanceof Uint8ClampedArray) || frameData.length < width * height * 4) {
      structuredLog('ERROR', 'Invalid frameData for processing', { frameDataLength: frameData?.length || 0 });
      dispatchEvent("logError", { message: `Invalid frameData: length ${frameData?.length || 0}` });
      if (settings.resetStateOnError) {
        return { notes: [], prevFrameDataLeft: null, prevFrameDataRight: null, avgIntensity: 0 };
      }
      return { notes: [], prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight, avgIntensity: 0 };
    }
    // New: Initial frame prev data check
    if (!prevLeft || !prevRight) {
      structuredLog('INFO', 'mapFrameToNotes: Initial frame, no prev data', { width, height });
    }

    // Use cached grids loaded at startup
    const availableGrids = settings.availableGrids;
    const grid = availableGrids.find((g) => g.id === settings.gridType);
    if (!grid) {
      console.error(`Grid not found: ${settings.gridType}`);
      dispatchEvent("logError", { message: `Grid not found: ${settings.gridType}` });
      return { notes: [], prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight, avgIntensity: 0 };
    }
    const gridModule = await import(`../synthesis-grids/${grid.id}.js`);
    const mapFunction = gridModule[`mapFrameTo${grid.id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')}`];
    if (!mapFunction) {
      console.error(`Map function for ${grid.id} not found`);
      dispatchEvent("logError", { message: `Map function for ${grid.id} not found` });
      return { notes: [], prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight, avgIntensity: 0 };
    }

    // Determine split buffers and copy full RGBA pixels
    const halfWidth = Math.floor(width / 2);
    const frameSize = halfWidth * height * 4;
    const leftFrameData = new Uint8ClampedArray(frameSize);
    const rightFrameData = new Uint8ClampedArray(frameSize);

    // TODO: Optimize with buffer pooling or single-pass copy if performance becomes an issue
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

    const leftResult = mapFunction(leftFrameData, halfWidth, height, prevLeft, -1);
    const rightResult = mapFunction(rightFrameData, halfWidth, height, prevRight, 1);
    const allNotes = [...(leftResult.notes || []), ...(rightResult.notes || [])];

    // Compute average intensity across both frames
    const avgIntensity = ((leftResult.avgIntensity || 0) + (rightResult.avgIntensity || 0)) / 2;

    return {
      notes: allNotes,
      prevFrameDataLeft: leftResult.newFrameData,
      prevFrameDataRight: rightResult.newFrameData,
      avgIntensity
    };
  } catch (err) {
    console.error("mapFrameToNotes error:", err.message);
    dispatchEvent("logError", { message: `Frame mapping error: ${err.message}` });
    if (settings.resetStateOnError) {
      return { notes: [], prevFrameDataLeft: null, prevFrameDataRight: null, avgIntensity: 0 };
    }
    return { notes: [], prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight, avgIntensity: 0 };
  }
}

// Stateful wrapper for dispatcher integration
export async function processFrameWithState(frameData, width, height) {
  // New: Validate frameData variance
  let hasVariance = false;
  let sampleSum = 0;
  for (let i = 0; i < Math.min(1000, frameData.length); i += 4) {
    const intensity = (frameData[i] + frameData[i+1] + frameData[i+2]) / 3;
    sampleSum += intensity;
    if (intensity > 0) hasVariance = true;
  }
  if (!hasVariance) {
    structuredLog('WARN', 'processFrame: No variance in frame data', { sampleAvg: sampleSum / 250 });
    return { notes: [], avgIntensity: 0 };
  }

  const result = await mapFrameToNotes(frameData, width, height, prevFrameDataLeft, prevFrameDataRight);
  prevFrameDataLeft = result.prevFrameDataLeft;
  prevFrameDataRight = result.prevFrameDataRight;
  return result;
}

// Expose mapFrameToNotes as processFrame for backward compatibility
export { mapFrameToNotes as processFrame };

/** Cleanup function for frame processor */
export async function cleanupFrameProcessor() {
  try {
    structuredLog('INFO', 'cleanupFrameProcessor: Resetting frame processor state');
    prevFrameDataLeft = null;
    prevFrameDataRight = null;
    return { prevFrameDataLeft: null, prevFrameDataRight: null };
  } catch (err) {
    structuredLog('ERROR', 'cleanupFrameProcessor error', { message: err.message });
    dispatchEvent('logError', { message: `Frame processor cleanup error: ${err.message}` });
    prevFrameDataLeft = null;
    prevFrameDataRight = null;
    return { prevFrameDataLeft: null, prevFrameDataRight: null };
  }
}