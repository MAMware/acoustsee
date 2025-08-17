import { settings } from "../../core/state.js";
import { detectMotion } from "../motion-detector.js";

export function mapFrameToCues(frameData, width, height, prevFrameData) {
  const { movingRegions } = detectMotion(frameData, prevFrameData, width, height);
  const cues = [];

  const regionsToProcess = movingRegions.slice(0, settings.maxNotes || 8);

  for (const region of regionsToProcess) {
    const { pixelX, pixelY, intensity } = region;

    const cue = {
      objectType: 'default_motion',
      intensity: intensity / 255,
      position: {
        x: (pixelX / width) * 2 - 1,
        y: -((pixelY / height) * 2 - 1),
        z: 0.0
      }
    };
    cues.push(cue);
  }

  return { cues };
}
