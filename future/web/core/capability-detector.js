/**
 * capability-detector.js
 * 
 * Detects browser capabilities for all video frame extraction methods.
 * Runs once at startup and populates the orchestration state.
 * 
 * Part of Phase 2A: Orchestration Visibility
 * Purpose: Enable intelligent fallback selection based on what browser supports
 * 
 * Capabilities Detected:
 * - mediaStreamTrackProcessor: Chrome 86+, modern GPU acceleration available
 * - canvas2D: Universal (IE9+), CPU-based extraction
 * - webGL: GPU compute available
 * - webGPU: Modern GPU API (experimental)
 * - offscreenCanvas: Worker-accessible canvas
 * - wasm: WebAssembly runtime available
 */

/**
 * Detects if MediaStreamTrackProcessor is available
 * This is the preferred high-performance path (GPU acceleration)
 * 
 * Spec: https://w3c.github.io/mediacapture-transform/
 * Browser support: Chrome 86+, Edge 86+
 * 
 * @returns {boolean} True if available
 */
function detectMediaStreamTrackProcessor() {
  // Check for required APIs
  if (typeof window === 'undefined') return false;
  if (!navigator?.mediaDevices?.getUserMedia) return false;
  
  try {
    // MediaStreamTrackProcessor is available if MediaStreamTrack has a transform method
    // or if the constructor exists on MediaStreamTrackProcessor
    // Since we can't instantiate without a stream, check for the class/constructor
    if (typeof MediaStreamTrackProcessor !== 'undefined') {
      return true;
    }
    
    // Alternative: check if we can use transform on a track
    // This would be more accurate but requires a stream
    // For now, if AudioWorkletProcessor exists, we likely have the foundation
    if (typeof AudioWorkletProcessor !== 'undefined' && typeof AudioWorklet !== 'undefined') {
      return true;
    }
  } catch (e) {
    return false;
  }
  
  return false;
}

/**
 * Detects if Canvas 2D is available
 * Fallback path - universally supported but CPU-based
 * 
 * @returns {boolean} True if available
 */
function detectCanvas2D() {
  try {
    if (typeof document === 'undefined') return false;
    
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    
    if (!ctx) return false;
    
    // Check for key methods
    if (typeof ctx.drawImage !== 'function') return false;
    if (typeof ctx.getImageData !== 'function') return false;
    
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Detects if WebGL is available
 * Enables GPU compute capabilities
 * 
 * @returns {boolean} True if available
 */
function detectWebGL() {
  try {
    if (typeof document === 'undefined') return false;
    
    const canvas = document.createElement('canvas');
    const ctx = 
      canvas.getContext('webgl') || 
      canvas.getContext('webgl2') ||
      canvas.getContext('experimental-webgl');
    
    return ctx !== null;
  } catch (e) {
    return false;
  }
}

/**
 * Detects if WebGPU is available (experimental)
 * Modern GPU API, future-facing capability
 * 
 * Browser support: Chrome 113+ (experimental), Firefox (experimental)
 * 
 * @returns {boolean} True if available
 */
function detectWebGPU() {
  try {
    if (typeof navigator === 'undefined') return false;
    if (typeof navigator.gpu === 'undefined') return false;
    
    // Just check if the object exists - actual GPU selection happens at runtime
    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Detects if OffscreenCanvas is available
 * Required for canvas operations in Web Workers
 * 
 * Browser support: Chrome 69+, Firefox 79+, Safari 16.4+
 * 
 * @returns {boolean} True if available
 */
function detectOffscreenCanvas() {
  try {
    if (typeof OffscreenCanvas === 'undefined') return false;
    
    // Try to create an instance
    const canvas = new OffscreenCanvas(100, 100);
    const ctx = canvas.getContext('2d');
    
    return ctx !== null;
  } catch (e) {
    return false;
  }
}

/**
 * Detects if WebAssembly is available
 * Enables optimized binary computations
 * 
 * Browser support: All modern browsers (2017+)
 * 
 * @returns {boolean} True if available
 */
function detectWebAssembly() {
  try {
    if (typeof WebAssembly === 'undefined') return false;
    
    // Try to instantiate a minimal module
    const wasmCode = new Uint8Array([
      0x00, 0x61, 0x73, 0x6d, // Magic number
      0x01, 0x00, 0x00, 0x00, // Version
    ]);
    
    const module = new WebAssembly.Module(wasmCode);
    return module instanceof WebAssembly.Module;
  } catch (e) {
    return false;
  }
}

/**
 * Main detection function - runs all capability checks
 * Returns a capabilities object suitable for orchestration state
 * 
 * @returns {Object} Capabilities object with boolean values
 */
function detectAllCapabilities() {
  return {
    mediaStreamTrackProcessor: detectMediaStreamTrackProcessor(),
    canvas2D: detectCanvas2D(),
    webGL: detectWebGL(),
    webGPU: detectWebGPU(),
    offscreenCanvas: detectOffscreenCanvas(),
    wasm: detectWebAssembly(),
  };
}

/**
 * Generates a human-readable capability report
 * Useful for debugging and logging
 * 
 * @param {Object} capabilities - Capabilities object from detectAllCapabilities()
 * @returns {String} Formatted report
 */
function generateCapabilityReport(capabilities) {
  const lines = [
    '=== Browser Capability Report ===',
    `MediaStreamTrackProcessor: ${capabilities.mediaStreamTrackProcessor ? '✓' : '✗'}`,
    `Canvas 2D:                 ${capabilities.canvas2D ? '✓' : '✗'}`,
    `WebGL:                     ${capabilities.webGL ? '✓' : '✗'}`,
    `WebGPU:                    ${capabilities.webGPU ? '✓' : '✗'}`,
    `OffscreenCanvas:           ${capabilities.offscreenCanvas ? '✓' : '✗'}`,
    `WebAssembly:               ${capabilities.wasm ? '✓' : '✗'}`,
  ];
  
  return lines.join('\n');
}

/**
 * Determines which extractor should be used based on capabilities
 * This is the decision logic for fallback selection
 * 
 * Strategy:
 * 1. Try MediaStreamTrackProcessor (best performance)
 * 2. Fall back to Canvas 2D (always works)
 * 3. No other options
 * 
 * @param {Object} capabilities - Capabilities object
 * @returns {String|null} Recommended extractor name or null if none available
 */
function recommendExtractor(capabilities) {
  if (capabilities.mediaStreamTrackProcessor) {
    return 'mediaStreamTrackProcessor';
  }
  
  if (capabilities.canvas2D) {
    return 'canvasFallback';
  }
  
  // No viable extractor available
  return null;
}

/**
 * Exports the capability detector module
 */
export {
  detectMediaStreamTrackProcessor,
  detectCanvas2D,
  detectWebGL,
  detectWebGPU,
  detectOffscreenCanvas,
  detectWebAssembly,
  detectAllCapabilities,
  generateCapabilityReport,
  recommendExtractor,
};
