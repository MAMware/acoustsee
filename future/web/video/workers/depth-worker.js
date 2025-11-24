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
  // Handle both legacy and FrameConductor message formats
  const msg = e.data;
  const type = msg.type;
  
  try {
    if (type === 'setPath') {
      currentPathPreference = msg.path;
      await updateStrategy(msg.path);
    }
    
    if (type === 'processFrame' || type === 'processingRequest') {
      // Ensure strategy is initialized
      if (!activeStrategy) {
          await updateStrategy(currentPathPreference);
      }

      // Normalize input data based on message format
      let width, height, data, gridConfig;
      
      if (type === 'processingRequest') {
        // FrameConductor format
        width = msg.width;
        height = msg.height;
        data = msg.data; // Uint8ClampedArray or ImageData
        if (data.data) data = data.data; // Handle ImageData
        
        // Extract grid config from state if available
        const state = msg.state || {};
        gridConfig = { 
          rows: (state.orchestration && state.orchestration.gridType === '8x8') ? 8 : 4,
          cols: (state.orchestration && state.orchestration.gridType === '8x8') ? 8 : 4,
          aggregation: 'mean', 
          skipThreshold: 0.2 
        };
      } else {
        // Legacy format
        width = msg.frame.width;
        height = msg.frame.height;
        data = msg.frame.data;
        gridConfig = msg.gridConfig || (msg.gridSize && { rows: msg.gridSize.rows, cols: msg.gridSize.cols });
      }

      // Process using active strategy
      // Note: Strategy returns Float32Array [width * height]
      const depthMap = await activeStrategy.process(data, width, height);

      // Average into gridDepths per cell
      const config = gridConfig || { rows: 4, cols: 4, aggregation: 'mean', skipThreshold: 0.2 };
      
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
        confidence: 1.0,
        timestamp: msg.timestamp || Date.now(),
        gridConfig: config
      };

      if (type === 'processingRequest') {
        self.postMessage(WorkerContract.createResult(
          WORKER_TYPES.DEPTH,
          'focus',
          [CAPABILITIES.DEPTH_MAP, CAPABILITIES.DEPTH_CONFIDENCE],
          result
        ));
      } else {
        // Legacy return
        self.postMessage({ 
          type: 'depthResult', 
          depthMap: gridDepths,
          timestamp: Date.now() 
        });
      }
    }
  } catch (error) {
    // ADR-0005: Stop execution, Log STRATEGY_FAILURE
    structuredLog('ERROR', 'DepthWorker: STRATEGY_FAILURE', { 
        strategy: activeStrategy ? activeStrategy.name : 'none',
        error: error.message 
    });
    
    if (type === 'processingRequest') {
       throw error; // Let FrameConductor handle it
    }
  }
};
