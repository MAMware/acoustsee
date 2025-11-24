/**
 * semantic-detector.js - Placeholder Semantic Detection Worker
 * 
 * Implements basic object detection simulation for Focus mode.
 * Returns detected objects with bounding boxes and labels.
 */

import { WorkerContract, WORKER_TYPES, CAPABILITIES } from './worker-contract.js';

self.onmessage = async (e) => {
  const { type, data, width, height, state, timestamp } = e.data;

  if (type === 'processingRequest') {
    // Simulate processing time
    // await new Promise(resolve => setTimeout(resolve, 5));

    // Placeholder result: No objects detected by default
    // In a real implementation, this would run a TensorFlow.js model
    const result = {
      detectedObjects: [], // Array of { label, confidence, box: {x,y,w,h} }
      timestamp
    };

    // Create contract message
    const message = WorkerContract.createResult(
      WORKER_TYPES.SEMANTIC,
      'focus',
      [CAPABILITIES.SEMANTIC_DETECTION],
      result
    );

    self.postMessage(message);
  }
};
