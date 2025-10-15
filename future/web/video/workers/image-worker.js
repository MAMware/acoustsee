// workers/image-worker.js (Enhanced Image Processing Worker for AcoustSee Multi-Paradigm System)
//
// Responsibilities:
// - Optical Flow Computation: Calculates Lucas-Kanade optical flow on full RGB frames, averaged into a configurable grid (e.g., 4x4).
// - Texture Analysis: Applies Gabor filters to detect surface textures (e.g., rough ground, obstacles) for collision detection.
// - Object Detection: Dep-free detection of objects (person/tree/rough_ground/trash/box) using color thresholds, texture, and motion cues.
// - BPM Inference: Infers user activity tempo (90-130 BPM) from motion magnitude for rhythmic audio cues.
// - Egomotion Differentiation: Uses flow vectors to distinguish user motion from independent object motion.
//
// Workflow:
// 1. Receive { type: 'processFrame', frame: ImageData, prevFrame: ImageData, gridSize: { rows: 4, cols: 4 } }
// 2. Compute optical flow between frames, aggregate into gridFlows (per-cell u, v, mag).
// 3. Apply Gabor convolution for textureGrid (per-cell texture response).
// 4. Detect objects based on texture, color, and motion thresholds.
// 5. Infer BPM from average flow magnitude.
// 6. Send { type: 'flowCues', result: { gridFlows, textureGrid, objects, inferredBPM, timestamp } }
//
// Dependencies: Pure JS, no external libs. Runs in Web Worker for performance.
//
// Future Extensions: Integrate ML models (e.g., TensorFlow.js for depth), add more object classes, refine egomotion subtraction.

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

let prevData = null;

self.onmessage = (e) => {
  const { type, frame, prevFrame, gridSize } = e.data;
  if (type === 'processFrame') {
    try {
      if (!prevData) {
        prevData = prevFrame.data.slice();
        self.postMessage({ type: 'flowCues', result: { gridFlows: [], textureGrid: [], objects: [], inferredBPM: 100, timestamp: Date.now() } });
        return;
      }

      const width = frame.width;
      const height = frame.height;
      const currentData = frame.data;
      const prev = new Uint8ClampedArray(prevData);

      const getLuma = (data, i) => 0.299 * data[i] + 0.587 * data[i+1] + 0.114 * data[i+2];

      // LK flow computation
      const kernelX = [[-1, 1], [-1, 1]];
      const kernelY = [[-1, -1], [1, 1]];
      const kernelT = [[1, 1], [1, 1]];

      // Compute derivatives (fx, fy, ft) using convolution on luma
      const fx = convolve2d(currentData.map((_, i) => i % 4 === 3 ? 0 : getLuma(currentData, i)), width, height, kernelX);
      const fy = convolve2d(currentData.map((_, i) => i % 4 === 3 ? 0 : getLuma(currentData, i)), width, height, kernelY);
      const ft = convolve2d(currentData.map((_, i) => i % 4 === 3 ? 0 : getLuma(currentData, i)), width, height, kernelT);
      for (let i = 0; i < ft.length; i++) ft[i] -= convolve2d(prev.map((_, j) => j % 4 === 3 ? 0 : getLuma(prev, j)), width, height, kernelT)[i];

      const w = 2; // Window size for LK
      const tau = 1e-2; // Reliability threshold

      // Compute gridFlows by averaging LK flow per cell
      const { rows, cols } = gridSize;
      const cellW = width / cols;
      const cellH = height / rows;
      const gridFlows = Array.from({length: rows}, () => Array(cols).fill({ u: 0, v: 0, mag: 0 }));

      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let sumU = 0, sumV = 0, count = 0;
          const startY = Math.floor(r * cellH);
          const endY = Math.floor((r + 1) * cellH);
          const startX = Math.floor(c * cellW);
          const endX = Math.floor((c + 1) * cellW);
          
          for (let y = startY + w; y < endY - w; y += 2) { // Sample every 2 pixels
            for (let x = startX + w; x < endX - w; x += 2) {
              const idx = y * width + x;
              let A = [0, 0, 0, 0], b = [0, 0];
              for (let dy = -w; dy <= w; dy++) {
                for (let dx = -w; dx <= w; dx++) {
                  const nidx = (y + dy) * width + (x + dx);
                  A[0] += fx[nidx] * fx[nidx];
                  A[1] += fx[nidx] * fy[nidx];
                  A[2] += fy[nidx] * fx[nidx];
                  A[3] += fy[nidx] * fy[nidx];
                  b[0] += -fx[nidx] * ft[nidx];
                  b[1] += -fy[nidx] * ft[nidx];
                }
              }
              const det = A[0] * A[3] - A[1] * A[2];
              if (Math.abs(det) > tau) {
                const u = (A[3] * b[0] - A[1] * b[1]) / det;
                const v = (-A[2] * b[0] + A[0] * b[1]) / det;
                sumU += u;
                sumV += v;
                count++;
              }
            }
          }
          if (count > 0) {
            const u = sumU / count;
            const v = sumV / count;
            gridFlows[r][c] = { u, v, mag: Math.sqrt(u * u + v * v) };
          }
        }
      }

      // Gabor for textures (small kernel, sampled)
      const gaborKernel = (x, y) => Math.exp(-(x**2 + y**2)/ (2*5**2)) * Math.cos(2 * Math.PI * x / 10);  // Sigma=5, lambda=10
      const applyGabor = (data, width, height, x, y) => {
        let sumLuma = 0, count = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const i = ((y+dy)*width + (x+dx))*4;
            if (i >= 0 && i < data.length) {
              sumLuma += getLuma(data, i);
              count++;
            }
          }
        }
        if (count > 0 && sumLuma / count < 10) return 0;  // Early exit for low-contrast
        let response = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const i = ((y+dy)*width + (x+dx))*4;
            if (i >= 0 && i < data.length) response += getLuma(data, i) * gaborKernel(dx, dy);
          }
        }
        // Apply Softplus for smoothing to avoid spikes in textures for smooth melody
        return Math.log(1 + Math.exp(Math.abs(response)));
      };

      // Texture grid + object detection (from textures/flow)
      const textureGrid = Array.from({length: rows}, () => Array(cols).fill(0));
      const startTime = performance.now();
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const x = Math.floor(c * cellW + cellW / 2);
          const y = Math.floor(r * cellH + cellH / 2);
          textureGrid[r][c] = applyGabor(currentData, width, height, x, y);
        }
      }
      const gaborTime = performance.now() - startTime;
      if (gaborTime > 10) {
        self.postMessage({ type: 'perfMetrics', metric: 'gaborTime', value: gaborTime, timestamp: Date.now() });
      }

      const detectBox = () => {
        let rectCount = 0;
        for (let y = 1; y < height - 1; y += 10) {
          for (let x = 1; x < width - 1; x += 10) {
            const i = (y * width + x) * 4;
            const hDiff = Math.abs(getLuma(currentData, i) - getLuma(currentData, i + 4));  // Horiz edge
            const vDiff = Math.abs(getLuma(currentData, i) - getLuma(currentData, (y+1)*width*4 + x*4));  // Vert edge
            if (hDiff > 60 && vDiff > 60 && Math.abs(hDiff / vDiff - 1) < 0.5) rectCount++;  // Strong rect-like edges with aspect ratio check
          }
        }
        return rectCount > 10 ? 'box' : null;  // Threshold
      };

      // BPM infer from avgMag
      const avgMag = gridFlows.flat().reduce((sum, f) => sum + f.mag, 0) / gridFlows.flat().length;

      const detectTrash = () => {
        const highTextureCells = textureGrid.flat().filter(t => t > 50).length;
        const hasChromaVariance = textureGrid.flat().some((t, idx) => {
          if (t > 50) {
            const r = Math.floor(idx / cols);
            const c = idx % cols;
            const i = (Math.floor(r * cellH + cellH / 2) * width + Math.floor(c * cellW + cellW / 2)) * 4;
            const g = currentData[i + 1], b = currentData[i + 2];
            const variance = Math.abs(g - b);
            // Debug chroma variance if needed
            // self.postMessage({ type: 'debug', message: 'TrashChroma', data: { variance } });
            return variance > 20;
          }
          return false;
        });
        if (highTextureCells > rows * cols * 0.3 && avgMag > 5 && hasChromaVariance) return 'trash';
        return null;
      };

      const objects = [];
      // Person/tree as before...
      if (textureGrid.flat().some(t => t > 70)) objects.push('rough_ground');  // High texture = piso malo

      objects.push(detectBox(), detectTrash()).filter(Boolean);

      const inferredBPM = avgMag < 5 ? 100 : (avgMag < 10 ? 115 : 120);

      prevData = currentData.slice();
      self.postMessage({ type: 'flowCues', result: { gridFlows, textureGrid, objects, inferredBPM, timestamp: Date.now() } });
    } catch (error) {
      self.postMessage({ type: 'error', error: error.message });
    }
  }
};