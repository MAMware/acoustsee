// File: web/video/motion-detector.js
import { settings } from '../core/state.js';
import { structuredLog } from '../utils/logging.js';

/**
 * Analyzes frame data to detect moving regions compared to a previous frame.
 * @param {Uint8ClampedArray} frameData - The current video frame pixels.
 * @param {Uint8ClampedArray} prevFrameData - The previous video frame pixels.
 * @param {number} width - The width of the frame.
 * @param {number} height - The height of the frame.
 * @returns {{movingRegions: Array<Object>, avgIntensity: number}} An object containing an array of detected motion regions and the average frame intensity.
 */
export function detectMotion(frameData, prevFrameData, width, height) {
  // Prefer settings passed in; fall back to a safe default.
  const motionThreshold = (settings && typeof settings.motionThreshold === 'number') ? settings.motionThreshold : 20;
  const movingRegions = [];
  
  let totalIntensity = 0;
  const pixelCount = frameData.length / 4;

  if (prevFrameData) {
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = (y * width + x) * 4;
        const r = frameData[idx];
        const g = frameData[idx + 1];
        const b = frameData[idx + 2];
        const intensity = (r + g + b) / 3;
        totalIntensity += intensity;

        const pr = prevFrameData[idx];
        const pg = prevFrameData[idx + 1];
        const pb = prevFrameData[idx + 2];
        const prevIntensity = (pr + pg + pb) / 3;

        const delta = Math.abs(intensity - prevIntensity);
        if (delta > motionThreshold) {
          movingRegions.push({ pixelX: x, pixelY: y, intensity, delta });
        }
      }
    }
  } else {
    // If no previous frame, just calculate average intensity
    for (let i = 0; i < frameData.length; i += 4) {
      totalIntensity += (frameData[i] + frameData[i + 1] + frameData[i + 2]) / 3;
    }
  }

  const avgIntensity = totalIntensity / pixelCount;
  
  structuredLog('DEBUG', 'Motion regions detected', { count: movingRegions.length, threshold: motionThreshold });
  movingRegions.sort((a, b) => b.delta - a.delta);

  return { movingRegions, avgIntensity };
}
