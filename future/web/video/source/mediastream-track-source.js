// video/source/mediastream-track-source.js
// MediaStreamTrackProcessor-based video frame source (ADR-0011 Violation 10)
// GPU-accelerated frame extraction via Web Worker and OffscreenCanvas.

import { structuredLog } from '../../utils/logging.js';

/**
 * MediaStreamTrackSource - GPU-accelerated frame capture strategy.
 * 
 * Uses MediaStreamTrackProcessor API + Web Worker + OffscreenCanvas for high-performance
 * frame extraction with minimal main thread impact.
 * 
 * Performance characteristics:
 * - GPU-accelerated rendering (OffscreenCanvas)
 * - Off-thread execution (Web Worker)
 * - Full video framerate (30-60fps)
 * - Chrome 94+, Edge 94+ only
 * 
 * Architecture:
 * - Main thread: Creates canvas, initializes worker, registers message handler
 * - Web Worker: Receives MediaStreamTrackProcessor readable stream, extracts frames
 * - OffscreenCanvas: Transferred to worker for GPU rendering
 * 
 * Contract: Implements SourceProviderContract from video-source-manifest.js
 */
export class MediaStreamTrackSource {
  constructor(videoElement, config) {
    this.videoElement = videoElement;
    this.config = config;
    this.engine = config.engine;
    
    this.worker = null;
    this.canvas = null;
    this.isRunning = false;
    this.frameCounter = 0;
  }
  
  /**
   * Check if MediaStreamTrackProcessor API is available
   */
  static isSupported() {
    return typeof MediaStreamTrackProcessor !== 'undefined' &&
           typeof VideoFrame !== 'undefined' &&
           'transferControlToOffscreen' in HTMLCanvasElement.prototype;
  }
  
  /**
   * Initialize worker, canvas, and MediaStreamTrackProcessor
   */
  async initialize() {
    // Create canvas for video dimensions
    this.canvas = document.createElement('canvas');
    this.canvas.width = this.videoElement.videoWidth || 640;
    this.canvas.height = this.videoElement.videoHeight || 480;
    
    structuredLog('DEBUG', 'MediaStreamTrack source: Canvas created', {
      width: this.canvas.width,
      height: this.canvas.height
    });
    
    // Transfer canvas to offscreen for worker
    const offscreenCanvas = this.canvas.transferControlToOffscreen();
    
    // Extract video track from MediaStream
    const [track] = this.videoElement.srcObject.getVideoTracks();
    if (!track) {
      throw new Error('No video track found in MediaStream');
    }
    
    // Create MediaStreamTrackProcessor and get readable stream
    const trackProcessor = new MediaStreamTrackProcessor({ track });
    const streamReader = trackProcessor.readable;
    
    // Initialize frame provider worker
    this.worker = new Worker(
      new URL('../workers/frame-provider-worker.js', import.meta.url),
      { type: 'module' }
    );
    
    // Register worker for dev panel access
    if (this.config.registerWorker) {
      this.config.registerWorker(this.worker, 'FrameProvider');
    }
    
    // Expose worker globally for dev panel throttling controls
    window.frameProviderWorker = this.worker;
    
    // Set up message handler for frames
    this.worker.onmessage = async (event) => {
      const { type, payload } = event.data;
      
      // Only handle frame messages
      if (type !== 'frame') return;
      
      this.frameCounter++;
      
      // Invoke frame processing callback (provided by frame-processor.js)
      if (this.config.onFrame && typeof this.config.onFrame === 'function') {
        await this.config.onFrame(event.data);
      }
    };
    
    // Send init message with offscreen canvas and stream reader
    this.worker.postMessage(
      { type: 'init', payload: { canvas: offscreenCanvas, streamReader } },
      [offscreenCanvas, streamReader]
    );
    
    structuredLog('DEBUG', 'MediaStreamTrack source: Worker initialized');
    
    // Apply quality profile throttling if configured
    await this.applyQualityProfile();
    
    structuredLog('INFO', 'MediaStreamTrack source initialized', {
      width: this.canvas.width,
      height: this.canvas.height,
      workerType: 'OffscreenCanvas + MediaStreamTrackProcessor'
    });
    
    return true;
  }
  
  /**
   * Apply quality profile throttling to worker (if configured)
   */
  async applyQualityProfile() {
    if (!this.engine || !this.worker) return;
    
    const stateAtInit = this.engine.getState ? this.engine.getState() : {};
    const orchestration = stateAtInit.orchestration || {};
    const settingsState = stateAtInit.settings || {};
    const profileName = settingsState.qualityProfileOverride || 
                       orchestration?.qualityProfile?.name || 
                       'auto';
    const profile = orchestration?.qualityProfiles?.[profileName] || 
                   orchestration?.qualityProfile || 
                   null;
    
    if (profile && profile.fpsTarget && profile.targetWidth) {
      try {
        const srcWidth = this.canvas.width || 
                        (this.videoElement && this.videoElement.videoWidth) || 
                        320;
        const srcFps = orchestration?.metrics?.fps || 30; // Fallback when metrics not yet populated
        const targetWidth = profile.targetWidth || 160;
        const scale = Math.max(0.1, Math.min(1.0, (targetWidth / srcWidth)));
        const skipRate = Math.max(1, Math.ceil(srcFps / (profile.fpsTarget || 3)));
        
        // Apply throttling to worker
        this.worker.postMessage({ 
          type: 'setResolutionScale', 
          payload: { scale } 
        });
        this.worker.postMessage({ 
          type: 'setFrameSkipRate', 
          payload: { skipRate } 
        });
        
        // Persist in engine state
        try { 
          this.engine.setState({ 
            frameProviderThrottle: { skipRate, scale } 
          }); 
        } catch (e) {}
        
        try { 
          this.engine.setState({ 
            settings: { 
              ...settingsState, 
              updateInterval: Math.round(1000 / (profile.fpsTarget || 3)) 
            } 
          }); 
        } catch (e) {}
        
        structuredLog('INFO', 'MediaStreamTrack source: Applied quality profile throttle', {
          profileName,
          scale,
          skipRate
        });
      } catch (error) {
        structuredLog('WARN', 'MediaStreamTrack source: Failed to apply quality profile throttle', {
          profileName,
          error: error?.message || String(error)
        });
      }
    }
  }
  
  /**
   * Start frame capture (worker auto-starts after init)
   */
  async start() {
    this.isRunning = true;
    
    // Send start message to worker to begin frame loop
    if (this.worker) {
      this.worker.postMessage({ type: 'start' });
    }
    
    structuredLog('INFO', 'MediaStreamTrack source: Frame capture started (worker-based)');
  }
  
  /**
   * Stop frame capture
   */
  async stop() {
    this.isRunning = false;
    
    if (this.worker) {
      this.worker.postMessage({ type: 'stop' });
    }
    
    structuredLog('DEBUG', 'MediaStreamTrack source: Frame capture stopped');
  }
  
  /**
   * Clean up worker and resources (cannot be restarted)
   */
  dispose() {
    this.isRunning = false;
    
    if (this.worker) {
      this.worker.postMessage({ type: 'dispose' });
      this.worker.terminate();
      this.worker = null;
    }
    
    // Clear global reference
    if (window.frameProviderWorker === this.worker) {
      window.frameProviderWorker = null;
    }
    
    this.canvas = null;
    
    structuredLog('DEBUG', 'MediaStreamTrack source: Disposed');
  }
}
