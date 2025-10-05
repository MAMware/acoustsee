// Enhanced motion-worker with Lucas-Kanade optical flow: receives Y-plane ArrayBuffer and returns compact moving regions with direction.
// Integrates basic optical flow for direction estimation (u, v) alongside intensity, enhancing motion detection for applications like AcoustSee.
// Uses vanilla JavaScript convolution and matrix solving for compatibility and performance in web workers.
// Maintains adaptive thresholding for robustness in varying conditions.
// Outputs coords, intensity (based on flow magnitude), u (horizontal flow), and v (vertical flow) as transferable buffers.
// REVISON 2025-10-05 - Enhanced with Lucas-Kanade optical flow based on research in motion-worker.js.md.

// Simple structured logging for worker
function structuredLog(level, message, data = {}) {
  console.log(`[${level}] ${message}`, data);
}

let _prevY = null;
let _width = 0;
let _height = 0;
let _adaptiveThreshold = 20; // Start with default threshold

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

  for (let yy = w; yy < height - w; yy += step) {
    for (let xx = w; xx < width - w; xx += step) {
      const idx = yy * width + xx;
      const d = Math.abs(y[idx] - _prevY[idx]);
      if (d >= _adaptiveThreshold) {
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

  // Adaptive threshold adjustment
  const oldThreshold = _adaptiveThreshold;
  if (count < 10) {
    _adaptiveThreshold = Math.max(5, _adaptiveThreshold * 0.95);
  } else if (count > 50) {
    _adaptiveThreshold = Math.min(50, _adaptiveThreshold * 1.05);
  }
  if (_adaptiveThreshold !== oldThreshold) {
    console.log(`Motion threshold adjusted from ${oldThreshold} to ${_adaptiveThreshold} (count: ${count})`);
  }

  const returnedCount = Math.min(count, maxRegions);
  return { coords, intens, uFlow, vFlow, count: returnedCount };
}

self.onmessage = (ev) => {
  const msg = ev.data || {};
  if (msg.type === 'frame') {
    try {
      const { ts = 0, w = 0, h = 0, yBuffer, step = 6, threshold = 20, maxRegions = 64, windowSize = 5 } = msg;
      if (!yBuffer) {
        self.postMessage({ type: 'motion', ts, count: 0, coordsBuffer: new Uint16Array(0).buffer, intensBuffer: new Uint8Array(0).buffer, uBuffer: new Float32Array(0).buffer, vBuffer: new Float32Array(0).buffer });
        return;
      }
      const res = simpleDetectYMotion(yBuffer, w, h, step, threshold, maxRegions, windowSize);
      structuredLog('DEBUG', 'Motion detection results', { count: res.count, threshold: threshold, frameDelta: res.count });
      const toSend = {
        type: 'motion',
        ts,
        count: res.count,
        coordsBuffer: res.coords.buffer,
        intensBuffer: res.intens.buffer,
        uBuffer: res.uFlow.buffer,
        vBuffer: res.vFlow.buffer
      };
      self.postMessage(toSend, [res.coords.buffer, res.intens.buffer, res.uFlow.buffer, res.vFlow.buffer]);
    } catch (e) {
      self.postMessage({ type: 'error', message: e && e.message ? e.message : String(e) });
    }
  } else if (msg.type === 'handshake') {
    self.postMessage({ type: 'ready', features: ['motion', 'flow'] });
  } else if (msg.type === 'simulate') {
    self.postMessage({ type: 'ready', features: ['motion', 'flow'], simulated: true });
  }
};
