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
 * ============================================================================
 * ARCHITECTURAL NOTE - HEXAGONAL COMPLIANCE ✅
 * ============================================================================
 * This worker is architecturally CLEAN per ADR-0011:
 * - Outputs GENERIC spatial parameters (pan, intensity) not audio-specific values
 * - Pan (-1 to +1) is a spatial concept (left/right position)
 * - Intensity (0 to 1) is a magnitude concept (motion strength)
 * - No Hz/frequency/pitch/synth knowledge - audio layer interprets these values
 * ============================================================================
 * 
 * v1.0 Created: October 19, 2025
 * v1.1 Updated: November 29, 2025 - Added architectural compliance note
 */

import { WorkerContract, WORKER_TYPES, CAPABILITIES } from './worker-contract.js';

/**
 * Main message handler
 * Receives: {
 *   type: 'processFrame',
 *   grid: Float32Array,
 *   gridConfig: { rows, cols, frameWidth, frameHeight }
 * }
 */
console.log('[PanMapper] Worker loaded');

self.onmessage = (e) => {
  // Sample message receipt (1%) to reduce spam
  if (Math.random() < 0.01) console.log('[PanMapper] MSG type:', e.data?.type);
  try {
    const { type, grid, gridConfig, data, width, height, state } = e.data;
    
    // Removed verbose FULL MESSAGE logging (performance).
    
    // CRITICAL FIX (Bug #10): Accept both 'processingRequest' and 'processFrame' message types
    // FrameConductor sends 'processingRequest', but this worker was only accepting 'processFrame'
    // This caused all messages to be rejected, resulting in undefined results
    const validTypes = ['processFrame', 'processingRequest'];
    
    if (!validTypes.includes(type)) {
      console.error('[PanMapper] REJECTING: Invalid type');
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.PAN_INTENSITY_MAPPER,
          `Invalid message type: ${type}. Expected: ${validTypes.join(' or ')}`
        )
      );
      return;
    }

    // Extract grid from either message format: R111125pim it seems we are doingduplicate work like of the fast-grid-aggregator.js
    // - 'processingRequest': grid comes in data.grid field (from conductor chain)
    // - 'processFrame': grid comes directly as grid field
    // CRITICAL FIX (Bug #10 Part 4): When chaining workers, conductor passes the full result object
    // as 'data', so we need to extract data.grid (the Float32Array), not use data directly
    const actualGrid = grid || (data && typeof data === 'object' && data.grid) || data;
    
    // Build gridConfig from message fields or extract from data
    // - 'processingRequest': construct from width, height OR extract from data.gridConfig
    // - 'processFrame': use provided gridConfig
    let actualGridConfig = gridConfig;
    if (!actualGridConfig) {
      // Check if grid aggregator passed gridConfig in its result
      if (data && typeof data === 'object' && data.gridConfig) {
        actualGridConfig = data.gridConfig;
      } else if (width && height) {
        // Fallback: construct default 4x4 grid R111125pim DO NOT SILENT FALLBACK!
        actualGridConfig = {
          rows: 4,
          cols: 4,
          frameWidth: width,
          frameHeight: height
        };
      }
    }
    
    // Sample inbound grid summary (2%)
    if (Math.random() < 0.02) console.log('[PanMapper] GRID SAMPLE', {
      hasGrid: !!actualGrid,
      len: actualGrid ? actualGrid.length : null,
      rows: actualGridConfig && actualGridConfig.rows,
      cols: actualGridConfig && actualGridConfig.cols
    });

    // Validate inputs
    if (!actualGrid || !actualGridConfig) {
      console.error('[PanMapper] REJECTING: Missing actualGrid or gridConfig', {
        hasActualGrid: !!actualGrid,
        hasActualGridConfig: !!actualGridConfig
      });
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.PAN_INTENSITY_MAPPER,
          'Missing grid or gridConfig'
        )
      );
      return;
    }

    const { rows, cols } = actualGridConfig;

    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
      console.error('[PanMapper] REJECTING: Invalid dimensions', { rows, cols }); // R111125pim we might be blocking the event loop and preventing garbage collection of logged object 
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.PAN_INTENSITY_MAPPER,
          `Invalid grid dimensions: ${rows}x${cols}`
        )
      );
      return;
    }

    if (actualGrid.length !== rows * cols) {
      console.error('[PanMapper] REJECTING: Size mismatch', { // R111125pim we might be blocking the event loop and preventing garbage collection of logged object  
        expected: rows * cols,
        actual: actualGrid.length
      });
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.PAN_INTENSITY_MAPPER,
          `Grid size mismatch: expected ${rows * cols}, got ${actualGrid.length}`
        )
      );
      return;
    }

    // Sample validation pass (1%)
    if (Math.random() < 0.01) console.log('[PanMapper] VALID');

    // Calculate pan and intensity from grid
    const { pan, intensity } = calculateAudioParams(actualGrid, rows, cols);

    // Sample calculation output (2%)
    if (Math.random() < 0.02) console.log('[PanMapper] CALC SAMPLE', { pan, intensity });

    // Send result via contract
    const resultMessage = WorkerContract.createResult(
      WORKER_TYPES.PAN_INTENSITY_MAPPER,
      'flow',
      [CAPABILITIES.SPATIALIZATION],
      {
        pan,
        intensity,
        timestamp: Date.now(),
        gridConfig: actualGridConfig
      },
      { panValue: pan.toFixed(3), intensityValue: intensity.toFixed(3) }
    );
    
    // Omit posting log to reduce overhead
    self.postMessage(resultMessage);
  } catch (error) {
    console.error('[PanMapper] Worker exception:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    try {
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.PAN_INTENSITY_MAPPER,
          `Processing error: ${error.message}`
        )
      );
    } catch (e2) {
      console.error('[PanMapper] Failed to postMessage error:', e2.message);
    }
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
