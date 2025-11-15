// R91125 lets check all comments for validity and update them if needed
// Enhanced fast-motion-worker with Lucas-Kanade optical flow: receives Y-plane ArrayBuffer and returns compact moving regions with direction.
// Flow Mode optimized: Y-plane only, minimal latency (<15ms target)
// Integrates basic optical flow for direction estimation (u, v) alongside intensity, enhancing motion detection for applications like AcoustSee.
// Uses vanilla JavaScript convolution and matrix solving for compatibility and performance in web workers.
// Maintains adaptive thresholding for robustness in varying conditions.
// Outputs coords, intensity (based on flow magnitude), u (horizontal flow), and v (vertical flow) as transferable buffers.
// v1.0 (2025-10-19): Flow mode variant for Phase 2. Created for responsive audio synthesis.
// v0.6 (2025-10-17): Added paradigm-aware gridSize support and dynamic grid configuration. By Claude Haiku 4.5
// v0.5 Created by MAMware and Grok (xAI.com)
// Enhanced with Lucas-Kanade optical flow based on research in motion-worker.js.md, REV 2025-10-05.

// Add this import at the top if not present
import { WorkerContract, WORKER_TYPES, CAPABILITIES } from './worker-contract.js';

/**
 * Adaptive Motion Normalization
 * 
 * Prevents clipping on fast motion by tracking recent maximum magnitude
 * and normalizing relative to that maximum. This preserves expressiveness:
 * - Slow session (hand gestures) → sensitive (small motions audible)
 * - Fast session (arm swings) → tolerant (full dynamic range preserved)
 * 
 * Example:
 * - Slow session: recentMax=1.2, magnitude=0.3 → (0.3/1.2)×255 = 64 (25% volume)
 * - Fast session: recentMax=5.0, magnitude=3.0 → (3.0/5.0)×255 = 153 (60% volume, not clipped!)
 * 
 * See ADR 0009 for complete rationale and design.
 */
class AdaptiveNormalizer {
  /**
   * @param {number} windowSize - History window size in frames (default: 60 = 1 sec at 60fps)
   * @param {number} minMax - Minimum recentMax to prevent over-sensitivity (default: 0.5)
   * @param {number} smoothing - Smoothing factor for recentMax updates (default: 0.95)
   */
  constructor(windowSize = 60, minMax = 0.5, smoothing = 0.95) {
    this.windowSize = windowSize;
    this.minMax = minMax;
    this.smoothing = smoothing;
    this.magnitudeHistory = [];
    this.recentMax = 1.0;
    this.frameCount = 0;
    this.clipCount = 0; // Track clipping events for telemetry
  }
  
  /**
   * Normalize magnitude to [0, 255] relative to recent maximum
   * @param {number} magnitude - Optical flow magnitude in pixels/frame
   * @returns {number} Normalized intensity in [0, 255]
   */
  normalize(magnitude) {
    // Update history
    this.magnitudeHistory.push(magnitude);
    if (this.magnitudeHistory.length > this.windowSize) {
      this.magnitudeHistory.shift();
    }
    
    // Calculate recent max with exponential smoothing
    const currentMax = Math.max(...this.magnitudeHistory);
    this.recentMax = this.recentMax * this.smoothing + currentMax * (1 - this.smoothing);
    
    // Prevent over-sensitivity (cap minimum recentMax)
    const effectiveMax = Math.max(this.recentMax, this.minMax);
    
    // Normalize to [0, 255]
    const normalized = (magnitude / effectiveMax) * 255;
    const intensity = Math.min(255, Math.floor(normalized));
    
    // Track clipping for telemetry
    this.frameCount++;
    if (intensity >= 255) {
      this.clipCount++;
    }
    
    return intensity;
  }
  
  /**
   * Reset normalizer state (call on mode change or video restart)
   */
  reset() {
    this.magnitudeHistory = [];
    this.recentMax = 1.0;
    this.frameCount = 0;
    this.clipCount = 0;
  }
  
  /**
   * Get telemetry data for dev panel / logging
   * @returns {Object} Telemetry metrics
   */
  getTelemetry() {
    return {
      recentMax: this.recentMax,
      effectiveMax: Math.max(this.recentMax, this.minMax),
      frameCount: this.frameCount,
      clipCount: this.clipCount,
      clippingRate: this.frameCount > 0 ? (this.clipCount / this.frameCount) : 0
    };
  }
}

// Create normalizer instance (singleton for worker lifetime)
const normalizer = new AdaptiveNormalizer(60, 0.5, 0.95);

let _prevY = null;
let _width = 0;
let _height = 0;
let _adaptiveThreshold = 20; // Internal adaptive threshold (5-50 pixel difference range)
let _useAdaptive = true; // Whether to use adaptive thresholding

// Grid configuration is now received with each frame (stateless pattern)
// Workers no longer maintain configuration state

/**
 * Convert RGBA imageData to Y-plane (luminance) for motion detection
 * Standard ITU-R BT.601 conversion: Y = 0.299*R + 0.587*G + 0.114*B
 * @param {Uint8ClampedArray} rgbaData - RGBA pixel data (length = width * height * 4)
 * @param {number} width - Image width in pixels
 * @param {number} height - Image height in pixels
 * @returns {Uint8Array} Y-plane luminance data (length = width * height)
 */
function rgbaToYPlane(rgbaData, width, height) {
  const yPlane = new Uint8Array(width * height);
  const pixelCount = width * height;
  
  for (let i = 0; i < pixelCount; i++) {
    const idx = i * 4;
    const r = rgbaData[idx];
    const g = rgbaData[idx + 1];
    const b = rgbaData[idx + 2];
    // ITU-R BT.601 luminance formula
    yPlane[i] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
  }
  
  return yPlane;
}

function convolve2d(image, width, height, kernel) {
  const kh = kernel.length;
  const kw = kernel[0].length;
  const padY = Math.floor(kh / 2);
  const padX = Math.floor(kw / 2);
  const out = new Float32Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let sum = 0;
      for (let ky = 0; ky < kh; ky++) {
        for (let kx = 0; kx < kw; kx++) {
          let iy = y + ky - padY;
          let ix = x + kx - padX;
          // Symmetric boundary
          if (iy < 0) iy = -iy;
          if (iy >= height) iy = 2 * height - iy - 1;
          if (ix < 0) ix = -ix;
          if (ix >= width) ix = 2 * width - ix - 1;
          sum += image[iy * width + ix] * kernel[ky][kx];
        }
      }
      out[y * width + x] = sum;
    }
  }
  return out;
}

function simpleDetectYMotion(yBuf, width, height, step = 6, threshold = 20, maxRegions = 64, windowSize = 5) { // R110125B when, how and who are using it? are this values hardcoded?
  const y = new Uint8Array(yBuf);
  let isFirstFrame = false;
  if (!_prevY || _prevY.length !== y.length) {
    _prevY = new Uint8Array(y.length);
    _width = width; _height = height;
    isFirstFrame = true;
  }

  const coords = new Uint16Array(maxRegions * 2);
  const intens = new Uint8Array(maxRegions);
  const uFlow = new Float32Array(maxRegions);
  const vFlow = new Float32Array(maxRegions);
  let count = 0;
  
  // CRITICAL: Skip motion detection on first frame (no previous frame to compare)
  // Optical flow requires frame-to-frame comparison; first frame always has zero delta
  // Just update _prevY and return empty results
  if (isFirstFrame) {
    _prevY.set(y);
    return { coords, intens, uFlow, vFlow, count: 0 };
  }

  // Kernels for derivatives
  const kernelX = [[-1, 1], [-1, 1]];
  const kernelY = [[-1, -1], [1, 1]];
  const kernelT = [[1, 1], [1, 1]];

  // Compute derivatives on current frame (I1 = prev, I2 = current)
  const fx = convolve2d(y, width, height, kernelX);
  const fy = convolve2d(y, width, height, kernelY);
  const ft = convolve2d(y, width, height, kernelT);
  const ftPrev = convolve2d(_prevY, width, height, kernelT);
  for (let i = 0; i < ft.length; i++) {
    ft[i] -= ftPrev[i]; // ft = I2 - I1 approx
  }

  const w = Math.floor(windowSize / 2);
  const tau = 1e-2;
  // R101125B lets check the following for "plausible but wrong" or unfinished work
  // Determine which threshold to use
  // UI threshold comes in as 0-1 (normalized), convert to pixel difference (0-255)
  // 0 = very insensitive (255 pixel diff required), 1 = very sensitive (0 pixel diff required)
  let effectiveThreshold;
  if (threshold >= 0 && threshold <= 1) {
    // UI control: invert so 0=insensitive, 1=sensitive
    effectiveThreshold = (1 - threshold) * 255;
    _useAdaptive = false; // Disable adaptive when user takes manual control
  } else {
    // Adaptive threshold (legacy support removed - default to mid-sensitivity) R101125B carefull here, re check.
    effectiveThreshold = _adaptiveThreshold;
    _useAdaptive = true;
  }

  for (let yy = w; yy < height - w; yy += step) {
    for (let xx = w; xx < width - w; xx += step) {
      const idx = yy * width + xx;
      const d = Math.abs(y[idx] - _prevY[idx]);
      
      // NOTE: Changed logic - always process for frame 2+, ignore threshold temporarily for debugging
      // Original: if (d >= effectiveThreshold) {
      if (true) {  // Temporary: process ALL pixels to detect any motion
        // Gather window data
        let A11 = 0, A12 = 0, A22 = 0;
        let b1 = 0, b2 = 0;
        for (let dy = -w; dy <= w; dy++) {
          for (let dx = -w; dx <= w; dx++) {
            const iidx = (yy + dy) * width + (xx + dx);
            const Ix = fx[iidx];
            const Iy = fy[iidx];
            const It = ft[iidx];
            A11 += Ix * Ix;
            A12 += Ix * Iy;
            A22 += Iy * Iy;
            b1 += Ix * (-It);
            b2 += Iy * (-It);
          }
        }

        // Structure tensor ATA = [[A11, A12], [A12, A22]]
        const det = A11 * A22 - A12 * A12;
        if (det > tau) {
          // Compute eigenvalues for reliability
          const trace = A11 + A22;
          const discriminant = trace * trace - 4 * det;
          if (discriminant >= 0) {
            const sqrtDisc = Math.sqrt(discriminant);
            const eig1 = (trace + sqrtDisc) / 2;
            const eig2 = (trace - sqrtDisc) / 2;
            const minEig = Math.min(Math.abs(eig1), Math.abs(eig2));
            if (minEig >= tau) {
              // Solve u, v
              const u = (A22 * b1 - A12 * b2) / det;
              const v = (A11 * b2 - A12 * b1) / det;
              const mag = Math.sqrt(u * u + v * v);

              if (count < maxRegions) {
                coords[count * 2] = xx;
                coords[count * 2 + 1] = yy;
                // Adaptive intensity normalization (ADR 0009):
                // Uses AdaptiveNormalizer to prevent clipping on fast motion
                // OLD: intens[count] = Math.min(255, Math.floor(mag * 255));
                // NEW: Adaptive normalization relative to recent maximum
                intens[count] = normalizer.normalize(mag);
                uFlow[count] = u;
                vFlow[count] = v;
              }
              count++;
            }
          }
        }
      }
    }
  }

  // Store current y for next frame
  _prevY.set(y);

  // Log adaptive normalization telemetry (sample at 1% to avoid log spam) R151125t we have an ingest system in place, why are "reinventing the wheel"?
  if (Math.random() < 0.01) {
    const telemetry = normalizer.getTelemetry();
    console.log('[FastMotion] Adaptive normalization stats:', {
      recentMax: telemetry.recentMax.toFixed(2),
      effectiveMax: telemetry.effectiveMax.toFixed(2),
      clippingRate: (telemetry.clippingRate * 100).toFixed(1) + '%',
      frameCount: telemetry.frameCount
    });
  }

  // Only adjust adaptive threshold if we're in adaptive mode
  if (_useAdaptive) {
    const oldThreshold = _adaptiveThreshold;
    if (count < 10) {
      _adaptiveThreshold = Math.max(5, _adaptiveThreshold * 0.95);
    } else if (count > 50) {
      _adaptiveThreshold = Math.min(50, _adaptiveThreshold * 1.05);
    }
    // Threshold adjustments happen silently - no logging in worker
  }

  // CRITICAL: Update previous frame buffer for next frame's optical flow comparison
  // Without this, optical flow always compares to zeros (or undefined), producing no motion
  _prevY.set(y);

  const returnedCount = Math.min(count, maxRegions);
  return { coords, intens, uFlow, vFlow, count: returnedCount };
}

self.onmessage = (ev) => {
  const msg = ev.data || {};

  // Handle reset command (mode change, video restart)
  if (msg.type === 'reset') {
    normalizer.reset();
    _prevY = null;
    console.log('[FastMotion] Normalizer reset on mode change');
    return;
  }

  // Process frame with inline grid configuration (stateless)
  // gridConfig and mode are passed with every frame, not stored in worker state
  // FIX: Accept both 'frame' (legacy) and 'processingRequest' (FrameConductor) message types
  if (msg.type === 'frame' || msg.type === 'processingRequest') {
    try {
      // Extract frame data based on message type
      // FrameConductor sends: { type: 'processingRequest', data: frameData, width, height, state }
      // Legacy sends: { type: 'frame', w, h, yBuffer, ... }
      let frameData = msg.data || msg.yBuffer;
      const ts = msg.timestamp || 0;
      const w = msg.width || msg.w || 0;
      const h = msg.height || msg.h || 0;
      
      // TEMPORARY DIAGNOSTIC: Log frame data details (sample 1% of frames) R111125eb considered eventBus?
      if (Math.random() < 0.01) {
        console.log('[FastMotion] Frame received:', {
          type: msg.type,
          hasData: !!frameData,
          dataType: frameData ? frameData.constructor.name : 'null',
          dataSize: frameData ? (frameData.length || frameData.byteLength) : 0,
          dimensions: `${w}x${h}`,
          expectedRGBA: w * h * 4,
          expectedY: w * h
        });
      }
      
      const step = msg.step || 6;
      const threshold = (msg.state && msg.state.motionThreshold) || msg.threshold || 20;
      const maxRegions = msg.maxRegions || 64;
      const windowSize = msg.windowSize || 5;
      const gridConfig = (msg.state && msg.state.gridConfig) || msg.gridConfig || { rows: 4, cols: 4, frameWidth: w, frameHeight: h, aggregation: 'mean', skipThreshold: 0.1 }; // Added frame dimensions for downstream workers
      const mode = (msg.state && msg.state.mode) || msg.mode || 'flow';
      
      // CRITICAL FIX: Convert RGBA ImageData to Y-plane if needed
      // FrameConductor sends full RGBA data (ArrayBuffer or Uint8ClampedArray)
      // Motion detection works on Y-plane only (1 byte per pixel)
      // Check if frameData is RGBA (4 bytes per pixel) and convert to Y-plane
      let yBuffer = frameData;
      const expectedRGBASize = w * h * 4;
      const expectedYSize = w * h;
      
      if (frameData) {
        // Handle both ArrayBuffer and typed arrays
        const bufferLength = frameData.length !== undefined ? frameData.length : frameData.byteLength;
        
        if (bufferLength === expectedRGBASize) {
          // Convert RGBA to Y-plane
          // If it's an ArrayBuffer, create a view first
          const rgbaData = frameData instanceof ArrayBuffer 
            ? new Uint8ClampedArray(frameData)
            : frameData;
          
          yBuffer = rgbaToYPlane(rgbaData, w, h);
        }
      }
      
      if (!yBuffer) {
        // No buffer available - return empty result
        self.postMessage(
          WorkerContract.createResult(
            WORKER_TYPES.FAST_MOTION,
            mode,
            [CAPABILITIES.YMOTION_ONLY, CAPABILITIES.MOTION_MAGNITUDE],
            {
              coords: new Uint16Array(0),
              intens: new Uint8Array(0),
              uFlow: new Float32Array(0),
              vFlow: new Float32Array(0),
              count: 0,
              timestamp: ts,
              gridConfig,
              mode,
            }
          )
        );
        return;
      }
      
      const res = simpleDetectYMotion(yBuffer, w, h, step, threshold, maxRegions, windowSize);
      
      // TEMPORARY DIAGNOSTIC: Sample intensity for validation (0.5% sample rate)
      // R111125eb consider eventBus if more performant than console.log
      if (res.count > 0 && Math.random() < 0.005) {
        const firstFew = [];
        for (let i = 0; i < Math.min(5, res.count); i++) {
          firstFew.push(res.intens[i]);
        }
        console.log('[FastMotion] INTENSITY SAMPLE:', {
          regions: res.count,
          firstFive: firstFew
        });
      }

      // Ensure frame dimensions are present in gridConfig for downstream aggregation workers
      // Create new object to avoid mutating potentially frozen state, handle null/undefined
      const enrichedGridConfig = gridConfig ? {
        ...gridConfig,
        frameWidth: gridConfig.frameWidth || w,
        frameHeight: gridConfig.frameHeight || h
      } : {
        rows: 4,
        cols: 4,
        frameWidth: w,
        frameHeight: h,
        aggregation: 'mean',
        skipThreshold: 0.1
      };

      // Lightweight sampled diagnostic (2%): confirm region count & first intensity
      if (Math.random() < 0.02) {
        console.log('[FastMotion] POST SAMPLE', {
          count: res.count,
          firstIntensity: res.count > 0 ? res.intens[0] : null,
          intensLength: res.intens.length
        });
      }

      const resultData = {
        coords: res.coords,
        intens: res.intens,
        uFlow: res.uFlow,
        vFlow: res.vFlow,
        count: res.count,
        timestamp: Date.now(),
        gridConfig: enrichedGridConfig,
        mode,
        frameWidth: w,
        frameHeight: h
      };
      
      const contractMessage = WorkerContract.createResult(
        WORKER_TYPES.FAST_MOTION,
        mode,
        [CAPABILITIES.YMOTION_ONLY, CAPABILITIES.MOTION_MAGNITUDE],
        resultData
      );
      
      // Transfer buffer ownership to main thread for zero-copy performance
      self.postMessage(contractMessage, [res.coords.buffer, res.intens.buffer, res.uFlow.buffer, res.vFlow.buffer]);
    } catch (e) {
      // TEMPORARY DIAGNOSTIC: Log full error details R111125 considered eventBus?
      console.error('[FastMotion] EXCEPTION:', e.message, 'Stack:', e.stack);
      // Send error via contract
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.FAST_MOTION,
          `Motion detection failed: ${e.message}`,
          e
        )
      );
    }
  } else if (msg.type === 'handshake') {
    self.postMessage({ type: 'ready', features: ['motion', 'flow', 'gridConfig'], mode: 'flow' });
  } else if (msg.type === 'simulate') {
    self.postMessage({ type: 'ready', features: ['motion', 'flow'], simulated: true, mode: 'flow' });
  }
};

export default {};
