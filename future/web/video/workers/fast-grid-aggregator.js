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
import { structuredLog } from '../utils/logging.js';

/**
 * Main message handler
 * Receives: {
 *   type: 'processFrame',
 *   motionRegions: { coords: Uint16Array, intens: Uint8Array, count: number },
 *   gridConfig: { rows, cols, frameWidth, frameHeight }
 * }
 */
self.onmessage = (e) => {
  try {
    const { type, motionRegions, gridConfig } = e.data;

    // Debug: log what we received
    if (type === 'processFrame') {
      structuredLog('DEBUG', 'Grid aggregator: Received processFrame', {
        hasMotionRegions: !!motionRegions,
        motionRegionsKeys: motionRegions ? Object.keys(motionRegions) : null,
        hasGridConfig: !!gridConfig,
        gridConfigDims: gridConfig ? `${gridConfig.rows}x${gridConfig.cols}` : null
      }, false, Math.random() < 0.01);
    }

    if (type !== 'processFrame') {
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.GRID_AGGREGATOR,
          `Invalid message type: ${type}. Expected 'processFrame'`
        )
      );
      return;
    }

    // Validate inputs
    if (!motionRegions || !gridConfig) {
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.GRID_AGGREGATOR,
          'Missing motionRegions or gridConfig'
        )
      );
      return;
    }

    const { coords, intens, count } = motionRegions;
    const { rows, cols, frameWidth, frameHeight } = gridConfig;

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
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.GRID_AGGREGATOR,
          `Invalid frame dimensions: ${frameWidth}x${frameHeight}`
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
          gridConfig
        },
        { gridSize: rows * cols, regionsProcessed: count }
      )
    );
  } catch (error) {
    structuredLog('ERROR', 'Grid aggregator: Processing error', {
      message: error.message,
      stack: error.stack
    });
    self.postMessage(
      WorkerContract.createError(
        WORKER_TYPES.GRID_AGGREGATOR,
        `Processing error: ${error.message}`
      )
    );
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
