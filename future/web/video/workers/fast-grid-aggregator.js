/**
 * fast-grid-aggregator.js - Flow Mode: Aggregate Motion Regions into Grid Cells
 * 
 * Purpose: Convert sparse motion regions (from fast-motion-worker) into a dense grid
 * of motion intensities suitable for audio spatialization (pan, intensity).
 * 
 * Input: Motion regions with coordinates and intensities
 * Output: 2D grid (linearized row-major) of aggregated intensities
 * 
 * Latency Target: 5ms
 * Mode: Flow (responsive, real-time)
 * 
 * Algorithm:
 * 1. Create empty grid initialized to zeros
 * 2. For each motion region: map (x, y) to grid cell, accumulate intensity
 * 3. Optionally normalize if multiple regions per cell
 * 4. Return grid as Float32Array
 * 
 * v1.0 Created: October 19, 2025
 */

import { WorkerContract, WORKER_TYPES, CAPABILITIES } from './worker-contract.js';

/**
 * Main message handler // R111125fga : check line 37, the const has been updated 
 * Receives: {
 *   type: 'processFrame',
 *   motionRegions: { coords: Uint16Array, intens: Uint8Array, count: number },
 *   gridConfig: { rows, cols, frameWidth, frameHeight }
 * }
 */
console.log('[GridAgg] Worker script loaded, setting up message handler');

self.onmessage = (e) => {
  console.log('[GridAgg] Received message, type:', e.data?.type);
  try {
    const { type, motionRegions, gridConfig, data, width, height, state } = e.data;

    // CRITICAL FIX (Bug #10 part 2): Accept both 'processingRequest' and 'processFrame' message types
    // FrameConductor sends 'processingRequest', but this worker was only accepting 'processFrame'
    // This caused all messages to be rejected → no grid data → pan-mapper gets undefined R111125 why might by hoarding ghost code under "legacy" or "fallback" lets justfy why we add code in top of another
    const validTypes = ['processFrame', 'processingRequest'];
    
    if (!validTypes.includes(type)) {
      console.error('[GridAgg] REJECTING: Invalid type:', type);
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.GRID_AGGREGATOR,
          `Invalid message type: ${type}. Expected: ${validTypes.join(' or ')}`
        )
      );
      return;
    }

    // R111125grid : the original idea was to aggregate the actual grids from /workspaces/acoustsee/future/web/video/grids
    // R111125grid : lets review the original idea and the SonicPointer concept, we might have to derive, expand and improve this approach
    // Extract motion regions from either message format:  
    // - 'processingRequest': regions come in data field (from conductor chain)
    // - 'processFrame': regions come directly as motionRegions field
    const actualMotionRegions = motionRegions || data;
    
    // Build gridConfig from message fields
    // - 'processingRequest': construct from width, height, state
    // - 'processFrame': use provided gridConfig
    let actualGridConfig = gridConfig;
    if (!actualGridConfig && width && height && state) {
      // Default to 4x4 grid for motion detection
      actualGridConfig = {
        rows: 4,
        cols: 4,
        frameWidth: width,
        frameHeight: height
      };
    }
    
    // Lightweight sampled diagnostic (2%): confirm inbound shapes (avoids heavy object logging)
    if (Math.random() < 0.02) {
      console.log('[GridAgg] INPUT SAMPLE', {
        type,
        hasRegions: !!actualMotionRegions,
        hasConfig: !!actualGridConfig,
        regionsCount: actualMotionRegions && actualMotionRegions.count,
        coordsLen: actualMotionRegions && actualMotionRegions.coords ? actualMotionRegions.coords.length : null,
        intensLen: actualMotionRegions && actualMotionRegions.intens ? actualMotionRegions.intens.length : null,
        rows: actualGridConfig && actualGridConfig.rows,
        cols: actualGridConfig && actualGridConfig.cols,
        fw: actualGridConfig && actualGridConfig.frameWidth,
        fh: actualGridConfig && actualGridConfig.frameHeight
      });
    }

    // Validate inputs
    if (!actualMotionRegions || !actualGridConfig) {
      console.error('[GridAgg] REJECTING: Missing data', {
        hasActualMotionRegions: !!actualMotionRegions,
        hasActualGridConfig: !!actualGridConfig
      });
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.GRID_AGGREGATOR,
          'Missing motionRegions or gridConfig'
        )
      );
      return;
    }

    const { coords, intens, count } = actualMotionRegions; // R111125ac this "actual" is a code smell to me
    const { rows, cols, frameWidth, frameHeight } = actualGridConfig; // R111125ac this "actual" is a code smell to me

    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.GRID_AGGREGATOR,
          `Invalid grid dimensions: ${rows}x${cols}`
        )
      );
      return;
    }

    if (!frameWidth || !frameHeight || frameWidth <= 0 || frameHeight <= 0) {
      console.error('[GridAgg] Invalid frame dimensions:', {
        frameWidth,
        frameHeight,
        configKeys: Object.keys(gridConfig)
      });
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.GRID_AGGREGATOR,
          `Invalid frame dimensions: ${frameWidth}x${frameHeight}. gridConfig keys: ${Object.keys(gridConfig)}`
        )
      );
      return;
    }

    // Process grid aggregation
    const result = aggregateMotionToGrid(
      coords,
      intens,
      count,
      rows,
      cols,
      frameWidth,
      frameHeight
    );

    // Send result via contract
    self.postMessage(
      WorkerContract.createResult(
        WORKER_TYPES.GRID_AGGREGATOR,
        'flow',
        [CAPABILITIES.MOTION_MAGNITUDE],
        {
          grid: result,
          timestamp: Date.now(),
          gridConfig: actualGridConfig // R111125ac this "actual" is a code smell to me
        },
        { gridSize: rows * cols, regionsProcessed: count }
      )
    );
  } catch (error) {
    console.error('[GridAgg] Worker exception:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    try {
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.GRID_AGGREGATOR,
          `Processing error: ${error.message}`
        )
      );
    } catch (e2) {
      console.error('[GridAgg] Failed to postMessage error:', e2.message);
    }
  }
};

/**
 * Aggregate motion regions into grid cells
 * 
 * @param {Uint16Array} coords - Motion region coordinates [x1, y1, x2, y2, ...]
 * @param {Uint8Array} intens - Motion intensity per region
 * @param {number} count - Number of regions
 * @param {number} rows - Grid row count
 * @param {number} cols - Grid column count
 * @param {number} frameWidth - Frame width in pixels
 * @param {number} frameHeight - Frame height in pixels
 * @returns {Float32Array} Grid of aggregated intensities (linearized row-major)
 */
function aggregateMotionToGrid(coords, intens, count, rows, cols, frameWidth, frameHeight) {
  // Initialize grid
  const grid = new Float32Array(rows * cols);

  if (count === 0 || !coords || !intens) {
    return grid;
  }

  // Calculate cell dimensions
  const cellWidth = frameWidth / cols;
  const cellHeight = frameHeight / rows;

  // Aggregate: for each region, accumulate intensity into corresponding grid cell
  for (let i = 0; i < count; i++) {
    // Extract region centroid or position
    // Coordinates are stored as pairs: x, y
    const x = coords[i * 2];
    const y = coords[i * 2 + 1];
    const regionIntensity = intens[i];

    // Map pixel position to grid cell
    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);

    // Boundary check (safety)
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const cellIndex = row * cols + col;
      grid[cellIndex] += regionIntensity;
    }
  }

  return grid;
}

export default {};
