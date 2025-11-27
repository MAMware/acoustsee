/**
 * egomotion-analyzer.js - Placeholder Egomotion Worker
 * 
 * Implements basic egomotion analysis for Hybrid mode.
 * Distinguishes between user motion and object motion.
 */

import { WorkerContract, WORKER_TYPES, CAPABILITIES } from './worker-contract.js';

self.onmessage = async (e) => {
  const { type, data, width, height, state, timestamp } = e.data;

  try {
    if (type === 'processingRequest') {
      const result = {
        isUserMoving: false,
        confidence: 0,
        timestamp
      };

      const message = WorkerContract.createResult(
        WORKER_TYPES.EGOMOTION,
        'hybrid',
        [CAPABILITIES.EGOMOTION_ANALYSIS],
        result
      );

      self.postMessage(message);
    }
  } catch (error) {
    self.postMessage(
      WorkerContract.createError(
        WORKER_TYPES.EGOMOTION,
        `Processing error: ${error.message}`,
        error
      )
    );
  }
};
