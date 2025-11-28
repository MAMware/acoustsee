/**
 * Triangular Mesh Grid
 * 
 * Divides the video frame into 4 diagonal zones (corners to center),
 * each bound to a distinct synth engine and pitch range.
 * 
 * Zone Architecture:
 *         ┌─────────────────────────────┐
 *         │      TOP (Pad Synth)        │
 *         │        800-1600 Hz          │
 *         │            ▲                │
 *         │           /│\               │
 *         │          / │ \              │
 *    LEFT │ (Sine) /  │  \ (FM)  RIGHT │
 *  400-800│       /   ●   \    400-800 │
 *  Lead   │      /  CENTER  \   Lead   │
 *         │     /     │      \         │
 *         │    /      │       \        │
 *         │   /   (y=cy/2)    \       │
 *         │  /        │        \      │
 *         │ /         ▼         \     │
 *         │     BOTTOM (Strings)│     │
 *         │    100-300 Hz       │     │
 *         │  (Percussive Pluck) │     │
 *         └─────────────────────────────┘
 * 
 * Zone Classification:
 * - Diagonal slopes divide frame into quadrants
 * - Compare motion (x,y) against center point (cx, cy)
 * - Use diagonal slope comparisons to determine zone
 * 
 * Boundary Modes:
 * - 'hard' (default): Binary zone assignment
 * - 'soft': Barycentric blending within 10% of boundary
 * 
 * Related: ADR-0013, SoundPerception.md (45ms frame, perceptual limits)
 */

export const meta = {
  id: 'triangular-mesh',
  name: 'Triangular Mesh',
  description: 'Zone-bound multi-synth grid: 4 diagonal regions (TOP=pad, LEFT/RIGHT=leads, BOTTOM=percussion)',
  author: 'MAMware + Copilot',
  version: '1.0.0'
};

/**
 * Zone pitch range definitions
 * Each zone has a unique frequency band and synth type
 */
const ZONE_CONFIG = {
  zone_top: {
    minHz: 800,
    maxHz: 1600,
    synth: 'sawtooth-pad',
    description: 'High ambient pad'
  },
  zone_left: {
    minHz: 400,
    maxHz: 800,
    synth: 'sine-wave',
    description: 'Left melodic lead'
  },
  zone_right: {
    minHz: 400,
    maxHz: 800,
    synth: 'fm-synthesis',
    description: 'Right complex lead'
  },
  zone_bottom: {
    minHz: 100,
    maxHz: 300,
    synth: 'strings',
    description: 'Low percussive pluck'
  }
};

/**
 * Per-zone cue limits to prevent auditory masking
 */
const ZONE_CUE_LIMITS = {
  zone_top: 3,
  zone_left: 3,
  zone_right: 3,
  zone_bottom: 2
};

/**
 * Classify a point (x, y) into a zone using diagonal slope comparison
 * 
 * @param {number} x - Pixel x coordinate
 * @param {number} y - Pixel y coordinate
 * @param {number} width - Frame width
 * @param {number} height - Frame height
 * @returns {string} Zone identifier: 'zone_top', 'zone_left', 'zone_right', 'zone_bottom'
 */
function classifyZone(x, y, width, height) {
  const cx = width / 2;
  const cy = height / 2;

  // Translate to center-relative coordinates
  const dx = x - cx;
  const dy = y - cy;

  // Aspect ratio for diagonal slope comparison
  // If slope of (dx, dy) is less than aspect ratio, point is in top/bottom zone
  const aspectRatio = width / height;
  const slope = Math.abs(dx) / (Math.abs(dy) + 0.001); // Avoid division by zero

  // Determine zone based on quadrant and diagonal slope
  if (dy < 0 && slope < aspectRatio) {
    return 'zone_top'; // Above center, within diagonal
  } else if (dy > 0 && slope < aspectRatio) {
    return 'zone_bottom'; // Below center, within diagonal
  } else if (dx < 0) {
    return 'zone_left'; // Left of diagonals
  } else {
    return 'zone_right'; // Right of diagonals
  }
}

/**
 * Calculate distance from point to nearest zone boundary (for soft mode)
 * 
 * @param {number} x - Pixel x coordinate
 * @param {number} y - Pixel y coordinate
 * @param {number} width - Frame width
 * @param {number} height - Frame height
 * @returns {number} Distance to boundary in pixels
 */
function calculateBoundaryDistance(x, y, width, height) {
  const cx = width / 2;
  const cy = height / 2;
  const dx = x - cx;
  const dy = y - cy;

  // Distance to diagonal lines (simplified)
  // Diagonals: y = ±(height/width) * x
  const aspectRatio = width / height;
  
  // Distance to main diagonal (top-left to bottom-right)
  // Line equation: dy = aspectRatio * dx
  // Distance = |dy - aspectRatio * dx| / sqrt(1 + aspectRatio^2)
  const distToDiagonal = Math.abs(dy - aspectRatio * dx) / Math.sqrt(1 + aspectRatio * aspectRatio);
  
  return distToDiagonal;
}

/**
 * Get adjacent zone for soft boundary blending
 * 
 * @param {number} x - Pixel x coordinate
 * @param {number} y - Pixel y coordinate
 * @param {number} width - Frame width
 * @param {number} height - Frame height
 * @param {string} primaryZone - Current zone classification
 * @returns {string} Adjacent zone for blending
 */
function getAdjacentZone(x, y, width, height, primaryZone) {
  const cx = width / 2;
  const cy = height / 2;
  const dx = x - cx;
  const dy = y - cy;

  // Determine which adjacent zone to blend with based on position
  const aspectRatio = width / height;
  const slope = Math.abs(dx) / (Math.abs(dy) + 0.001);

  if (primaryZone === 'zone_top') {
    return dx < 0 ? 'zone_left' : 'zone_right';
  } else if (primaryZone === 'zone_bottom') {
    return dx < 0 ? 'zone_left' : 'zone_right';
  } else if (primaryZone === 'zone_left') {
    return dy < 0 ? 'zone_top' : 'zone_bottom';
  } else if (primaryZone === 'zone_right') {
    return dy < 0 ? 'zone_top' : 'zone_bottom';
  }
  return primaryZone;
}

/**
 * Classify zone(s) with optional soft boundary blending
 * 
 * @param {number} x - Pixel x coordinate
 * @param {number} y - Pixel y coordinate
 * @param {number} width - Frame width
 * @param {number} height - Frame height
 * @param {string} boundaryMode - 'hard' or 'soft'
 * @returns {Array<{zone: string, weight: number}>} Zone(s) and intensity weights
 */
function classifyWithBoundary(x, y, width, height, boundaryMode = 'hard') {
  const primaryZone = classifyZone(x, y, width, height);

  if (boundaryMode === 'soft') {
    const distanceToBoundary = calculateBoundaryDistance(x, y, width, height);
    const threshold = Math.min(width, height) * 0.1; // 10% of frame

    if (distanceToBoundary < threshold) {
      const secondaryZone = getAdjacentZone(x, y, width, height, primaryZone);
      const blend = distanceToBoundary / threshold; // 0 = at boundary, 1 = away from boundary

      return [
        { zone: primaryZone, weight: 1 - blend * 0.3 }, // 70-100% to primary
        { zone: secondaryZone, weight: blend * 0.3 } // 0-30% to secondary
      ];
    }
  }

  return [{ zone: primaryZone, weight: 1.0 }];
}

/**
 * Map pitch value within zone's frequency band
 * 
 * @param {number} intensity - Motion intensity (0-255)
 * @param {string} zone - Zone identifier
 * @param {number} y - Pixel y coordinate (for vertical pitch mapping in some zones)
 * @param {number} height - Frame height
 * @param {number} x - Pixel x coordinate (for horizontal pitch mapping in left/right)
 * @param {number} width - Frame width
 * @returns {number} Frequency in Hz
 */
function mapPitchForZone(intensity, zone, y, height, x, width) {
  const config = ZONE_CONFIG[zone];
  const { minHz, maxHz } = config;

  let pitch;

  switch (zone) {
    case 'zone_top':
      // Top: map y-position to high register (inverted)
      const cy = height / 2;
      const relativeY = Math.max(0, cy - y) / cy; // 0 at center, 1 at top
      pitch = minHz + relativeY * (maxHz - minHz);
      break;

    case 'zone_bottom':
      // Bottom: map y-position to low register
      const cy2 = height / 2;
      const relativeY2 = Math.max(0, y - cy2) / (height - cy2); // 0 at center, 1 at bottom
      pitch = minHz + relativeY2 * (maxHz - minHz);
      break;

    case 'zone_left':
      // Left: map x-position from left edge
      const cx = width / 2;
      const relativeX = Math.max(0, cx - x) / cx; // 0 at center, 1 at left edge
      pitch = minHz + relativeX * (maxHz - minHz);
      break;

    case 'zone_right':
      // Right: map x-position from right edge
      const cx2 = width / 2;
      const relativeX2 = Math.max(0, x - cx2) / (width - cx2); // 0 at center, 1 at right edge
      pitch = minHz + relativeX2 * (maxHz - minHz);
      break;

    default:
      pitch = (minHz + maxHz) / 2; // Default to middle of range
  }

  return Math.max(minHz, Math.min(maxHz, pitch)); // Clamp to zone range
}

/**
 * Main grid mapping function (grid contract)
 * 
 * @param {Uint8Array} frameData - Motion frame data (unused, using opts.movingRegions)
 * @param {number} width - Frame width in pixels
 * @param {number} height - Frame height in pixels
 * @param {Uint8Array} prevFrameData - Previous frame (unused)
 * @param {Object} opts - Options object
 * @param {Array<{x, y, intensity}>} opts.movingRegions - Motion regions from motion worker
 * @param {string} opts.boundaryMode - 'hard' or 'soft' (default: 'hard')
 * @returns {Object} { cues: [...], newFrameData, avgIntensity }
 */
export function mapFunction(frameData, width, height, prevFrameData, opts = {}) {
  const movingRegions = opts.movingRegions || [];
  const boundaryMode = opts.boundaryMode || 'hard';
  const cues = [];
  const zonesCueCount = {
    zone_top: 0,
    zone_left: 0,
    zone_right: 0,
    zone_bottom: 0
  };

  // Process each motion region
  for (const region of movingRegions) {
    const { x, y, intensity } = region;

    // Classify zone(s) for this region
    const zones = classifyWithBoundary(x, y, width, height, boundaryMode);

    // Create cue(s) for each zone
    for (const { zone, weight } of zones) {
      // Check per-zone cue limit
      if (zonesCueCount[zone] >= ZONE_CUE_LIMITS[zone]) {
        continue; // Skip if zone is at capacity
      }

      // Map pitch within zone's range
      const pitch = mapPitchForZone(intensity, zone, y, height, x, width);

      // Apply zone weight to intensity
      const weightedIntensity = Math.min(1.0, (intensity / 255) * weight);

      // Calculate stereo panning (-1 to 1)
      let pan;
      if (zone === 'zone_left') {
        pan = -1 + (x / (width / 2)); // -1 (far left) to 0 (center)
      } else if (zone === 'zone_right') {
        pan = (x - width / 2) / (width / 2); // 0 (center) to 1 (far right)
      } else {
        // Top and bottom: pan based on x position
        pan = (x / width) * 2 - 1; // -1 (left) to 1 (right)
      }

      cues.push({
        objectType: zone, // Triggers synth selection via sound-profiles.js
        pitch,
        intensity: weightedIntensity,
        position: {
          x: Math.max(-1, Math.min(1, pan)),
          y: 0.0,
          z: 0.0
        }
      });

      zonesCueCount[zone]++;
    }

    // Stop if we've reached global cue limit (12 max per frame)
    if (cues.length >= 12) {
      break;
    }
  }

  // Calculate average intensity for optional telemetry
  const avgIntensity = cues.length > 0
    ? cues.reduce((sum, cue) => sum + cue.intensity, 0) / cues.length
    : 0;

  return { cues, newFrameData: frameData, avgIntensity };
}
