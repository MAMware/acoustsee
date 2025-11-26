/**
 * Worker Channel Manager - Source-Agnostic Frame Routing Optimization
 * 
 * Issue #2 Fix: Triangle Routing Performance Bottleneck
 * 
 * PROBLEM:
 * [Any Source Strategy] → onFrameCallback → Main Thread → FrameConductor → Motion Worker
 * This pattern blocks Main Thread for serialization/deserialization per frame,
 * causing audio stutter and battery drain.
 * 
 * SOLUTION:
 * This manager sits at the ORCHESTRATION layer (between source output and FrameConductor),
 * agnostic to which Video Source Strategy (CanvasSource, MediaStreamTrackSource) is active.
 * 
 * ARCHITECTURE (Source-Agnostic):
 * 1. Source Strategy produces frames via its interface (onFrameCallback)
 * 2. FrameConductor receives frames through the existing callback contract
 * 3. WorkerChannelManager intercepts at FrameConductor level BEFORE worker dispatch
 * 4. Uses MessageChannel for direct-to-worker transfer when available
 * 5. Falls back to standard postMessage when MessageChannel unavailable
 * 
 * KEY DESIGN PRINCIPLE:
 * This optimization lives at the ORCHESTRATION layer, NOT inside source strategies.
 * Source strategies remain pure implementations of their interface contract.
 * The Manifest Strategy hierarchy (CanvasSource, MediaStreamTrackSource) is preserved.
 * 
 * COMPATIBILITY:
 * - Chrome 54+, Firefox 41+, Safari 10.1+, Edge 15+
 * - Graceful fallback to standard worker communication
 * 
 * PERFORMANCE GAINS:
 * - Eliminates redundant structured clone operations
 * - Preserves ImageBitmap transfer semantics (zero-copy when supported)
 * - Main thread only handles orchestration, not hot-path frame data
 */

import { structuredLog } from '../../utils/logging.js';

/**
 * Check if MessageChannel API is available
 * @returns {boolean}
 */
function isMessageChannelSupported() {
  return typeof MessageChannel !== 'undefined';
}

/**
 * WorkerChannelManager: Orchestration-layer optimization for frame routing
 * 
 * This manager is SOURCE-AGNOSTIC - it doesn't know or care which video source
 * strategy is producing frames. It only knows how to efficiently route frames
 * from the orchestration layer to workers.
 * 
 * Integration point: FrameConductor (NOT inside source strategies)
 */
class WorkerChannelManager {
  constructor() {
    /** @type {MessageChannel | null} */
    this._channel = null;
    
    /** @type {MessagePort | null} - Port kept by manager for sending frames */
    this._senderPort = null;
    
    /** @type {boolean} - Whether direct channel is active */
    this._isActive = false;
    
    /** @type {boolean} - Feature flag for enabling optimization */
    this._isEnabled = false;
    
    /** @type {number} - Frames routed through direct channel */
    this._frameCount = 0;
    
    /** @type {number} - Errors encountered */
    this._errorCount = 0;
    
    /** @type {Worker | null} - Reference to motion worker (for diagnostics) */
    this._motionWorker = null;
  }
  
  /**
   * Check if MessageChannel optimization is supported
   * @returns {boolean}
   */
  static isSupported() {
    return isMessageChannelSupported();
  }
  
  /**
   * Enable the direct channel optimization
   * Call this from FrameConductor during initialization
   * @param {boolean} enabled
   */
  setEnabled(enabled) {
    this._isEnabled = enabled && WorkerChannelManager.isSupported();
    
    structuredLog('INFO', 'WorkerChannelManager: optimization state', {
      enabled: this._isEnabled,
      supported: WorkerChannelManager.isSupported(),
      reason: enabled ? 'user/config enabled' : 'disabled'
    });
  }
  
  /**
   * Check if we should use direct channel routing
   * @returns {boolean}
   */
  shouldUseDirect() {
    return this._isEnabled && this._isActive && this._senderPort !== null;
  }
  
  /**
   * Connect to a motion worker for direct frame routing
   * 
   * Call this from FrameConductor when initializing the motion worker.
   * The worker must handle 'connectChannel' message type.
   * 
   * @param {Worker} motionWorker - The motion detection worker
   * @returns {boolean} - Whether connection succeeded
   */
  connectToMotionWorker(motionWorker) {
    if (!this._isEnabled) {
      structuredLog('DEBUG', 'WorkerChannelManager: skipping connection (disabled)');
      return false;
    }
    
    if (!WorkerChannelManager.isSupported()) {
      structuredLog('WARN', 'WorkerChannelManager: MessageChannel not supported');
      return false;
    }
    
    if (!motionWorker) {
      structuredLog('ERROR', 'WorkerChannelManager: invalid worker reference');
      return false;
    }
    
    try {
      // Create fresh channel
      this._channel = new MessageChannel();
      this._senderPort = this._channel.port1;
      const receiverPort = this._channel.port2;
      
      // Transfer receiver port to motion worker
      motionWorker.postMessage(
        {
          type: 'connectChannel',
          payload: {
            port: receiverPort,
            role: 'frameReceiver',
            channelName: 'orchestration-to-motion'
          }
        },
        [receiverPort]  // Transfer ownership
      );
      
      this._motionWorker = motionWorker;
      this._isActive = true;
      this._frameCount = 0;
      this._errorCount = 0;
      
      structuredLog('INFO', 'WorkerChannelManager: direct channel established', {
        channelName: 'orchestration-to-motion'
      });
      
      return true;
      
    } catch (error) {
      structuredLog('ERROR', 'WorkerChannelManager: failed to connect', {
        error: error.message
      });
      this._cleanup();
      return false;
    }
  }
  
  /**
   * Route a frame to motion worker via direct channel
   * 
   * Call this from FrameConductor instead of worker.postMessage when
   * shouldUseDirect() returns true.
   * 
   * @param {ImageBitmap} frameBitmap - The frame to send
   * @param {object} metadata - Frame metadata (timestamp, frameIndex, etc.)
   * @returns {boolean} - Whether send succeeded
   */
  sendFrame(frameBitmap, metadata) {
    if (!this.shouldUseDirect()) {
      return false;  // Caller should fall back to standard postMessage
    }
    
    try {
      // Send via direct channel with transfer
      this._senderPort.postMessage(
        {
          type: 'processFrame',
          payload: {
            frame: frameBitmap,
            ...metadata
          }
        },
        [frameBitmap]  // Transfer ownership (zero-copy)
      );
      
      this._frameCount++;
      
      // Sample logging to avoid flooding
      if (this._frameCount % 300 === 0) {
        structuredLog('DEBUG', 'WorkerChannelManager: frame routing stats', {
          frameCount: this._frameCount,
          errorCount: this._errorCount
        });
      }
      
      return true;
      
    } catch (error) {
      this._errorCount++;
      
      // Log errors but don't spam
      if (this._errorCount <= 3 || this._errorCount % 100 === 0) {
        structuredLog('WARN', 'WorkerChannelManager: frame send failed', {
          error: error.message,
          errorCount: this._errorCount
        });
      }
      
      // If too many errors, disable direct channel
      if (this._errorCount > 10) {
        structuredLog('ERROR', 'WorkerChannelManager: too many errors, disabling', {
          errorCount: this._errorCount
        });
        this._isActive = false;
      }
      
      return false;  // Caller should fall back to standard postMessage
    }
  }
  
  /**
   * Get status for diagnostics and dev panel
   * @returns {object}
   */
  getStatus() {
    return {
      isSupported: WorkerChannelManager.isSupported(),
      isEnabled: this._isEnabled,
      isActive: this._isActive,
      hasChannel: this._channel !== null,
      hasSenderPort: this._senderPort !== null,
      frameCount: this._frameCount,
      errorCount: this._errorCount,
      canUseDirect: this.shouldUseDirect()
    };
  }
  
  /**
   * Clean up internal state
   * @private
   */
  _cleanup() {
    try {
      if (this._senderPort) {
        this._senderPort.close();
      }
    } catch (e) {
      // Ignore close errors
    }
    
    this._channel = null;
    this._senderPort = null;
    this._motionWorker = null;
    this._isActive = false;
  }
  
  /**
   * Dispose all resources
   * Call this from FrameConductor.dispose()
   */
  dispose() {
    structuredLog('DEBUG', 'WorkerChannelManager: disposing', {
      frameCount: this._frameCount,
      errorCount: this._errorCount
    });
    
    this._cleanup();
    this._isEnabled = false;
    this._frameCount = 0;
    this._errorCount = 0;
  }
}

// Export singleton for use by FrameConductor
export const workerChannelManager = new WorkerChannelManager();

// Export class for testing
export { WorkerChannelManager };
