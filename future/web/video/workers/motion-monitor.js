/**
 * motion-monitor.js - Placeholder Motion Monitor Worker
 * 
 * Implements scene complexity monitoring for Hybrid mode.
 */

import { WorkerContract, WORKER_TYPES, CAPABILITIES } from './worker-contract.js';

self.onmessage = async (e) => {
  const { type, data, width, height, state, timestamp } = e.data;

  if (type === 'processingRequest') {
    const result = {
      complexityScore: 0,
      motionDensity: 0,
      timestamp
    };

    const message = WorkerContract.createResult(
      WORKER_TYPES.MOTION_MONITOR,
      'hybrid',
      [CAPABILITIES.COMPLEXITY_ASSESSMENT],
      result
    );

    self.postMessage(message);
  }
};
