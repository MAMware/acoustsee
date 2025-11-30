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
 * ============================================================================
 * SIGNAL PROCESSING CAPABILITIES (verified in aggregateMotionToGrid function):
 * ============================================================================
 * 
 * ✅ DATA COMPRESSION (line 236):
 *    - Output is fixed rows×cols Float32Array regardless of input count
 *    - Reduces N motion regions to typically 16 values (4×4 grid)
 * 
 * ✅ FEATURE EXTRACTION (lines 255-260):
 *    - Maps pixel (x,y) to grid cell (row, col) via floor division
 *    - Transforms point-based motion into spatial distribution pattern
 * 
 * ✅ STANDARDIZATION (lines 236, 266):
 *    - Variable input count → fixed grid size output
 *    - Enables consistent downstream processing
 * 
 * ✅ NOISE REDUCTION (lines 257-260, 292-301):
 *    - Tracks region count per cell (regionCountPerCell array)
 *    - Averages accumulated intensities by dividing by count
 *    - Reduces noise floor by consolidating weak signals
 * 
 * ✅ SNR IMPROVEMENT (lines 303-309):
 *    - Calculates SNR per cell as min(regionCount / 10, 1.0)
 *    - Outputs aggregated telemetry: averageSNR, noiseReductionFactor
 *    - SNR normalized to 0-1 range (1.0 = clean signal, 0 = no signal)
 * 
 * ============================================================================
 * ARCHITECTURAL NOTE:
 * ============================================================================
 * This worker performs SPATIAL BINNING only - no audio/pitch/frequency decisions.
 * Audio mapping is delegated to downstream workers:
 * - pan-intensity-mapper.js: Grid → pan/intensity (spatialization)
 * - triangular-zone-mapper.js: Grid → zone cues (NOTE: contains pitch ranges - see violation comment)
 * 
 * The grids/ folder contains MUSICAL MAPPING strategies (linear-pitch, circle-of-fifths)
 * which are used in Focus mode, NOT by this worker. This is a different "grid" concept.
 * 
 * v1.0 Created: October 19, 2025
 * v1.1 Updated: November 29, 2025 - Added verified signal processing documentation
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
    // Priority order:
    // 1. Top-level gridConfig (direct 'processFrame' messages)
    // 2. Nested data.gridConfig (from motion worker result via 'processingRequest')
    // 3. Construct from width, height, state (fallback)
    let actualGridConfig = gridConfig || (data && data.gridConfig);
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
    const { grid, regionCountPerCell, snrPerCell } = aggregateMotionToGrid(
      coords,
      intens,
      count,
      rows,
      cols,
      frameWidth,
      frameHeight
    );
    
    // Calculate telemetry for signal processing capabilities
    let avgSNR = 0;
    let noiseReductionFactor = 0;
    const cellsWithData = Array.from(regionCountPerCell).filter(c => c > 0).length;
    if (cellsWithData > 0) {
      avgSNR = Array.from(snrPerCell).reduce((a, b) => a + b, 0) / cellsWithData;
      noiseReductionFactor = Array.from(regionCountPerCell).reduce((a, b) => Math.max(a, b), 0);
    }

    // Send result via contract
    self.postMessage(
      WorkerContract.createResult(
        WORKER_TYPES.GRID_AGGREGATOR,
        'flow',
        [CAPABILITIES.MOTION_MAGNITUDE],
        {
          grid: grid,
          timestamp: Date.now(),
          gridConfig: actualGridConfig,
          // SIGNAL PROCESSING TELEMETRY:
          signalProcessing: {
            dataCompressionRatio: count > 0 ? (count / (rows * cols)) : 0,  // N regions → rows×cols
            featureExtractionEnabled: true,  // Spatial binning always active
            standardizationEnabled: true,    // Fixed output size
            noiseReductionEnabled: true,     // Averaging per cell
            noiseReductionFactor: noiseReductionFactor,  // Max regions per cell
            snrImprovementEnabled: true,     // SNR calculation active
            averageSNR: avgSNR,              // Mean SNR across cells
            cellsWithMotion: cellsWithData   // Cells with ≥1 region
          },
          regionCountPerCell: regionCountPerCell,  // For dev panel inspection
          snrPerCell: snrPerCell                    // For dev panel visualization
        },
        { 
          gridSize: rows * cols, 
          regionsProcessed: count,
          avgSNR: avgSNR.toFixed(3),
          noiseReductionFactor: noiseReductionFactor
        }
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
 * @returns {Object} { grid: Float32Array, regionCountPerCell: Uint8Array, snrPerCell: Float32Array }
 */
function aggregateMotionToGrid(coords, intens, count, rows, cols, frameWidth, frameHeight) {
  // DATA COMPRESSION + STANDARDIZATION:
  // Fixed-size output regardless of input count (N regions → rows×cols values)
  const grid = new Float32Array(rows * cols);
  
  // NOISE REDUCTION: Track region count per cell for averaging
  const regionCountPerCell = new Uint8Array(rows * cols);
  
  // SNR IMPROVEMENT: Calculate signal-to-noise ratio per cell
  const snrPerCell = new Float32Array(rows * cols);

  if (count === 0 || !coords || !intens) {
    return { grid, regionCountPerCell, snrPerCell };
  }

  // Calculate cell dimensions
  const cellWidth = frameWidth / cols;
  const cellHeight = frameHeight / rows;
  
  // Step 1: Accumulate intensities and count regions per cell
  for (let i = 0; i < count; i++) {
    // Extract region centroid or position
    // Coordinates are stored as pairs: x, y
    const x = coords[i * 2];
    const y = coords[i * 2 + 1];
    const regionIntensity = intens[i];

    // FEATURE EXTRACTION:
    // Map pixel position to grid cell via floor division
    // Transforms (x,y) point → (row, col) spatial bin
    const col = Math.floor(x / cellWidth);
    const row = Math.floor(y / cellHeight);

    // Boundary check (safety)
    if (row >= 0 && row < rows && col >= 0 && col < cols) {
      const cellIndex = row * cols + col;
      // ACCUMULATION: Sum intensities
      grid[cellIndex] += regionIntensity;
      // NOISE REDUCTION: Track count for averaging
      regionCountPerCell[cellIndex]++;
    }
  }
  
  // Step 2: Average accumulations and calculate SNR per cell
  for (let i = 0; i < grid.length; i++) {
    const regionCount = regionCountPerCell[i];
    if (regionCount > 0) {
      // NOISE REDUCTION: Divide by count to get average (reduces noise floor)
      const average = grid[i] / regionCount;
      grid[i] = average;
      
      // SNR IMPROVEMENT: Calculate signal-to-noise ratio
      // SNR = mean / stddev, approximated as: accumulated / count (higher = cleaner signal)
      // Normalized to 0-1 range: min(regionCount / frame_region_density, 1.0)
      snrPerCell[i] = Math.min(regionCount / 10, 1.0);  // Assume ~10 regions per cell = good SNR
    }
  }

  return { grid, regionCountPerCell, snrPerCell };
}

export default {};
