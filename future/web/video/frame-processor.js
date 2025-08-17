import { settings } from "../core/state.js";
import { getDispatchEvent } from "../core/context.js";
import { structuredLog } from "../utils/logging.js";

// Module-level state for stateful wrapper
let prevFrameDataLeft = null;
let prevFrameDataRight = null;

export async function processFrameToCues(frameData, width, height, prevLeft, prevRight) {
  try {
    // Guard against invalid dimensions
    if (!width || !height || width <= 0 || height <= 0) {
      const errorType = 'invalidDimensions';
      structuredLog('ERROR', 'Invalid dimensions for frame processing', { width, height });
  try { const _d = getDispatchEvent(); if (typeof _d === 'function') _d("logError", { message: `Invalid dimensions for frame processing: ${width}x${height}` }); } catch (e) {}
      structuredLog('WARN', 'Frame error; state reset', { reset: settings.resetStateOnError, errorType });
      if (settings.resetStateOnError) {
        return { cues: [], prevFrameDataLeft: null, prevFrameDataRight: null };
      }
      return { cues: [], prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight };
    }

    // Validate frameData
    if (!frameData || !(frameData instanceof Uint8ClampedArray) || frameData.length < width * height * 4) {
      const errorType = 'invalidFrameDataTransient';
      structuredLog('ERROR', 'Invalid frameData for processing', { frameDataLength: frameData?.length || 0 });
  try { const _d = getDispatchEvent(); if (typeof _d === 'function') _d("logError", { message: `Invalid frameData: length ${frameData?.length || 0}` }); } catch (e) {}
  // Transient error: preserve previous state to avoid audio interruption
  structuredLog('WARN', 'Frame error; transient, preserving state', { reset: false, errorType });
  return { cues: [], prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight };
    }
    // New: Initial frame prev data check
    if (!prevLeft || !prevRight) {
      structuredLog('INFO', 'processFrameToCues: Initial frame, no prev data', { width, height });
    }

    // --- REFACTOR: Replace dynamic import with a simple, synchronous find ---
    const grid = settings.availableGrids.find((g) => g.id === settings.gridType);
    if (!grid || typeof grid.mapFunction !== 'function') {
  console.error(`Grid or mapFunction not found for gridType: ${settings.gridType}`);
  try { const _d = getDispatchEvent(); if (typeof _d === 'function') _d("logError", { message: `Grid not found: ${settings.gridType}` }); } catch (e) {}
  return { cues: [], prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight };
    }
  const mapFunction = grid.mapFunction; // Directly access the function, no 'await' needed.

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

    const leftResult = mapFunction(leftFrameData, halfWidth, height, prevLeft);
    const rightResult = mapFunction(rightFrameData, halfWidth, height, prevRight);
    const allCues = [...(leftResult.cues || []), ...(rightResult.cues || [])];

    return {
      cues: allCues,
      // The mapFunction no longer returns newFrameData, so we must manage it here.
      // For now, we will simply use the current frame data as the "previous" for the next tick.
      // A more advanced implementation might return the raw motion data.
      prevFrameDataLeft: leftFrameData,
      prevFrameDataRight: rightFrameData,
    };
  } catch (err) {
    const errorType = 'exception';
    console.error("processFrameToCues error:", err.message);
  try { const _d = getDispatchEvent(); if (typeof _d === 'function') _d("logError", { message: `Frame mapping error: ${err.message}` }); } catch (e) {}
    structuredLog('WARN', 'Frame error; state reset', { reset: settings.resetStateOnError, errorType });
    if (settings.resetStateOnError) {
      return { cues: [], prevFrameDataLeft: null, prevFrameDataRight: null };
    }
    return { cues: [], prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight };
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
    structuredLog('WARN', 'processFrame: No variance in frame data; preserving previous state', { sampleAvg: sampleSum / 250 });
    // Transient glitch: preserve previous frame data
    return { cues: [], prevFrameDataLeft, prevFrameDataRight };
  }
  const result = await processFrameToCues(frameData, width, height, prevFrameDataLeft, prevFrameDataRight);
  prevFrameDataLeft = result.prevFrameDataLeft;
  prevFrameDataRight = result.prevFrameDataRight;
  return result; // This now returns an object like { cues: [...] }
}

// Expose processFrameToCues as processFrame for backward compatibility
export { processFrameToCues as processFrame };

/** Cleanup function for frame processor */
export async function cleanupFrameProcessor() {
  try {
    structuredLog('INFO', 'cleanupFrameProcessor: Resetting frame processor state');
    prevFrameDataLeft = null;
    prevFrameDataRight = null;
    return { prevFrameDataLeft: null, prevFrameDataRight: null };
  } catch (err) {
    structuredLog('ERROR', 'cleanupFrameProcessor error', { message: err.message });
  try { const _d = getDispatchEvent(); if (typeof _d === 'function') _d('logError', { message: `Frame processor cleanup error: ${err.message}` }); } catch (e) {}
    prevFrameDataLeft = null;
    prevFrameDataRight = null;
    return { prevFrameDataLeft: null, prevFrameDataRight: null };
  }
}

// --- Test-only export for setting internal state ---
//if (process.env.NODE_ENV === 'test') {
  // Provide a CommonJS export so tests using require(...) can access it.
  // eslint-disable-next-line no-undef
 // module.exports.__setPrevFrameDataForTest = (left, right) => {
   // prevFrameDataLeft = left;
   // prevFrameDataRight = right;
  //};
//}
