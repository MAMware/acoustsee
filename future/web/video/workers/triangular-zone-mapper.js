/**
 * triangular-zone-mapper.js - Flow Mode: Map Grid Motion to Triangular Zone Cues
 * 
 * Purpose: Convert grid motion intensities into zone-based audio cues for a
 * triangular mesh grid with 4 zones (top, left, right, bottom) and zone-bound synths.
 * 
 * Input: Motion grid (from fast-grid-aggregator)
 * Output: Array of {zone, intensity, pitch} cues for zone-bound synth engines
 * 
 * Latency Target: 5ms
 * Mode: Flow (responsive, real-time)
 * 
 * ============================================================================
 * ⚠️ ARCHITECTURAL VIOLATION - HEXAGONAL PURITY (ADR-0011)
 * ============================================================================
 * This file contains AUDIO/SYNTHESIS concerns that should live in future/web/audio/:
 * 
 * VIOLATIONS:
 * - Lines 241-244: Hardcoded pitch ranges (pitchMin/pitchMax in Hz)
 * - Lines 241-244: Synth profile names ('zone_top', 'zone_left', etc.)
 * - Line 272-282: mapPitchForZone() calculates frequencies
 * 
 * Per ARCHITECTURE.md Section 8: "The video system does NOT know about the audio system.
 * It produces generic cues that are dispatched via events."
 * 
 * RECOMMENDED REFACTOR:
 * 1. Move pitch mapping to future/web/audio/zone-pitch-mapper.js
 * 2. This worker should output: { zone, intensity, normalizedPosition }
 * 3. Audio layer applies pitch ranges from its own config
 * 
 * This violation exists for pragmatic reasons (working MVP) but should be
 * addressed in a future hexagonal purity cleanup phase.
 * ============================================================================
 * 
 * Architecture:
 * - Assumes 2x2 grid (4 cells total)
 * - Cells map to zones using diagonal boundary logic:
 *   - TOP: cell(0,0) for upper half
 *   - LEFT/RIGHT: cells on left/right for middle band
 *   - BOTTOM: cell(1,0) for lower half
 * - Zone pitch ranges:
 *   - TOP: 800-1600 Hz (bright, high energy)
 *   - LEFT: 400-800 Hz (mid, left spatial)
 *   - RIGHT: 400-800 Hz (mid, right spatial)
 *   - BOTTOM: 100-300 Hz (deep, low energy)
 * - Cue limits per zone (perceptual threshold):
 *   - TOP: 3 simultaneous notes
 *   - LEFT: 3 simultaneous notes
 *   - RIGHT: 3 simultaneous notes
 *   - BOTTOM: 2 simultaneous notes
 * 
 * v1.0 Created: January 30, 2025
 */

import { WorkerContract, WORKER_TYPES, CAPABILITIES } from './worker-contract.js';

console.log('[TriangularZoneMapper] Worker loaded');

self.onmessage = (e) => {
  // Sample message receipt (1%) to reduce spam
  if (Math.random() < 0.01) console.log('[TriangularZoneMapper] MSG type:', e.data?.type);
  try {
    const { type, grid, gridConfig, data, width, height, state } = e.data;
    
    // Accept both 'processingRequest' (from FrameConductor) and 'processFrame' message types
    const validTypes = ['processFrame', 'processingRequest'];
    
    if (!validTypes.includes(type)) {
      console.error('[TriangularZoneMapper] REJECTING: Invalid type');
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.TRIANGULAR_ZONE_MAPPER,
          `Invalid message type: ${type}. Expected: ${validTypes.join(' or ')}`
        )
      );
      return;
    }

    // Extract grid from either message format
    // - 'processingRequest': grid comes in data field (from conductor chain)
    // - 'processFrame': grid comes directly as grid field
    const actualGrid = grid || (data && typeof data === 'object' && data.grid) || data;
    
    // Build gridConfig from message fields
    let actualGridConfig = gridConfig;
    if (!actualGridConfig) {
      if (data && typeof data === 'object' && data.gridConfig) {
        actualGridConfig = data.gridConfig;
      } else if (width && height) {
        // Fallback: construct default 2x2 grid for triangular mesh
        actualGridConfig = {
          rows: 2,
          cols: 2,
          frameWidth: width,
          frameHeight: height
        };
      }
    }
    
    // Sample inbound grid summary (2%)
    if (Math.random() < 0.02) console.log('[TriangularZoneMapper] GRID SAMPLE', {
      hasGrid: !!actualGrid,
      len: actualGrid ? actualGrid.length : null,
      rows: actualGridConfig && actualGridConfig.rows,
      cols: actualGridConfig && actualGridConfig.cols
    });

    // Validate inputs
    if (!actualGrid || !actualGridConfig) {
      console.error('[TriangularZoneMapper] REJECTING: Missing grid or gridConfig', {
        hasActualGrid: !!actualGrid,
        hasActualGridConfig: !!actualGridConfig
      });
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.TRIANGULAR_ZONE_MAPPER,
          'Missing grid or gridConfig'
        )
      );
      return;
    }

    const { rows, cols, frameWidth, frameHeight } = actualGridConfig;

    if (!Number.isInteger(rows) || !Number.isInteger(cols) || rows <= 0 || cols <= 0) {
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.TRIANGULAR_ZONE_MAPPER,
          `Invalid grid dimensions: ${rows}x${cols}`
        )
      );
      return;
    }

    if (!frameWidth || !frameHeight || frameWidth <= 0 || frameHeight <= 0) {
      console.error('[TriangularZoneMapper] Invalid frame dimensions:', {
        frameWidth,
        frameHeight
      });
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.TRIANGULAR_ZONE_MAPPER,
          `Invalid frame dimensions: ${frameWidth}x${frameHeight}`
        )
      );
      return;
    }

    // Process grid to generate zone cues
    const cues = generateZoneCues(
      actualGrid,
      rows,
      cols,
      frameWidth,
      frameHeight
    );

    // Extract pan/intensity from upstream worker (pan-intensity-mapper) for fallback R291125-tzm NO FALLBACKS!! AND EVEN WORSE WHY SILENT!!!!!!!
    // When triangular mesh produces zero cues (low motion), the fallback pan/intensity path still works
    const upstreamPan = data && typeof data.pan === 'number' ? data.pan : undefined;
    const upstreamIntensity = data && typeof data.intensity === 'number' ? data.intensity : undefined;

    // Send result via contract
    // IMPORTANT: Pass grid AND pan/intensity forward for downstream processing
    const resultMessage = WorkerContract.createResult(
      WORKER_TYPES.TRIANGULAR_ZONE_MAPPER,
      'flow',
      [CAPABILITIES.SPATIALIZATION],
      {
        cues,
        grid: actualGrid,  // Pass grid forward for downstream workers
        gridConfig: actualGridConfig,
        // Forward pan/intensity from pan-intensity-mapper for fallback when cues are empty
        pan: upstreamPan,
        intensity: upstreamIntensity,
        timestamp: Date.now(),
      },
      { cuesGenerated: cues.length }
    );
    
    self.postMessage(resultMessage);
  } catch (error) {
    console.error('[TriangularZoneMapper] Worker exception:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    try {
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.TRIANGULAR_ZONE_MAPPER,
          `Processing error: ${error.message}`
        )
      );
    } catch (e2) {
      console.error('[TriangularZoneMapper] Failed to postMessage error:', e2.message);
    }
  }
};

/**
 * Generate zone-based cues from a motion grid
 * 
 * Assumes 2x2 grid (4 cells) mapped to 4 zones using triangular mesh:
 *   [0,0] = TOP (rows: 0)
 *   [1,0] = LEFT (cols: 0, rows: 1+)
 *   [1,1] = RIGHT (cols: 1+, rows: 1+)
 *   [1,0] = BOTTOM (rows: 1+)
 * 
 * Actually with a 2x2 grid:
 * cell(0,0) → TOP zone
 * cell(0,1) → TOP zone (upper right)
 * cell(1,0) → BOTTOM/LEFT zone
 * cell(1,1) → BOTTOM/RIGHT zone
 * 
 * For triangular classification in 2x2 grid:
 * - Cells in top row (r=0) → TOP zone
 * - Cells in bottom row (r=1):
 *   - Left column (c=0) → LEFT or BOTTOM_LEFT
 *   - Right column (c=1) → RIGHT or BOTTOM_RIGHT
 * 
 * Zone configuration:
 * - TOP: pitch 800-1600 Hz, max 3 cues, bright/pad synth
 * - LEFT: pitch 400-800 Hz, max 3 cues, mid/sine synth
 * - RIGHT: pitch 400-800 Hz, max 3 cues, mid/fm synth
 * - BOTTOM: pitch 100-300 Hz, max 2 cues, deep/strings synth
 * 
 * @param {Float32Array} grid - Motion grid (linearized row-major)
 * @param {number} rows - Grid row count
 * @param {number} cols - Grid column count
 * @param {number} frameWidth - Frame width in pixels
 * @param {number} frameHeight - Frame height in pixels
 * @returns {Array<Object>} Array of {zone, intensity, pitch, x, y} cues
 */
function generateZoneCues(grid, rows, cols, frameWidth, frameHeight) {
  const cues = [];
  const zoneIntensities = {
    top: { total: 0, count: 0, cells: [] },
    left: { total: 0, count: 0, cells: [] },
    right: { total: 0, count: 0, cells: [] },
    bottom: { total: 0, count: 0, cells: [] }
  };

  // Classify each cell into a zone and accumulate intensity
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const intensity = grid[idx] || 0;
      
      // Zone classification for triangular mesh
      // Using diagonal logic: compare which diagonal zone the cell falls into
      let zone = classifyZone(r, c, rows, cols);
      
      // Accumulate intensity for this zone
      zoneIntensities[zone].total += intensity;
      zoneIntensities[zone].count += 1;
      zoneIntensities[zone].cells.push({ r, c, intensity });
    }
  }

  // Generate cues for each zone based on accumulated motion
  const zoneConfigs = {
    top: { pitchMin: 800, pitchMax: 1600, maxCues: 3, name: 'zone_top' },
    left: { pitchMin: 400, pitchMax: 800, maxCues: 3, name: 'zone_left' },
    right: { pitchMin: 400, pitchMax: 800, maxCues: 3, name: 'zone_right' },
    bottom: { pitchMin: 100, pitchMax: 300, maxCues: 2, name: 'zone_bottom' }
  };

  for (const [zoneName, config] of Object.entries(zoneConfigs)) {
    const zoneData = zoneIntensities[zoneName];
    
    // Only generate cues if zone has motion
    if (zoneData.total > 0 && zoneData.cells.length > 0) {
      // Calculate average intensity for this zone
      const avgIntensity = zoneData.total / zoneData.cells.length;
      
      // Normalize intensity to 0-1 range (assuming 0-255 from motion worker)
      const normalizedIntensity = Math.min(1.0, avgIntensity / 100);
      
      // Generate cues (1 per zone, or up to maxCues if motion is very high)
      const numCues = normalizedIntensity > 0.7 ? Math.min(config.maxCues, Math.ceil(avgIntensity / 30)) : 1;
      
      for (let i = 0; i < numCues; i++) {
        // Calculate pitch based on cell position and intensity
        const topCell = zoneData.cells[i % zoneData.cells.length];
        const pitch = mapPitchForZone(
          normalizedIntensity,
          zoneName,
          topCell.r,
          rows,
          topCell.c,
          cols,
          config.pitchMin,
          config.pitchMax
        );
        
        // Calculate spatial position (x, y) from grid cell
        const cellWidth = frameWidth / cols;
        const cellHeight = frameHeight / rows;
        const x = (topCell.c + 0.5) * cellWidth / frameWidth;  // Normalize to 0-1
        const y = (topCell.r + 0.5) * cellHeight / frameHeight; // Normalize to 0-1
        
        cues.push({
          zone: zoneName,
          profile: config.name,  // Sound profile name (e.g., 'zone_top')
          intensity: normalizedIntensity,
          pitch,
          x,
          y,
          duration: 0.3 + normalizedIntensity * 0.2,  // 0.3-0.5s based on intensity
          pan: (x * 2) - 1  // Convert 0-1 to -1 to +1 for panning
        });
      }
    }
  }

  return cues;
}

/**
 * Classify a grid cell into a triangular zone
 * 
 * For a 2x2 grid with diagonal triangular boundaries:
 *   TOP: upper diagonal triangle
 *   LEFT: left diagonal triangle in bottom half
 *   RIGHT: right diagonal triangle in bottom half
 *   BOTTOM: can be merged with left/right or separate
 * 
 * Using slope comparison:
 * - Cell center diagonal from (0,0) to (rows, cols)
 * - Slope of cell position vs main diagonal determines zone
 * 
 * @param {number} r - Row index
 * @param {number} c - Column index
 * @param {number} rows - Total rows
 * @param {number} cols - Total columns
 * @returns {string} Zone name: 'top', 'left', 'right', or 'bottom'
 */
function classifyZone(r, c, rows, cols) {
  // Normalize cell position to 0-1 range
  const normalizedRow = (r + 0.5) / rows;
  const normalizedCol = (c + 0.5) / cols;
  
  // Main diagonal: slope = rows/cols
  // Cell diagonal: slope = row/col
  const cellSlope = normalizedRow / normalizedCol;
  const mainDiagSlope = rows / cols;
  
  // Determine zone based on position relative to diagonals
  if (r === 0) {
    // Top row always goes to TOP zone
    return 'top';
  } else if (r === rows - 1) {
    // Bottom row: split left/right at column midpoint
    if (c <= cols / 2) {
      return 'left';
    } else {
      return 'right';
    }
  } else {
    // Middle rows (if any): use diagonal comparison
    if (cellSlope > mainDiagSlope) {
      return 'top';
    } else if (cellSlope < mainDiagSlope / 2) {
      return 'left';
    } else {
      return 'right';
    }
  }
}

/**
 * Map motion intensity to a pitch value for a specific zone
 * 
 * Pitch is determined by:
 * 1. Zone's pitch range (e.g., TOP: 800-1600 Hz)
 * 2. Intensity (higher motion → higher pitch within range)
 * 3. Grid position within zone (subtle variation)
 * 
 * @param {number} intensity - Normalized intensity (0-1)
 * @param {string} zone - Zone name
 * @param {number} r - Row index
 * @param {number} rows - Total rows
 * @param {number} c - Column index
 * @param {number} cols - Total columns
 * @param {number} pitchMin - Minimum pitch for zone
 * @param {number} pitchMax - Maximum pitch for zone
 * @returns {number} Pitch in Hz
 */
function mapPitchForZone(intensity, zone, r, rows, c, cols, pitchMin, pitchMax) {
  // Base pitch from intensity
  const pitchRange = pitchMax - pitchMin;
  const basePitch = pitchMin + intensity * pitchRange;
  
  // Add subtle variation based on position within zone (±5% variation)
  const normalizedRow = r / rows;
  const normalizedCol = c / cols;
  const positionVariation = (normalizedCol - 0.5) * 0.1;  // ±5% from column position
  
  const finalPitch = basePitch * (1 + positionVariation);
  
  return Math.max(pitchMin, Math.min(pitchMax, finalPitch));
}

export default {};
