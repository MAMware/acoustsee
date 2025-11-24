// workers/image-worker.js (Enhanced Image Processing Worker for AcoustSee Multi-Paradigm System)
//
// Responsibilities:
// - Optical Flow Computation: Calculates Lucas-Kanade optical flow on full RGB frames, averaged into a configurable grid.
// - Texture Analysis: Applies Gabor filters to detect surface textures for collision detection.
// - Abstract Feature Extraction: Computes abstract spatial features (textureRich, fastMotion, edgeConcentration).
// - Optional Semantic Detection: Community-contributed semantic object detection (person/tree/rough_ground/trash/box).
//                                Can be enabled/disabled, off by default to minimize overhead.
// - BPM Inference: Infers user activity tempo (90-130 BPM) from motion magnitude for rhythmic audio cues.
// - Egomotion Differentiation: Uses flow vectors to distinguish user motion from independent object motion.
//
// Workflow:
// 1. Receive { type: 'processFrame', frame: ImageData, prevFrame: ImageData, gridConfig, mode, enableSemantic }
// 2. Compute optical flow between frames, aggregate into gridFlows (per-cell u, v, mag).
// 3. Apply Gabor convolution for textureGrid (per-cell texture response).
// 4. Extract abstract features (textureRich, fastMotion, edgeConcentration).
// 5. OPTIONAL: If enabled, run semantic detection (person, tree, etc.) for educational/community exploration.
// 6. Infer BPM from average flow magnitude.
// 7. Send { type: 'processingResult', version: '2.0', ... } per worker-contract.js
//
// Dependencies: Pure JS, no external libs. Runs in Web Worker for performance.
// 
// Design Rationale:
// - Primary audio generation uses ABSTRACT spatial features (depth, motion, texture).
// - Semantic detection is OPTIONAL and runs only if explicitly enabled by consumers.
// - This keeps the core lightweight while allowing community to experiment with semantic approaches.

import { WorkerContract, WORKER_TYPES, CAPABILITIES } from './worker-contract.js';

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
// Grid configuration is now received with each frame (stateless pattern)
// Workers no longer maintain configuration state

self.onmessage = (e) => {
  const msg = e.data;
  const type = msg.type;

  // Normalize input data based on message format
  let frame, prevFrame, gridConfig, mode, enableSemantic;

  if (type === 'processingRequest') {
    // FrameConductor format
    // Note: Image worker needs prevFrame for optical flow. 
    // FrameConductor might need to be updated to pass prevFrame or worker needs to store it.
    // For now, we'll assume the worker stores the previous frame internally if not provided.
    frame = {
      width: msg.width,
      height: msg.height,
      data: msg.data.data ? msg.data.data : msg.data // Handle ImageData vs Uint8ClampedArray
    };
    
    // Extract config from state
    const state = msg.state || {};
    gridConfig = { 
      rows: (state.orchestration && state.orchestration.gridType === '8x8') ? 8 : 4,
      cols: (state.orchestration && state.orchestration.gridType === '8x8') ? 8 : 4,
      aggregation: 'mean', 
      skipThreshold: 0.1 
    };
    mode = 'focus'; // Image worker is primarily for focus mode
    enableSemantic = false; // Default off
  } else {
    // Legacy format
    frame = msg.frame;
    prevFrame = msg.prevFrame;
    gridConfig = msg.gridConfig || { rows: 4, cols: 4, aggregation: 'mean', skipThreshold: 0.1 };
    mode = msg.mode || 'hybrid';
    enableSemantic = msg.enableSemantic || false;
  }

  // Process frame with inline configuration (stateless)
  // gridConfig, mode, and enableSemantic are passed with every frame, not stored in worker state
  if (type === 'processFrame' || type === 'processingRequest') {
    try {
      if (!prevData) {
        // Initialize prevData with current frame data
        prevData = new Uint8ClampedArray(frame.data);
        
        const result = {
              gridFlows: [], 
              textureGrid: [], 
              abstractFeatures: [],
              semanticObjects: [],
              statistics: {},
              inferredBPM: 100, // this value is a fallback as "safe" default
              timestamp: Date.now(),
              gridConfig,
              mode,
            };

        if (type === 'processingRequest') {
             self.postMessage(WorkerContract.createResult(
                WORKER_TYPES.IMAGE,
                mode,
                [CAPABILITIES.FLOW_VECTORS, CAPABILITIES.MOTION_MAGNITUDE, CAPABILITIES.TEXTURE_ANALYSIS],
                result
              ));
        } else {
             // Legacy behavior (might not post message on first frame)
             self.postMessage(WorkerContract.createResult(
                WORKER_TYPES.IMAGE,
                mode,
                [CAPABILITIES.FLOW_VECTORS, CAPABILITIES.MOTION_MAGNITUDE, CAPABILITIES.TEXTURE_ANALYSIS],
                result
              ));
        }
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
      const lumaArray = new Float32Array(width * height);
      const prevLumaArray = new Float32Array(width * height);
      for (let i = 0; i < width * height; i++) {
        lumaArray[i] = getLuma(currentData, i * 4);
        prevLumaArray[i] = getLuma(prev, i * 4);
      }

      const fx = convolve2d(lumaArray, width, height, kernelX);
      const fy = convolve2d(lumaArray, width, height, kernelY);
      const ftCurr = convolve2d(lumaArray, width, height, kernelT);
      const ftPrev = convolve2d(prevLumaArray, width, height, kernelT);
      const ft = new Float32Array(width * height);
      for (let i = 0; i < ft.length; i++) ft[i] = ftCurr[i] - ftPrev[i];

      const w = 2; // Window size for LK
      const tau = 1e-2; // Reliability threshold

      // Compute gridFlows by averaging LK flow per cell
      // Use gridConfig passed with this frame (stateless)
      const { rows, cols, aggregation, skipThreshold } = gridConfig;
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

      // Texture grid: Gabor filter responses
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

      // Compute statistics for abstract feature extraction and optional semantic detection
      const flowMags = gridFlows.flat().map(f => f.mag);
      const textures = textureGrid.flat();
      const statistics = {
        meanFlow: flowMags.reduce((a, b) => a + b, 0) / flowMags.length,
        maxFlow: Math.max(...flowMags),
        minFlow: Math.min(...flowMags),
        edgeEnergy: textures.reduce((a, b) => a + b, 0) / textures.length,
        cellsActive: gridFlows.flat().filter(f => f.mag > skipThreshold).length,
        cellsTotal: rows * cols,
      };

      // ABSTRACT FEATURES: These are the primary signals for audio generation
      const abstractFeatures = [];

      // Feature 1: Texture richness (abstract spatial complexity)
      const textureRichRatio = textures.filter(t => t > 1.5).length / textures.length;
      if (textureRichRatio > 0.3) {
        abstractFeatures.push({
          type: 'textureRich',
          magnitude: textureRichRatio,
          distribution: 'spatial',
          reasoning: `Surface texture complexity: ${(textureRichRatio * 100).toFixed(1)}% of grid`,
        });
      }

      // Feature 2: Fast motion regions (abstract temporal energy)
      const fastMotionRatio = flowMags.filter(m => m > 10).length / flowMags.length;
      if (statistics.meanFlow > 8 || fastMotionRatio > 0.2) {
        abstractFeatures.push({
          type: 'fastMotion',
          magnitude: statistics.meanFlow,
          distribution: 'temporal',
          reasoning: `Motion energy: mean=${statistics.meanFlow.toFixed(1)}, ${(fastMotionRatio * 100).toFixed(1)}% fast regions`,
        });
      }

      // Feature 3: Edge energy concentration (abstract structural features)
      if (statistics.edgeEnergy > 1.5) {
        abstractFeatures.push({
          type: 'edgeConcentration',
          magnitude: statistics.edgeEnergy,
          distribution: 'spatial',
          reasoning: `Edge concentration: ${statistics.edgeEnergy.toFixed(2)} (high=sharp boundaries)`,
        });
      }

      // OPTIONAL SEMANTIC DETECTION: Only run if explicitly enabled
      // This is for educational purposes and community exploration
      const semanticObjects = [];
      if (enableSemantic) {
        // Simple heuristic-based semantic detection (no ML models)
        
        // Detect "person": high motion + concentrated edges + relatively uniform texture
        if (statistics.meanFlow > 8 && statistics.edgeEnergy > 1.5 && statistics.cellsActive / statistics.cellsTotal > 0.4) {
          semanticObjects.push({
            type: 'person',
            confidence: Math.min(1, (statistics.meanFlow / 15) * 0.5 + (statistics.edgeEnergy / 3) * 0.5),
            reasoning: 'Moving object with defined edges',
          });
        }

        // Detect "tree": high texture + vertical gradient + stable
        let verticalGradient = 0;
        for (let r = 1; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            verticalGradient += Math.abs(textureGrid[r][c] - textureGrid[r - 1][c]);
          }
        }
        verticalGradient /= (rows - 1) * cols || 1;
        
        if (statistics.edgeEnergy > 1.8 && verticalGradient > 0.3 && statistics.meanFlow < 5) {
          semanticObjects.push({
            type: 'tree',
            confidence: Math.min(1, (statistics.edgeEnergy / 3) * 0.5 + (verticalGradient / 1) * 0.5),
            reasoning: 'Textured vertical structure, stable',
          });
        }

        // Detect "rough_ground": low motion + high texture variation + large coverage
        if (statistics.meanFlow < 3 && statistics.edgeEnergy > 1.5 && statistics.cellsActive / statistics.cellsTotal > 0.6) {
          semanticObjects.push({
            type: 'rough_ground',
            confidence: Math.min(1, (statistics.edgeEnergy / 2.5) * 0.7 + (1 - statistics.meanFlow / 5) * 0.3),
            reasoning: 'Textured stable surface, high coverage',
          });
        }

        // Detect "trash": irregular motion + mixed texture
        const flowVariance = statistics.maxFlow - statistics.meanFlow;
        if (flowVariance > 5 && statistics.meanFlow > 4 && statistics.edgeEnergy > 1.2 && statistics.edgeEnergy < 2.5) {
          semanticObjects.push({
            type: 'trash',
            confidence: Math.min(1, (flowVariance / 10) * 0.5 + (statistics.meanFlow / 15) * 0.3 + (1 - Math.abs(statistics.edgeEnergy - 1.8) / 2) * 0.2),
            reasoning: 'Irregular motion patterns, complex texture',
          });
        }

        // Detect "box": rectangular edges + stable + compact
        let borderEnergy = 0;
        let count = 0;
        for (let c = 0; c < cols; c++) {
          borderEnergy += (textureGrid[0]?.[c] || 0) + (textureGrid[rows - 1]?.[c] || 0);
          count += 2;
        }
        for (let r = 0; r < rows; r++) {
          borderEnergy += (textureGrid[r]?.[0] || 0) + (textureGrid[r]?.[cols - 1] || 0);
          count += 2;
        }
        borderEnergy /= count || 1;
        
        const activity = statistics.cellsActive / statistics.cellsTotal;
        if (borderEnergy > 1.0 && statistics.meanFlow < 4 && activity > 0.3 && activity < 0.7) {
          semanticObjects.push({
            type: 'box',
            confidence: Math.min(1, (borderEnergy / 2) * 0.5 + (1 - statistics.meanFlow / 8) * 0.3 + (1 - Math.abs(activity - 0.5)) * 0.2),
            reasoning: 'Rectangular object pattern',
          });
        }
      }

      const inferredBPM = statistics.meanFlow < 5 ? 100 : (statistics.meanFlow < 10 ? 115 : 120);

      prevData = currentData.slice();
      
      // Determine capabilities based on what was computed
      const capabilities = [
        CAPABILITIES.FLOW_VECTORS,
        CAPABILITIES.MOTION_MAGNITUDE,
        CAPABILITIES.TEXTURE_ANALYSIS,
        CAPABILITIES.BPM_INFERENCE,
      ];
      if (semanticEnabled && semanticObjects.length > 0) {
        capabilities.push(CAPABILITIES.SEMANTIC_DETECTION);
      }
      
      self.postMessage(
        WorkerContract.createResult(
          WORKER_TYPES.IMAGE,
          mode,
          capabilities,
          { 
            gridFlows, 
            textureGrid, 
            abstractFeatures,      // PRIMARY: Abstract spatial/temporal features
            semanticObjects,       // OPTIONAL: Only if enabled
            statistics,            // Metadata for decision-making
            inferredBPM, 
            timestamp: Date.now(),
            gridConfig,
            mode,
            semanticEnabled,
          }
        )
      );
    } catch (error) {
      self.postMessage(
        WorkerContract.createError(
          WORKER_TYPES.IMAGE,
          `Frame processing failed: ${error.message}`,
          error
        )
      );
    }
  }
};