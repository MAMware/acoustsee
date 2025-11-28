/**
 * worker-contract.js - Unified Message Envelope & Validation for All Video Workers
 * 
 * This file defines the canonical message contract used by ALL video workers (motion,
 * image, depth, feature detection, etc.). It ensures:
 * 
 * 1. Type Safety: All outbound messages follow a unified envelope structure
 * 2. Capability Declaration: Workers declare what they actually computed
 * 3. Versioning: Message format can evolve without breaking consumers
 * 4. Debug Metadata: Support for structured logging and performance monitoring
 * 
 * Usage in Workers:
 *   const contract = WorkerContract.createResult(...)
 *   self.postMessage(contract)
 * 
 * Usage in Main Thread (frame-conductor.js):
 *   WorkerContract.validate(e.data)
 *   const capabilities = WorkerContract.getCapabilities(e.data)
 * 
 * Message Versions:
 * - 2.0: Current stable version (all workers)
 * - Future: Additional capabilities (spatial audio, etc.)
 */

// ============================================================================
// Message Envelope Types & Capabilities
// ============================================================================

const MESSAGE_VERSION = '2.0';

/**
 * Standard capabilities that workers can declare
 */
const CAPABILITIES = {
  // Motion/Flow capabilities
  FLOW_VECTORS: 'flow_vectors',           // u,v optical flow per grid cell
  MOTION_MAGNITUDE: 'motion_magnitude',   // Flow magnitude for intensity
  MOTION_CONFIDENCE: 'motion_confidence', // Confidence in motion estimate
  YMOTION_ONLY: 'ymotion_only',          // Y-plane motion (Flow mode)
  
  // Depth/Spatial capabilities
  DEPTH_MAP: 'depth_map',                 // Pseudo or CNN depth
  DEPTH_CONFIDENCE: 'depth_confidence',   // Confidence in depth
  
  // Texture/Surface capabilities
  TEXTURE_ANALYSIS: 'texture_analysis',   // Gabor filter response
  SURFACE_PROPERTIES: 'surface_properties',
  
  // Semantic capabilities (optional)
  SEMANTIC_DETECTION: 'semantic_detection', // Object detection
  
  // Spatial awareness
  EGOMOTION_ANALYSIS: 'egomotion_analysis', // User vs object motion
  COMPLEXITY_ASSESSMENT: 'complexity_assessment', // Scene complexity
  
  // Audio-specific
  BPM_INFERENCE: 'bpm_inference',         // User activity tempo
  SPATIALIZATION: 'spatialization',       // HRTF/pan data
};

/**
 * Worker types for identification
 */
const WORKER_TYPES = {
  FAST_MOTION: 'fast-motion-worker',
  GRID_AGGREGATOR: 'fast-grid-aggregator',
  PAN_INTENSITY_MAPPER: 'pan-intensity-mapper',
  TRIANGULAR_ZONE_MAPPER: 'triangular-zone-mapper',
  
  IMAGE: 'image-worker',
  DEPTH: 'depth-worker',
  SEMANTIC: 'semantic-detector',
  TEXTURE: 'gabor-texture',
  
  EGOMOTION: 'egomotion-analyzer',
  MOTION_MONITOR: 'motion-monitor',
};

// ============================================================================
// Contract Implementation
// ============================================================================

export class WorkerContract {
  /**
   * Create a properly-formed result message that can be posted back to main thread
   * 
   * @param {string} workerName - WORKER_TYPES value identifying this worker
   * @param {string} mode - 'flow' | 'focus' | 'hybrid'
   * @param {Array<string>} capabilities - CAPABILITIES values this result contains
   * @param {Object} result - The actual result data (cues, grids, features, etc.)
   * @param {Object} debugMetadata - Optional: { processingTimeMs, sampleRate, etc. }
   * @returns {Object} Message ready to postMessage()
   */
  static createResult(workerName, mode, capabilities, result, debugMetadata = {}) {
    return {
      type: 'processingResult',
      version: MESSAGE_VERSION,
      workerName,
      mode,
      capabilities: Array.isArray(capabilities) ? capabilities : [capabilities],
      result,
      timestamp: Date.now(),
      debugMetadata: {
        ...debugMetadata,
        createdAt: new Date().toISOString(),
      },
    };
  }

  /**
   * Create an error message to post back to main thread
   * 
   * @param {string} workerName - WORKER_TYPES value
   * @param {string} errorMessage - Human-readable error
   * @param {Error} error - Optional: the actual error object
   * @returns {Object} Error message ready to postMessage()
   */
  static createError(workerName, errorMessage, error = null) {
    return {
      type: 'processingError',
      version: MESSAGE_VERSION,
      workerName,
      error: errorMessage,
      stack: error?.stack,
      timestamp: Date.now(),
    };
  }

  /**
   * Validate that an inbound message matches the contract
   * 
   * Returns a validation result instead of throwing exceptions.
   * This allows frame-conductor to handle validation failures gracefully
   * and log them via structuredLog() in the main thread.
   * 
   * @param {Object} message - Message received from worker
   * @returns {Object} { valid: boolean, error?: string }
   */
  static validate(message) {
    if (!message) {
      return { valid: false, error: 'Message is null/undefined' };
    }
    
    if (message.type === 'processingError') {
      // Errors just need type, workerName, and error field
      if (!message.workerName || !message.error) {
        return { valid: false, error: 'Error message missing workerName or error field' };
      }
      return { valid: true };
    }

    if (message.type !== 'processingResult') {
      return { valid: false, error: `Unknown message type: ${message.type}` };
    }

    if (message.version !== MESSAGE_VERSION) {
      // Version mismatch is a warning but not fatal—allow processing
      // Frame-conductor will log this via structuredLog
      return { 
        valid: true, 
        warning: `Message version mismatch. Expected ${MESSAGE_VERSION}, got ${message.version}` 
      };
    }

    if (!message.workerName) {
      return { valid: false, error: 'Message missing workerName' };
    }
    
    if (!message.mode) {
      return { valid: false, error: 'Message missing mode' };
    }
    
    if (!Array.isArray(message.capabilities)) {
      return { valid: false, error: 'Message capabilities must be an array' };
    }
    
    if (!message.result) {
      return { valid: false, error: 'Message missing result' };
    }
    
    if (typeof message.timestamp !== 'number') {
      return { valid: false, error: 'Message missing timestamp' };
    }

    return { valid: true };
  }

  /**
   * Extract capabilities from a message
   * 
   * Returns empty array if message is invalid or missing capabilities
   * (no exceptions thrown)
   * 
   * @param {Object} message - Message (may be invalid)
   * @returns {Array<string>} List of CAPABILITIES values, empty if none
   */
  static getCapabilities(message) {
    return Array.isArray(message?.capabilities) ? message.capabilities : [];
  }

  /**
   * Check if a message has a specific capability
   * 
   * Returns false gracefully if message or capabilities are missing
   * (no exceptions thrown)
   * 
   * @param {Object} message - Message to check (may be invalid)
   * @param {string} capability - CAPABILITIES value to check
   * @returns {boolean} True if capability is present
   */
  static hasCapability(message, capability) {
    if (!message || !Array.isArray(message.capabilities)) {
      return false;
    }
    return message.capabilities.includes(capability);
  }

  /**
   * Extract result data from a message (common pattern in frame conductor)
   * 
   * Returns null if message is invalid or missing result field
   * (no exceptions thrown)
   * 
   * @param {Object} message - Message (may be invalid)
   * @returns {Object|null} The result field, or null if missing
   */
  static getResult(message) {
    return message?.result || null;
  }

  /**
   * Get debug metadata for performance monitoring
   * 
   * @param {Object} message - Message
   * @returns {Object} Debug metadata
   */
  static getDebugMetadata(message) {
    return message.debugMetadata || {};
  }
}

/**
 * Re-export constants for convenience
 */
export { MESSAGE_VERSION, CAPABILITIES, WORKER_TYPES };
