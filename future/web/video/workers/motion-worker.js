
// Enhanced motion-worker with Lucas-Kanade optical flow: receives Y-plane ArrayBuffer and returns compact moving regions with direction.
// Integrates basic optical flow for direction estimation (u, v) alongside intensity, enhancing motion detection for applications like AcoustSee.
// Uses vanilla JavaScript convolution and matrix solving for compatibility and performance in web workers.
// Maintains adaptive thresholding for robustness in varying conditions.
// Outputs coords, intensity (based on flow magnitude), u (horizontal flow), and v (vertical flow) as transferable buffers.
// v0.6 (2025-10-17): Added paradigm-aware gridSize support and dynamic grid configuration. By Claude Haiku 4.5
// v0.5 Created by MAMware and Grok (xAI.com)
// Enhanced with Lucas-Kanade optical flow based on research in motion-worker.js.md, REV 2025-10-05.

// Add this import at the top if not present
import { structuredLog } from '../../utils/worker-logger.js';
import { WorkerContract, WORKER_TYPES, CAPABILITIES } from './worker-contract.js';

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

function simpleDetectYMotion(yBuf, width, height, step = 6, threshold = 20, maxRegions = 64, windowSize = 5) {
  const y = new Uint8Array(yBuf);
  if (!_prevY || _prevY.length !== y.length) {
    _prevY = new Uint8Array(y.length);
    _width = width; _height = height;
  }

  const coords = new Uint16Array(maxRegions * 2);
  const intens = new Uint8Array(maxRegions);
  const uFlow = new Float32Array(maxRegions);
  const vFlow = new Float32Array(maxRegions);
  let count = 0;

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
 
  // Determine which threshold to use
  // UI threshold comes in as 0-1 (normalized), convert to pixel difference (0-255)
  // 0 = very insensitive (255 pixel diff required), 1 = very sensitive (0 pixel diff required)
  let effectiveThreshold;
  if (threshold >= 0 && threshold <= 1) {
    // UI control: invert so 0=insensitive, 1=sensitive
    effectiveThreshold = (1 - threshold) * 255;
    _useAdaptive = false; // Disable adaptive when user takes manual control
  } else {
    // Adaptive threshold (legacy support removed - default to mid-sensitivity) 
    effectiveThreshold = _adaptiveThreshold;
    _useAdaptive = true;
  }

  for (let yy = w; yy < height - w; yy += step) {
    for (let xx = w; xx < width - w; xx += step) {
      const idx = yy * width + xx;
      const d = Math.abs(y[idx] - _prevY[idx]);
      
      if (d >= effectiveThreshold) {
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
                intens[count] = Math.min(255, Math.floor(mag * 10)); // Scale magnitude to uint8
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

  // Only adjust adaptive threshold if we're in adaptive mode
  if (_useAdaptive) {
    const oldThreshold = _adaptiveThreshold;
    if (count < 10) {
      _adaptiveThreshold = Math.max(5, _adaptiveThreshold * 0.95);
    } else if (count > 50) {
      _adaptiveThreshold = Math.min(50, _adaptiveThreshold * 1.05);
    }
    if (_adaptiveThreshold !== oldThreshold) {
      structuredLog('DEBUG', 'Adaptive threshold adjusted', { from: oldThreshold, to: _adaptiveThreshold, count });
    }
  }

  const returnedCount = Math.min(count, maxRegions);
  return { coords, intens, uFlow, vFlow, count: returnedCount };
}

self.onmessage = (ev) => {
  const msg = ev.data || {};

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
      const step = msg.step || 6;
      const threshold = (msg.state && msg.state.motionThreshold) || msg.threshold || 20;
      const maxRegions = msg.maxRegions || 64;
      const windowSize = msg.windowSize || 5;
      const gridConfig = (msg.state && msg.state.gridConfig) || msg.gridConfig || { rows: 4, cols: 4, aggregation: 'mean', skipThreshold: 0.1 };
      const mode = (msg.state && msg.state.mode) || msg.mode || 'hybrid';
      
      // CRITICAL FIX: Convert RGBA ImageData to Y-plane if needed
      // FrameConductor sends full RGBA data, but motion detection works on Y-plane only
      // Check if frameData is RGBA (length = w*h*4) and convert to Y-plane (length = w*h)
      if (frameData && frameData.length === w * h * 4) {
        structuredLog('DEBUG', 'Motion worker: Converting RGBA to Y-plane', { 
          width: w, height: h, rgbaLength: frameData.length 
        });
        frameData = rgbaToYPlane(frameData, w, h);
      }
      
      const yBuffer = frameData;
      
      structuredLog('DEBUG', 'Motion worker received frame', { 
        width: w, 
        height: h, 
        threshold, 
        mode,
        gridSize: { rows: gridConfig.rows, cols: gridConfig.cols }
      });
      
      if (!yBuffer) {
        structuredLog('WARN', 'Motion worker: No yBuffer received');
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
      structuredLog('DEBUG', 'Motion detection complete', { 
        count: res.count, 
        threshold, 
        adaptiveThreshold: _adaptiveThreshold,
        usingAdaptive: _useAdaptive,
        mode,
      });
      
      // Create contract-compliant result
      const contractMessage = WorkerContract.createResult(
        WORKER_TYPES.FAST_MOTION,
        mode,
        [CAPABILITIES.YMOTION_ONLY, CAPABILITIES.MOTION_MAGNITUDE],
        {
          coords: res.coords,
          intens: res.intens,
          uFlow: res.uFlow,
          vFlow: res.vFlow,
          count: res.count,
          timestamp: Date.now(),
          gridConfig,
          mode,
        }
      );
      self.postMessage(contractMessage, [res.coords.buffer, res.intens.buffer, res.uFlow.buffer, res.vFlow.buffer]);
    } catch (e) {
      structuredLog('ERROR', 'Motion worker exception', { 
        message: e.message, 
        stack: e.stack,
        name: e.name
      });
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
    structuredLog('INFO', 'Motion worker initialized');
    self.postMessage(
      WorkerContract.createResult(
        WORKER_TYPES.FAST_MOTION,
        'initialization',
        [CAPABILITIES.YMOTION_ONLY, CAPABILITIES.MOTION_MAGNITUDE],
        { ready: true, features: ['motion', 'flow', 'gridConfig'] }
      )
    );
  } else if (msg.type === 'simulate') {
    structuredLog('INFO', 'Motion worker simulation mode');
    self.postMessage(
      WorkerContract.createResult(
        WORKER_TYPES.FAST_MOTION,
        'initialization',
        [CAPABILITIES.YMOTION_ONLY, CAPABILITIES.MOTION_MAGNITUDE],
        { ready: true, features: ['motion', 'flow'], simulated: true }
      )
    );
  }
};
