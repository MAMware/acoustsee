/**
 * flow-mode.js - Flow Mode Processing Strategy
 * 
 * Extracted from frame-processor.js as part of SRP refactoring.
 * Handles Flow mode frame processing via FrameConductor.
 * 
 * Flow mode produces audio cues from motion detection:
 * - Zone-based cues (Triangular Mesh): Array of {zone, profile, intensity, pitch, pan, x, y, duration}
 * - Pan/Intensity cues (Legacy): {pan, intensity} for AudioRouter to convert
 * 
 * @module video/strategies/flow-mode
 */

import { structuredLog, shouldSample } from '../../utils/logging.js';

/**
 * Executes Flow mode frame processing.
 * 
 * Delegates to FrameConductor for worker orchestration, then normalizes
 * the result into a consistent format for AudioRouter consumption.
 * 
 * @param {FrameConductor} frameConductor - The conductor instance managing workers
 * @param {Uint8ClampedArray} frameData - RGBA pixel data from video frame
 * @param {number} width - Frame width in pixels
 * @param {number} height - Frame height in pixels
 * @param {Object} state - Current engine state
 * @returns {Promise<Object>} Result containing { cues, panIntensity, normalizationTelemetry }
 * 
 * @example
 * const result = await executeFlowMode(conductor, frameData, 640, 480, state);
 * if (result.cues.length > 0) {
 *   audioRouter.route(result, state);
 * }
 */
export async function executeFlowMode(frameConductor, frameData, width, height, state) {
  // Guard: Conductor must be initialized
  if (!frameConductor) {
    structuredLog('ERROR', 'executeFlowMode: FrameConductor not initialized', {});
    return { cues: [], panIntensity: { pan: 0, intensity: 0 } };
  }

  try {
    // Delegate to FrameConductor - single source of truth for worker orchestration
    const result = await frameConductor.processFrame(frameData, width, height, state);
    
    // Initialize return values
    let cues = [];
    let panIntensity = { pan: 0, intensity: 0 };
    
    // PHASE-TRIANGULAR: Check if conductor result contains zone-based cues
    // Triangular mesh grid produces array of {zone, profile, intensity, pitch, x, y, duration, pan} cues
    if (result.result && Array.isArray(result.result.cues) && result.result.cues.length > 0) {
      cues = result.result.cues;
      
      structuredLog('DEBUG', 'Flow mode: Using zone cues from triangular-zone-mapper', () => ({
        cuesCount: cues.length,
        zones: [...new Set(cues.map(c => c.zone))].join(',')
      }), false, shouldSample('cueGeneration'));
    }
    // Fall back to pan/intensity if no zone cues present
    // The chain (motion → grid → pan-mapper) produces {pan, intensity} directly
    else if (result.result && typeof result.result.pan === 'number' && typeof result.result.intensity === 'number') {
      panIntensity = {
        pan: result.result.pan,
        intensity: result.result.intensity
      };
      
      structuredLog('DEBUG', 'Flow mode: Using conductor pan/intensity', () => ({ 
        panIntensity,
        cuesCount: cues.length 
      }), false, shouldSample('cueGeneration'));
    } else if (result.result && !result.result.empty) {
      // FAIL FAST: Log error if conductor didn't produce expected output
      // This surfaces bugs instead of silently falling back to broken legacy code
      structuredLog('ERROR', 'executeFlowMode: Conductor result missing pan/intensity or zone cues', () => ({
        hasResult: !!result.result,
        resultKeys: result.result ? Object.keys(result.result) : [],
        mode: state?.mode,
        hasCues: result.result && Array.isArray(result.result.cues)
      }));
    }
    
    // CORE-15: Return telemetry along with cues for state update
    return { 
      cues, 
      panIntensity,
      normalizationTelemetry: result.normalizationTelemetry 
    };
  } catch (error) {
    structuredLog('ERROR', 'executeFlowMode error', { error: error.message });
    return { cues: [], panIntensity: { pan: 0, intensity: 0 } };
  }
}
