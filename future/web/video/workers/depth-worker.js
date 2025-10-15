// future/web/video/workers/depth-worker.js (ML-1: Dep-Free Pseudo-Depth Estimator)
//
// Responsibilities:
// - Compute pseudo-depth using Sobel edge detection as proxy (high edges = close objects).
// - Enhance with Gabor textures for collision detection.
// - Average into gridDepths for melody modulation.
//
// Workflow:
// 1. Receive { type: 'processFrame', frame: ImageData, prevFrame: ImageData, gridSize: { rows: 4, cols: 4 } }
// 2. Apply Sobel operator for edge magnitudes, normalize with Softplus.
// 3. Optionally apply Gabor for texture enhancement.
// 4. Average into gridDepths per cell.
// 5. Send { type: 'depthCues', result: { gridDepths, timestamp } }
//
// Dependencies: Pure JS, no external libs. Runs in Web Worker for performance.

let prevData = null;

self.onmessage = (e) => {
  const { type, frame, prevFrame, gridSize } = e.data;
  if (type === 'processFrame') {
    try {
      const width = frame.width;
      const height = frame.height;
      const data = frame.data;

      // Sobel for edges (proxy depth: high edges = close)
      const depths = new Float32Array(width * height);
      for (let y = 1; y < height - 1; y++) {
        for (let x = 1; x < width - 1; x++) {
          const i = (y * width + x) * 4;
          const gx = -data[i-4] + data[i+4] - 2*data[i-width*4-4] + 2*data[i-width*4+4] - data[i+width*4-4] + data[i+width*4+4];
          const gy = -data[i-width*4] + data[i+width*4] - 2*data[i-width*4-4] + 2*data[i+width*4-4] - data[i-width*4+4] + data[i+width*4+4];
          depths[y*width + x] = Math.log(1 + Math.exp(Math.sqrt(gx*gx + gy*gy) / 1020));  // Softplus normalize [0,1]
        }
      }

      // Gabor for textures in depths (enhance collisions) - simplified
      const gaborKernel = (x, y) => Math.exp(-(x**2 + y**2)/(2*5**2)) * Math.cos(2 * Math.PI * x / 10);
      const applyGaborDepth = (depths, width, height, x, y) => {
        let response = 0;
        for (let dy = -2; dy <= 2; dy++) {
          for (let dx = -2; dx <= 2; dx++) {
            const i = ((y+dy)*width + (x+dx));
            if (i >= 0 && i < depths.length) response += depths[i] * gaborKernel(dx, dy);
          }
        }
        return Math.log(1 + Math.exp(Math.abs(response)));  // Softplus
      };

      // Average to gridDepths with sampling and skip low depth
      const { rows, cols } = gridSize;
      const cellW = width / cols;
      const cellH = height / rows;
      const gridDepths = Array.from({length: rows}, () => Array(cols).fill(0));
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          let sum = 0, count = 0;
          for (let yy = Math.floor(r * cellH); yy < Math.floor((r + 1) * cellH); yy += 30) {  // Sample every 30px
            for (let xx = Math.floor(c * cellW); xx < Math.floor((c + 1) * cellW); xx += 30) {
              const i = yy * width + xx;
              if (i < depths.length) {
                sum += depths[i];
                count++;
              }
            }
          }
          const avg = count > 0 ? sum / count : 0;
          gridDepths[r][c] = avg < 0.2 ? 0 : avg;  // Skip low depth cells
        }
      }

      self.postMessage({ type: 'depthCues', result: { gridDepths, timestamp: Date.now() } });
    } catch (error) {
      self.postMessage({ type: 'error', error: error.message });
    }
  }
};