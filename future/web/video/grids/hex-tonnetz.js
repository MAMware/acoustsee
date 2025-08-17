import { settings } from "../../core/state.js";
import { detectMotion } from "../motion-detector.js";

export function mapFrameToCues(frameData, width, height, prevFrameData) {
  const { movingRegions } = detectMotion(frameData, prevFrameData, width, height);
  const cues = [];
  
  // Optional: Add logic here to prevent cues from being too spatially close, if desired.
  // For now, we take the most prominent motion regions up to the maxNotes limit.
  const regionsToProcess = movingRegions.slice(0, settings.maxNotes || 16);

  for (const region of regionsToProcess) {
    const { pixelX, pixelY, intensity } = region;

    const cue = {
      objectType: 'default_motion', // Generic type for now
      intensity: intensity / 255, // Normalize intensity to [0, 1]
      position: {
        x: (pixelX / width) * 2 - 1,       // Normalize to [-1, 1] for azimuth
        y: -((pixelY / height) * 2 - 1),  // Normalize to [-1, 1] for elevation (top is +1)
        z: 0.0                            // Placeholder for future depth data
      }
    };
    cues.push(cue);
  }

  return { cues };
}
