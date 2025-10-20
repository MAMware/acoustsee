/**
 * pan-intensity-mapper.js - Flow Mode: Map Grid Motion to Audio Parameters
 * 
 * Purpose: Convert grid motion intensities into pan (L/R) and intensity (amplitude)
 * parameters suitable for real-time audio synthesis.
 * 
 * Input: Motion grid (from fast-grid-aggregator)
 * Output: Pan (-1 to +1) and intensity (0 to 1) for audio synth
 * 
 * Latency Target: 2ms
 * Mode: Flow (responsive, real-time)
 * 
 * Algorithm:
 * 1. pan = weighted average horizontal position across grid
 *    - Cells on left → -1, cells on right → +1
 *    - Weight by intensity: pan = Σ(intensity * xWeight) / Σ(intensity)
 * 
 * 2. intensity = total motion magnitude
 *    - Sum all grid values
 *    - Normalize to 0-1 range (clamp)
 * 
 * v1.0 Created: October 19, 2025
 */

import { WorkerContract, WORKER_TYPES, CAPABILITIES } from './worker-contract.js';
import { structuredLog } from '../utils/logging.js';

/**
 * Main message handler
 * Receives: {
 *   type: 'processFrame',
 *   grid: Float32Array,
 *   gridConfig: { rows, cols, frameWidth, frameHeight }
 * }
 */
self.onmessage = (e) => {
  try {
    const { type, grid, gridConfig } = e.data;

    // Debug: log what we received
    if (type === 'processFrame') {
      structuredLog('DEBUG', 'Pan mapper: Received processFrame', {
        hasGrid: !!grid,
        gridLength: grid ? grid.length : null,
        hasGridConfig: !!gridConfig,
        gridConfigDims: gridConfig ? `${gridConfig.rows}x${gridConfig.cols}` : null
      }, false, Math.random() < 0.01);
    }

    if (type !== 'processFrame') {
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.PAN_INTENSITY_MAPPER,
          `Invalid message type: ${type}. Expected 'processFrame'`
        )
      );
      return;
    }

    // Validate inputs
    if (!grid || !gridConfig) {
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.PAN_INTENSITY_MAPPER,
          'Missing grid or gridConfig'
        )
      );
      return;
    }

    const { rows, cols } = gridConfig;

    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.PAN_INTENSITY_MAPPER,
          `Invalid grid dimensions: ${rows}x${cols}`
        )
      );
      return;
    }

    if (grid.length !== rows * cols) {
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.PAN_INTENSITY_MAPPER,
          `Grid size mismatch: expected ${rows * cols}, got ${grid.length}`
        )
      );
      return;
    }

    // Calculate pan and intensity from grid
    const { pan, intensity } = calculateAudioParams(grid, rows, cols);

    // Send result via contract
    self.postMessage(
      WorkerContract.createResult(
        WORKER_TYPES.PAN_INTENSITY_MAPPER,
        'flow',
        [CAPABILITIES.SPATIALIZATION],
        {
          pan,
          intensity,
          timestamp: Date.now(),
          gridConfig
        },
        { panValue: pan.toFixed(3), intensityValue: intensity.toFixed(3) }
      )
    );
  } catch (error) {
    structuredLog('ERROR', 'Pan mapper: Processing error', {
      message: error.message,
      stack: error.stack
    });
    self.postMessage(
      WorkerContract.createError(
        WORKER_TYPES.PAN_INTENSITY_MAPPER,
        `Processing error: ${error.message}`
      )
    );
  }
};

/**
 * Calculate pan and intensity parameters from grid motion
 * 
 * Pan: Weighted average of left/right energy
 *   - Cells on left (c=0) → weight = -1
 *   - Cells on right (c=cols-1) → weight = +1
 *   - pan = Σ(grid[r,c] * weight(c)) / Σ(grid[r,c])
 * 
 * Intensity: Total motion energy
 *   - intensity = min(1.0, sum(grid) / normalizationFactor)
 *   - Clamped to [0, 1]
 * 
 * @param {Float32Array} grid - Grid of motion intensities (linearized row-major)
 * @param {number} rows - Grid row count
 * @param {number} cols - Grid column count
 * @returns {{pan: number, intensity: number}}
 */
function calculateAudioParams(grid, rows, cols) {
  let totalIntensity = 0;
  let weightedPan = 0;

  // Iterate through grid and accumulate pan and intensity
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cellIntensity = grid[r * cols + c];
      totalIntensity += cellIntensity;

      // Weight for pan: left cells (-1) to right cells (+1)
      // Linear interpolation: c ranges [0, cols-1] → weight ranges [-1, +1]
      const xWeight = cols > 1 ? (c / (cols - 1)) * 2 - 1 : 0;
      weightedPan += cellIntensity * xWeight;
    }
  }

  // Calculate final pan: weighted average
  const pan = totalIntensity > 0 ? weightedPan / totalIntensity : 0;

  // Calculate final intensity: normalize total motion to [0, 1]
  // Assume intensities are 0-255 (from motion-worker output)
  // Normalize by assuming typical max of ~100 per cell for 8-bit values
  const normalizationFactor = 100; // Tunable: adjust based on observed peak values
  const intensity = Math.min(1.0, totalIntensity / (normalizationFactor * rows * cols));

  // Clamp to valid ranges (shouldn't be needed after above, but safety)
  const clampedPan = Math.max(-1, Math.min(1, pan));
  const clampedIntensity = Math.max(0, Math.min(1, intensity));

  return {
    pan: clampedPan,
    intensity: clampedIntensity
  };
}

export default {};
