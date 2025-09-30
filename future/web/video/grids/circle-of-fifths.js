// filepath: future/web/video/grids/circle-of-fifths.js
// This grid's sole responsibility is to map radial motion to the circle of fifths.

export const meta = {
  id: 'circle-of-fifths',
  name: 'Circle of Fifths',
  description: 'Maps the angle of motion around the center of the screen to a 12-note scale based on the circle of fifths.'
};

const circleOfFifthsScale = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // MIDI note offsets from root

// Lightweight, local motion detector (coarse, fast). Replace with real detector later.
// DEPRECATED: Kept for backward compatibility only
function detectMotion(frameData, prevFrameData, width, height, opts = {}) {
   const step = opts.step || 6; // sample spacing (higher -> cheaper)
   const threshold = opts.threshold || 24; // per-channel diff threshold to count movement
   const maxRegions = opts.maxRegions || 64;
   const movingRegions = [];
   if (!frameData || !prevFrameData || width <= 0 || height <= 0) return { movingRegions };

   for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
         const i = (y * width + x) * 4;
         const dr = Math.abs((frameData[i] || 0) - (prevFrameData[i] || 0));
         const dg = Math.abs((frameData[i + 1] || 0) - (prevFrameData[i + 1] || 0));
         const db = Math.abs((frameData[i + 2] || 0) - (prevFrameData[i + 2] || 0));
         const intensity = (dr + dg + db) / 3;
         if (intensity >= threshold) {
            movingRegions.push({ pixelX: x, pixelY: y, intensity });
         }
      }
   }

   movingRegions.sort((a, b) => b.intensity - a.intensity);
   return { movingRegions: movingRegions.slice(0, maxRegions) };
}

export function mapFrameToCues(frameData, width, height, prevFrameData, opts = {}) {
    // DEPRECATED: Use mapFunction instead for proper separation of concerns
    let movingRegions = opts.movingRegions;
    if (!movingRegions) {
       if (opts.yPlane) {
          // Use a luma-based detector if yPlane is supplied to avoid RGB math
          movingRegions = detectMotion(opts.yPlane, prevFrameData, width, height, { luma: true });
          movingRegions = movingRegions.movingRegions || [];
       } else {
          movingRegions = detectMotion(frameData, prevFrameData, width, height).movingRegions;
       }
    }
   const cues = [];
    const regionsToProcess = movingRegions.slice(0, 8); // default maxNotes=8

   for (const region of regionsToProcess) {
      const { pixelX, pixelY, intensity } = region;

      // --- DYNAMIC PITCH MAPPING ---
      // Map the vertical position (pixelY) of the motion to a musical pitch.
      // Top of the screen (y=0) -> high pitch. Bottom (y=height) -> low pitch.
      const pitch = 200 + (1 - (pixelY / height)) * 800; // Maps Y to a 200-1000 Hz range.

      const cue = {
         // A future object detection module could assign a more specific type here
         // (e.g., 'wall', 'sidewalk'). For now, all motion is 'default_motion'.
         objectType: 'default_motion',
         
         // --- MUSICAL & SPATIAL PROPERTIES ---
         pitch: pitch, // The dynamically calculated pitch.
         intensity: intensity / 255, // Normalized intensity for volume.
         position: {
            x: (pixelX / width) * 2 - 1,       // Horizontal position for stereo panning (-1 to 1).
            y: -((pixelY / height) * 2 - 1),  // Vertical position.
            z: 0.0                            // Placeholder for future depth data.
         }
      };
      cues.push(cue);
   }

   return { cues };
}

// Map frame to a 12-bin Circle-of-Fifths style vector. Self-contained and
// independent of legacy code. Returns an object with id, bins (Float32Array),
// and original dims.
export function mapFrameToCircleOfFifths(frameData, width, height, prevFrameData = null, panValue = 0) {
   const BIN_COUNT = 12;
   const bins = new Float32Array(BIN_COUNT);
   if (!frameData || !width || !height) {
      return { id: 'circle-of-fifths', bins, width: width || 0, height: height || 0, panValue };
   }

   const { movingRegions } = detectMotion(frameData, prevFrameData, width, height);

   if (movingRegions && movingRegions.length > 0) {
      const cx = width / 2;
      const cy = height / 2;
      for (let i = 0; i < Math.min(movingRegions.length, 64); i++) {
         const r = movingRegions[i];
         const dx = (r.pixelX || 0) - cx;
         const dy = (r.pixelY || 0) - cy;
         const angle = Math.atan2(dy, dx);
         const pos = (angle + Math.PI) / (2 * Math.PI);
         const bin = Math.floor(pos * BIN_COUNT) % BIN_COUNT;
         const weight = (r.intensity ?? 0) / 255;
         bins[bin] += weight;
      }
   } else {
      // fallback: coarse luminance mapping
      const cx = width / 2;
      const cy = height / 2;
      for (let y = 0; y < height; y += 2) {
         for (let x = 0; x < width; x += 2) {
            const idx = (y * width + x) * 4;
            const r = frameData[idx] ?? 0;
            const g = frameData[idx + 1] ?? 0;
            const b = frameData[idx + 2] ?? 0;
            const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
            if (lum <= 0) continue;
            const dx = x - cx;
            const dy = y - cy;
            const angle = Math.atan2(dy, dx);
            const pos = (angle + Math.PI) / (2 * Math.PI);
            const bin = Math.floor(pos * BIN_COUNT) % BIN_COUNT;
            bins[bin] += lum;
         }
      }
   }

   // normalize
   let max = 0;
   for (let i = 0; i < BIN_COUNT; i++) if (bins[i] > max) max = bins[i];
   if (max > 0) for (let i = 0; i < BIN_COUNT; i++) bins[i] = bins[i] / max;

   return { id: 'circle-of-fifths', bins, width, height, panValue };
}

// Backwards-compatible adapter: prefer `mapFunction` as the canonical export
// contract used by available-grids.js. This adapter delegates to existing
// legacy mappers while preserving their original exports for external users.
export const mapFunction = function(frameData, width, height, prevFrameData, opts = {}) {
  const movingRegions = opts.movingRegions || [];
  const cues = [];
  const maxNotes = 12;

  // Center of the screen
  const cx = width / 2;
  const cy = height / 2;
  const rootMidiNote = 60; // Middle C

  for (const region of movingRegions.slice(0, maxNotes)) {
    const { x, y, intensity } = region;
    
    // Calculate the angle of the motion relative to the center
    const dx = x - cx;
    const dy = y - cy;
    const angle = Math.atan2(dy, dx); // Angle in radians from -PI to PI
    
    // Normalize angle to a 0-1 range
    const normalizedAngle = (angle + Math.PI) / (2 * Math.PI);
    
    // Map the angle to one of the 12 bins
    const bin = Math.floor(normalizedAngle * 12) % 12;
    const midiNote = rootMidiNote + circleOfFifthsScale[bin];
    
    // Convert MIDI note number to frequency (Hz)
    const pitch = 440 * Math.pow(2, (midiNote - 69) / 12);

    cues.push({
      objectType: 'default_motion', // This grid still produces a generic motion type
      pitch,
      intensity: Math.min(1.0, intensity / 100),
      position: {
        x: (x / width) * 2 - 1,
        y: -((y / height) * 2 - 1),
        z: 0.0
      }
    });
  }
  
  return { cues };
};