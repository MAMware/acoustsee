/**
 * gabor-texture.js - Placeholder Texture Analysis Worker
 * 
 * Implements basic texture analysis for Focus mode.
 * Returns texture features (roughness, directionality).
 */

import { WorkerContract, WORKER_TYPES, CAPABILITIES } from './worker-contract.js';

self.onmessage = async (e) => {
  const { type, data, width, height, state, timestamp } = e.data;

  if (type === 'processingRequest') {
    // Simulate processing time
    // await new Promise(resolve => setTimeout(resolve, 2));

    // Placeholder result
    const result = {
      textureFeatures: {
        roughness: 0,
        directionality: 0,
        contrast: 0
      },
      timestamp
    };

    // Create contract message
    const message = WorkerContract.createResult(
      WORKER_TYPES.TEXTURE,
      'focus',
      [CAPABILITIES.TEXTURE_ANALYSIS, CAPABILITIES.SURFACE_PROPERTIES],
      result
    );

    self.postMessage(message);
  }
};
