// video/source/canvas-source.js
// Canvas 2D-based video frame source (ADR-0011 Violation 10)
// CPU-based frame extraction - first-class strategy, not fallback.

import { structuredLog } from '../../utils/logging.js';

/**
 * CanvasSource - Canvas 2D-based frame capture strategy.
 * 
 * Uses requestAnimationFrame + Canvas 2D context to extract video frames.
 * Performance characteristics:
 * - CPU-based rendering (no GPU acceleration)
 * - Main thread execution (blocks on long frame processing)
 * - ~15fps target via throttling
 * - Universal browser support
 * 
 * Best for:
 * - Firefox (no MediaStreamTrackProcessor support)
 * - Safari/iOS (no MediaStreamTrackProcessor support)
 * - Browsers without OffscreenCanvas
 * 
 * Contract: Implements SourceProviderContract from video-source-manifest.js
 */
export class CanvasSource {
  constructor(videoElement, config) {
    this.videoElement = videoElement;
    this.config = config;
    this.engine = config.engine;
    
    this.canvas = null;
    this.ctx = null;
    this.frameCounter = 0;
    this.isRunning = false;
    this.lastFrameTime = 0;
    this.minFrameInterval = 66; // ~15fps target (in milliseconds)
    this.captureLoopBound = null;
  }
  
  /**
   * Check if Canvas 2D is supported (should always be true)
   */
  static isSupported() {
    try {
      const canvas = document.createElement('canvas');
      return !!canvas.getContext('2d');
    } catch (e) {
      return false;
    }
  }
  
  /**
   * Initialize canvas and 2D context
   */
  async initialize() {
    // Update engine state to track canvas usage (for timeout adaptation)
    if (this.engine?.state?.videoCapture) {
      this.engine.state.videoCapture.usingCanvas = true;
      this.engine.state.videoCapture.detectedAt = Date.now();
      structuredLog('DEBUG', 'Canvas source: State updated for timeout adaptation', {
        timestamp: this.engine.state.videoCapture.detectedAt
      });
    }
    
    // Create canvas sized to video element
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.videoElement.videoWidth || 640;
    this.canvas.height = this.videoElement.videoHeight || 480;
    
    this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    
    // Retry logic if context is null (e.g. memory pressure) R271125-mp please explain the memory pressure case
    if (!this.ctx) {
      for (let i = 0; i < 3; i++) {
        structuredLog('WARN', `Canvas source: Context creation failed, retrying (${i+1}/3)`);
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
        if (this.ctx) break;
      }
    }

    if (!this.ctx) {
      throw new Error('Canvas 2D context not available after retries');
    }
    
    // Bind capture loop for consistent `this` reference
    this.captureLoopBound = this.captureFrame.bind(this);
    
    structuredLog('INFO', 'Canvas source initialized', {
      width: this.canvas.width,
      height: this.canvas.height,
      targetFps: Math.round(1000 / this.minFrameInterval)
    });
    
    return true;
  }
  
  /**
   * Start frame capture loop
   */
  async start() {
    if (this.isRunning) {
      structuredLog('WARN', 'Canvas source: Already running');
      return;
    }
    
    this.isRunning = true;
    this.lastFrameTime = 0; // Reset throttle timer
    requestAnimationFrame(this.captureLoopBound);
    
    structuredLog('INFO', 'Canvas source: Frame capture started');
  }
  
  /**
   * Stop frame capture loop (can be resumed with start())
   */
  async stop() {
    this.isRunning = false;
    structuredLog('DEBUG', 'Canvas source: Frame capture stopped');
  }
  
  /**
   * Clean up all resources (cannot be restarted)
   */
  dispose() {
    this.isRunning = false;
    this.ctx = null;
    this.canvas = null;
    this.captureLoopBound = null;
    structuredLog('DEBUG', 'Canvas source: Disposed');
  }
  
  /**
   * Main frame capture loop (called via requestAnimationFrame)
   */
  async captureFrame() {
    if (!this.isRunning) return;
    
    // Throttle to target FPS
    const now = performance.now();
    if (now - this.lastFrameTime < this.minFrameInterval) {
      requestAnimationFrame(this.captureLoopBound);
      return;
    }
    this.lastFrameTime = now;
    
    try {
      // Update canvas size if video element dimensions changed
      if (this.canvas.width !== this.videoElement.videoWidth || 
          this.canvas.height !== this.videoElement.videoHeight) {
        this.canvas.width = this.videoElement.videoWidth || 320;
        this.canvas.height = this.videoElement.videoHeight || 240;
        structuredLog('DEBUG', 'Canvas source: Video size changed', {
          width: this.canvas.width,
          height: this.canvas.height
        });
      }
      
      // Draw current video frame to canvas
      if (!this.ctx) {
        // Should not happen if initialize succeeded, but possible if context lost
        structuredLog('ERROR', 'Canvas source: Context lost during capture');
        this.stop();
        return;
      }
      this.ctx.drawImage(this.videoElement, 0, 0, this.canvas.width, this.canvas.height);
      
      // Extract RGBA image data
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      this.frameCounter++;
      
      // Invoke frame processing callback (provided by frame-processor.js)
      if (this.config.onFrame && typeof this.config.onFrame === 'function') {
        await this.config.onFrame({
          type: 'frame',
          payload: {
            frameId: this.frameCounter,
            width: this.canvas.width,
            height: this.canvas.height,
            imageDataBuffer: imageData.data.buffer
          }
        });
      }
      
      // Sample log every 30th frame
      if (this.frameCounter % 30 === 0) {
        structuredLog('DEBUG', 'Canvas source: Frame captured', {
          frameId: this.frameCounter,
          width: this.canvas.width,
          height: this.canvas.height
        });
      }
      
    } catch (error) {
      structuredLog('ERROR', 'Canvas source: Frame capture error', {
        error: error?.message || String(error),
        frameId: this.frameCounter
      });
    }
    
    // Continue loop if still running
    if (this.isRunning) {
      requestAnimationFrame(this.captureLoopBound);
    }
  }
}
