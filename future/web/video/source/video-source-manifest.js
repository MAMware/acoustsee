// video/source/video-source-manifest.js
// Manifest Strategy for video frame capture sources (ADR-0011 Violation 10)
// Defines available strategies with capability detection and priority ordering.

import { MediaStreamTrackSource } from './mediastream-track-source.js';
import { CanvasSource } from './canvas-source.js';

/**
 * VIDEO_SOURCE_MANIFEST - Ordered list of video frame capture strategies.
 * 
 * Manifest Strategy Philosophy:
 * - Each source is a first-class strategy, not a fallback
 * - Selection based on capability detection (isSupported)
 * - User can override via settings (strict gating applies)
 * - If selected strategy fails, log STRATEGY_FAILURE and stop (no silent swapping)
 * 
 * Priority Order:
 * 1. MediaStreamTrackProcessor - GPU-accelerated, best performance
 * 2. Canvas2D - CPU-based, universal browser support
 */
export const VIDEO_SOURCE_MANIFEST = [
  {
    name: 'MediaStreamTrackProcessor',
    strategy: MediaStreamTrackSource,
    isSupported: () => {
      // Check for MediaStreamTrackProcessor API (Chrome 94+, Edge 94+)
      return typeof MediaStreamTrackProcessor !== 'undefined' &&
             typeof VideoFrame !== 'undefined' &&
             'transferControlToOffscreen' in HTMLCanvasElement.prototype;
    },
    priority: 1,
    description: 'GPU-accelerated frame extraction via MediaStreamTrackProcessor API',
    capabilities: {
      gpuAccelerated: true,
      workerBased: true,
      offscreenCanvas: true,
      browsers: ['Chrome 94+', 'Edge 94+', 'Opera 80+']
    }
  },
  {
    name: 'Canvas2D',
    strategy: CanvasSource,
    isSupported: () => {
      // Canvas 2D is universally supported
      try {
        const canvas = document.createElement('canvas');
        return !!canvas.getContext('2d');
      } catch (e) {
        return false;
      }
    },
    priority: 2,
    description: 'CPU-based frame extraction via Canvas 2D API',
    capabilities: {
      gpuAccelerated: false,
      workerBased: false,
      offscreenCanvas: false,
      browsers: ['All browsers']
    }
  }
];

/**
 * SourceProviderContract - Interface that all video sources must implement.
 * 
 * Required Methods:
 * - constructor(videoElement, config) - Initialize with video element and engine config
 * - static isSupported() - Return true if this source is available in current environment
 * - async initialize() - Perform setup (create canvas, start worker, etc.)
 * - async start() - Begin frame capture loop
 * - async stop() - Pause frame capture (can be resumed with start())
 * - dispose() - Clean up all resources (cannot be restarted)
 * 
 * Required Properties:
 * - isRunning - Boolean indicating if source is actively capturing frames
 * - config - Configuration object passed to constructor
 */
export class SourceProviderContract {
  constructor(videoElement, config) {
    throw new Error('SourceProviderContract is abstract - implement in concrete class');
  }
  
  static isSupported() {
    throw new Error('isSupported() must be implemented');
  }
  
  async initialize() {
    throw new Error('initialize() must be implemented');
  }
  
  async start() {
    throw new Error('start() must be implemented');
  }
  
  async stop() {
    throw new Error('stop() must be implemented');
  }
  
  dispose() {
    throw new Error('dispose() must be implemented');
  }
}
