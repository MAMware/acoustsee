// future/web/video/workers/depth-worker.js (ML-1: WebGPU-Accelerated Pseudo-Depth Estimator)
// Refactored to use Manifest Strategy (ADR-0005)

import { WorkerContract, WORKER_TYPES, CAPABILITIES } from './worker-contract.js';
import { DEPTH_STRATEGIES } from '../strategies/depth-strategies.js';
import { structuredLog } from '../../utils/logging.js';

let activeStrategy = null;
let currentPathPreference = 'pseudo';

/**
 * Selects and initializes the appropriate depth strategy
 * Follows ADR-0005: User Override -> System Priority -> Strict Gating
 */
async function updateStrategy(preference) {
  const targetName = preference === 'cnn' ? 'WebGPU' : 'Pseudo';
  
  // If we already have the right strategy active, do nothing
  if (activeStrategy && activeStrategy.name === targetName) {
    return;
  }

  structuredLog('INFO', 'DepthWorker: Selecting strategy', { preference: targetName });

  // Level 1: User Override (Strict)
  // If the user explicitly asks for a specific strategy, we try to find it.
  const CandidateClass = DEPTH_STRATEGIES.find(s => new s().name === targetName);
  
  if (CandidateClass) {
    const candidate = new CandidateClass();
    if (candidate.isSupported()) {
      try {
        await candidate.init();
        activeStrategy = candidate;
        structuredLog('INFO', 'DepthWorker: Strategy activated', { strategy: activeStrategy.name });
        return;
      } catch (e) {
        structuredLog('ERROR', 'DepthWorker: Strategy init failed', { strategy: candidate.name, error: e.message });
        // If explicit selection fails, we DO NOT fallback automatically (Strict Gating)
        throw e;
      }
    } else {
       structuredLog('WARN', 'DepthWorker: Strategy not supported', { strategy: candidate.name });
    }
  }

  // Fallback (only if no active strategy exists yet, e.g. startup)
  if (!activeStrategy) {
     structuredLog('INFO', 'DepthWorker: No active strategy, finding default');
     for (const Strategy of DEPTH_STRATEGIES) {
         const s = new Strategy();
         if (s.isSupported()) {
             await s.init();
             activeStrategy = s;
             structuredLog('INFO', 'DepthWorker: Default strategy activated', { strategy: s.name });
             return;
         }
     }
  }
}

self.onmessage = async (e) => {
  const { type, frame, prevFrame, gridSize, path, gridConfig } = e.data;
  
  try {
    if (type === 'setPath') {
      currentPathPreference = path;
      await updateStrategy(path);
    }
    
    if (type === 'processFrame') {
      // Ensure strategy is initialized
      if (!activeStrategy) {
          await updateStrategy(currentPathPreference);
      }

      const width = frame.width;
      const height = frame.height;
      const data = frame.data; // Uint8ClampedArray

      // Process using active strategy
      // Note: Strategy returns Float32Array [width * height]
      const depthMap = await activeStrategy.process(data, width, height);

      // Average into gridDepths per cell
      // Use gridConfig passed with this frame (stateless); fallback to legacy gridSize parameter
      const config = gridConfig || (gridSize && { rows: gridSize.rows, cols: gridSize.cols }) || { rows: 4, cols: 4, aggregation: 'mean', skipThreshold: 0.2 };
      
      const rows = config.rows;
      const cols = config.cols;
      const cellW = Math.floor(width / cols);
      const cellH = Math.floor(height / rows);
      const gridDepths = new Float32Array(rows * cols);

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let sum = 0;
          let count = 0;
          const startY = r * cellH;
          const startX = c * cellW;
          
          // Simple averaging
          for (let y = startY; y < startY + cellH && y < height; y++) {
            for (let x = 0; x < startX + cellW && x < width; x++) {
               sum += depthMap[y * width + x];
               count++;
            }
          }
          gridDepths[r * cols + c] = count > 0 ? sum / count : 0;
        }
      }

      // Send result
      const result = {
        depthMap: gridDepths, // The grid-averaged depths
        rawDepth: null, // We don't send the full map to main thread to save bandwidth
        confidence: 1.0
      };

      self.postMessage(WorkerContract.createResult(
        WORKER_TYPES.DEPTH,
        e.data.mode || 'hybrid',
        [CAPABILITIES.DEPTH_MAP],
        result
      ));
    }
  } catch (error) {
    // ADR-0005: Stop execution, Log STRATEGY_FAILURE
    structuredLog('ERROR', 'DepthWorker: STRATEGY_FAILURE', { 
        strategy: activeStrategy ? activeStrategy.name : 'none',
        error: error.message 
    });
    
    // We do NOT fallback here. We report the error.
    // The FrameConductor will handle the worker failure (graceful degradation of the pipeline).
  }
};
