import { settings } from "../core/state.js";
import { getDispatchEvent } from "../core/context.js";
import { structuredLog } from "../utils/logging.js";

// Module-level state for stateful wrapper
let prevFrameData = null;

export async function processFrameToCues(frameData, width, height, prevData) {
  try {
    // Guard against invalid dimensions
    if (!width || !height || width <= 0 || height <= 0) {
      const errorType = 'invalidDimensions';
      structuredLog('ERROR', 'Invalid dimensions for frame processing', { width, height });
  try { const _d = getDispatchEvent(); if (typeof _d === 'function') _d("logError", { message: `Invalid dimensions for frame processing: ${width}x${height}` }); } catch (e) {}
      structuredLog('WARN', 'Frame error; state reset', { reset: settings.resetStateOnError, errorType });
      if (settings.resetStateOnError) {
        return { cues: [], prevFrameData: null };
      }
      return { cues: [], prevFrameData: prevData };
    }

    // Validate frameData
    if (!frameData || !(frameData instanceof Uint8ClampedArray) || frameData.length < width * height * 4) {
      const errorType = 'invalidFrameDataTransient';
      structuredLog('ERROR', 'Invalid frameData for processing', { frameDataLength: frameData?.length || 0 });
  try { const _d = getDispatchEvent(); if (typeof _d === 'function') _d("logError", { message: `Invalid frameData: length ${frameData?.length || 0}` }); } catch (e) {}
  // Transient error: preserve previous state to avoid audio interruption
  structuredLog('WARN', 'Frame error; transient, preserving state', { reset: false, errorType });
  return { cues: [], prevFrameData: prevData };
    }
    // New: Initial frame prev data check
    if (!prevData) {
      structuredLog('INFO', 'processFrameToCues: Initial frame, no prev data', { width, height });
    }

    // --- REFACTOR: Replace dynamic import with a simple, synchronous find ---
    const grid = settings.availableGrids.find((g) => g.id === settings.gridType);
    if (!grid || typeof grid.mapFunction !== 'function') {
  console.error(`Grid or mapFunction not found for gridType: ${settings.gridType}`);
  try { const _d = getDispatchEvent(); if (typeof _d === 'function') _d("logError", { message: `Grid not found: ${settings.gridType}` }); } catch (e) {}
  return { cues: [], prevFrameData: prevData };
    }
  const mapFunction = grid.mapFunction; // Directly access the function, no 'await' needed.

    // Mapping functions operate on the complete frame buffer (no left/right split).
    // This aligns with the Acoustic Horizon model: motion and depth cues are
    // computed across the continuous image and translated into prioritized acoustic
    // cues for the audio pipeline.
    const result = mapFunction(frameData, width, height, prevData);
    const allCues = result?.cues || [];

    return {
      cues: allCues,
      // Return the full frame data as the previous frame for next tick
      prevFrameData: frameData,
    };
  } catch (err) {
    const errorType = 'exception';
    console.error("processFrameToCues error:", err.message);
  try { const _d = getDispatchEvent(); if (typeof _d === 'function') _d("logError", { message: `Frame mapping error: ${err.message}` }); } catch (e) {}
    structuredLog('WARN', 'Frame error; state reset', { reset: settings.resetStateOnError, errorType });
    if (settings.resetStateOnError) {
      return { cues: [], prevFrameData: null };
    }
    return { cues: [], prevFrameData: prevData };
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
    return { cues: [], prevFrameData };
  }
  const result = await processFrameToCues(frameData, width, height, prevFrameData);
  // Update the single state variable
  prevFrameData = result.prevFrameData;
  return result; // This now returns an object like { cues: [...] }
}

// Expose processFrameToCues as processFrame for backward compatibility
export { processFrameToCues as processFrame };

/** Cleanup function for frame processor */
export async function cleanupFrameProcessor() {
  try {
    structuredLog('INFO', 'cleanupFrameProcessor: Resetting frame processor state');
  prevFrameData = null;
  return { prevFrameData: null };
  } catch (err) {
    structuredLog('ERROR', 'cleanupFrameProcessor error', { message: err.message });
  try { const _d = getDispatchEvent(); if (typeof _d === 'function') _d('logError', { message: `Frame processor cleanup error: ${err.message}` }); } catch (e) {}
  prevFrameData = null;
  return { prevFrameData: null };
  }
}

// --- Test-only export for setting internal state ---
// Guard against browser environments where `process` and `module` are undefined.
if (typeof process !== 'undefined' && process && process.env && process.env.NODE_ENV === 'test') {
  // Provide a CommonJS export so tests using require(...) can access it.
  // eslint-disable-next-line no-undef
  try {
    if (typeof module !== 'undefined' && module && module.exports) {
      module.exports.__setPrevFrameDataForTest = (data) => {
        prevFrameData = data;
      };
    }
  } catch (e) {
    // ignore environments where `module`/`module.exports` cannot be assigned
  }
}