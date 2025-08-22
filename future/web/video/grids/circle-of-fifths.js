// Lightweight, local motion detector (coarse, fast). Replace with real detector later.
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

export function mapFrameToCues(frameData, width, height, prevFrameData) {
   const { movingRegions } = detectMotion(frameData, prevFrameData, width, height);
   const cues = [];
   const regionsToProcess = movingRegions.slice(0, 8); // default maxNotes=8

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