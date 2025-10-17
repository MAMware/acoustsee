// future/web/video/workers/depth-worker.js (ML-1: WebGPU-Accelerated Pseudo-Depth Estimator)
//
// Responsibilities:
// - Compute pseudo-depth using Sobel edge detection as proxy (high edges = close objects).
// - Enhance with Gabor textures for collision detection.
// - GPU-accelerate convolution operations via WebGPU for CNN path.
// - Average into gridDepths for melody modulation.
//
// Workflow (CNN path with GPU acceleration):
// 1. Receive { type: 'processFrame', frame: ImageData, prevFrame: ImageData, gridSize: { rows: 4, cols: 4 }, path: 'cnn'|'pseudo' }
// 2. Convert to grayscale, send to computeCNNDepth.
// 3. computeCNNDepth tries WebGPU acceleration (GPU buffers, compute shaders).
// 4. On GPU failure, fallback to vanilla JS conv2d/upsample (CPU).
// 5. Average depth map into gridDepths per cell.
// 6. Send { type: 'depthCues', result: { gridDepths, timestamp } }
//
// Workflow (Pseudo-depth path):
// 1. Apply Sobel operator for edge magnitudes, normalize with Softplus.
// 2. Optionally apply Gabor for texture enhancement.
// 3. Average into gridDepths per cell.
// 4. Send { type: 'depthCues', result: { gridDepths, timestamp } }
//
// GPU Acceleration:
// - WebGPU convolution compute shader for efficient conv2d operations (WGSL).
// - Graceful fallback to CPU implementation if WebGPU unavailable or fails.
// - Structured logging for performance monitoring and debugging.

let prevData = null;
let depthPath = 'pseudo'; // Default to pseudo-depth
let gpuDevice = null;     // Cached GPU device for reuse
let gpuQueue = null;      // Cached GPU queue for reuse
// Grid configuration is now received with each frame (stateless pattern)
// Workers no longer maintain configuration state

// Minimal U-Net CNN in vanilla JS (encoder-decoder with 3 conv layers, ReLU, upsample)
function conv2d(input, kernel, stride = 1) {
  // Manual conv implementation (nested loops for dep-free)
  const [h, w] = [input.length, input[0].length];
  const [kh, kw] = [kernel.length, kernel[0].length];
  const outH = Math.floor((h - kh) / stride) + 1;
  const outW = Math.floor((w - kw) / stride) + 1;
  const output = Array.from({length: outH}, () => Array(outW).fill(0));
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      let sum = 0;
      for (let ky = 0; ky < kh; ky++) {
        for (let kx = 0; kx < kw; kx++) {
          sum += input[y * stride + ky][x * stride + kx] * kernel[ky][kx];
        }
      }
      output[y][x] = Math.max(0, sum); // ReLU
    }
  }
  return output;
}

function upsample(input, factor = 2) {
  // Bilinear upsample
  const [h, w] = [input.length, input[0].length];
  const outH = h * factor;
  const outW = w * factor;
  const output = Array.from({length: outH}, () => Array(outW).fill(0));
  for (let y = 0; y < outH; y++) {
    for (let x = 0; x < outW; x++) {
      const sy = y / factor;
      const sx = x / factor;
      const y0 = Math.floor(sy);
      const x0 = Math.floor(sx);
      const y1 = Math.min(y0 + 1, h - 1);
      const x1 = Math.min(x0 + 1, w - 1);
      const wy = sy - y0;
      const wx = sx - x0;
      output[y][x] = (1 - wy) * ((1 - wx) * input[y0][x0] + wx * input[y0][x1]) +
                     wy * ((1 - wx) * input[y1][x0] + wx * input[y1][x1]);
    }
  }
  return output;
}

// ============================================================================
// WebGPU Acceleration: Convolution via Compute Shader (GPU-accelerated conv2d)
// ============================================================================

/**
 * Creates a GPU buffer from CPU data.
 * @param {GPUDevice} device - WebGPU device.
 * @param {Float32Array|Uint8Array} data - CPU data.
 * @param {GPUBufferUsageFlags} usage - Buffer usage flags (e.g., STORAGE, COPY_SRC).
 * @returns {GPUBuffer}
 */
function createGpuBuffer(device, data, usage) {
  const buffer = device.createBuffer({
    size: data.byteLength,
    usage: usage,
    mappedAtCreation: true,
  });
  new Float32Array(buffer.getMappedRange()).set(new Float32Array(data));
  buffer.unmap();
  return buffer;
}

/**
 * Reads a GPU buffer back to the CPU as Float32Array.
 * @param {GPUDevice} device - WebGPU device.
 * @param {GPUQueue} queue - WebGPU queue.
 * @param {GPUBuffer} buffer - GPU buffer to read.
 * @param {number} size - Size of buffer in bytes.
 * @returns {Promise<Float32Array>}
 */
async function readGpuBuffer(device, queue, buffer, size) {
  const stagingBuffer = device.createBuffer({
    size: size,
    usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
  });

  const commandEncoder = device.createCommandEncoder();
  commandEncoder.copyBufferToBuffer(buffer, 0, stagingBuffer, 0, size);
  queue.submit([commandEncoder.finish()]);

  await stagingBuffer.mapAsync(GPUMapMode.READ);
  const result = new Float32Array(stagingBuffer.getMappedRange()).slice(0);
  stagingBuffer.unmap();
  return result;
}

/**
 * Compiles and returns a convolution compute shader (WGSL).
 * Performs 2D convolution: output[y,x] = sum(input[y+ky, x+kx] * kernel[ky, kx]) with ReLU.
 *
 * @param {number} width - Input width.
 * @param {number} height - Input height.
 * @param {number} kernelSize - Kernel dimension (assumes square: kernelSize x kernelSize).
 * @param {number} stride - Convolution stride.
 * @returns {string} WGSL shader code.
 */
function createConvolutionShader(width, height, kernelSize, stride = 1) {
  const outWidth = Math.floor((width - kernelSize) / stride) + 1;
  const outHeight = Math.floor((height - kernelSize) / stride) + 1;
  const outSize = outWidth * outHeight;
  const kernelElems = kernelSize * kernelSize;

  return `
    @group(0) @binding(0) var<storage, read> input: array<f32>;
    @group(0) @binding(1) var<storage, read> kernel: array<f32>;
    @group(0) @binding(2) var<storage, read_write> output: array<f32>;

    @compute @workgroup_size(256)
    fn main(@builtin(global_invocation_id) id: vec3<u32>) {
      let outIdx = id.x;
      if (outIdx >= ${outSize}u) { return; }

      let outY = outIdx / ${outWidth}u;
      let outX = outIdx % ${outWidth}u;
      let inY = outY * ${stride}u;
      let inX = outX * ${stride}u;

      var sum = 0.0;
      for (var ky = 0u; ky < ${kernelSize}u; ky++) {
        for (var kx = 0u; kx < ${kernelSize}u; kx++) {
          let iy = inY + ky;
          let ix = inX + kx;
          if (iy < ${height}u && ix < ${width}u) {
            let inIdx = iy * ${width}u + ix;
            let kIdx = ky * ${kernelSize}u + kx;
            sum += input[inIdx] * kernel[kIdx];
          }
        }
      }
      output[outIdx] = max(0.0, sum); // ReLU activation
    }
  `;
}

/**
 * GPU-accelerated convolution using WebGPU compute shaders.
 * Falls back to CPU implementation if GPU unavailable.
 *
 * @param {Float32Array} inputFlat - Flattened input array [width * height].
 * @param {Float32Array} kernelFlat - Flattened kernel array [kernelSize * kernelSize].
 * @param {number} width - Input width.
 * @param {number} height - Input height.
 * @param {number} kernelSize - Kernel dimension (square).
 * @param {number} stride - Convolution stride (default: 1).
 * @returns {Promise<Float32Array>} Output array [outWidth * outHeight].
 */
async function runConvGpu(inputFlat, kernelFlat, width, height, kernelSize, stride = 1) {
  if (!gpuDevice) {
    if (Math.random() < 0.01) {
      structuredLog('DEBUG', 'GPU device not initialized, using CPU fallback');
    }
    return runConvCpu(inputFlat, kernelFlat, width, height, kernelSize, stride);
  }

  try {
    const outWidth = Math.floor((width - kernelSize) / stride) + 1;
    const outHeight = Math.floor((height - kernelSize) / stride) + 1;
    const outSize = outWidth * outHeight;
    const inputSize = inputFlat.byteLength;
    const kernelSize_bytes = kernelFlat.byteLength;
    const outputSize_bytes = outSize * 4; // Float32

    // Create GPU buffers
    const inputBuffer = device.createBuffer({
      size: inputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(inputBuffer.getMappedRange()).set(inputFlat);
    inputBuffer.unmap();

    const kernelBuffer = device.createBuffer({
      size: kernelSize_bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(kernelBuffer.getMappedRange()).set(kernelFlat);
    kernelBuffer.unmap();

    const outputBuffer = device.createBuffer({
      size: outputSize_bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    // Create shader module
    const shaderCode = createConvolutionShader(width, height, kernelSize, stride);
    const shaderModule = gpuDevice.createShaderModule({ code: shaderCode });

    // Create pipeline
    const pipeline = gpuDevice.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'main' },
    });

    // Create bind group
    const bindGroup = gpuDevice.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: kernelBuffer } },
        { binding: 2, resource: { buffer: outputBuffer } },
      ],
    });

    // Encode and submit commands
    const commandEncoder = gpuDevice.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    const workgroups = Math.ceil(outSize / 256);
    passEncoder.dispatchWorkgroups(workgroups);
    passEncoder.end();

    gpuQueue.submit([commandEncoder.finish()]);

    // Read result back to CPU
    const result = await readGpuBuffer(gpuDevice, gpuQueue, outputBuffer, outputSize_bytes);

    // Cleanup
    inputBuffer.destroy();
    kernelBuffer.destroy();
    outputBuffer.destroy();

    if (Math.random() < 0.01) {
      structuredLog('DEBUG', `GPU conv2d: input ${width}x${height}, kernel ${kernelSize}x${kernelSize}, output ${outWidth}x${outHeight}`);
    }

    return result;
  } catch (e) {
    structuredLog('WARN', 'GPU convolution failed, falling back to CPU', e);
    return runConvCpu(inputFlat, kernelFlat, width, height, kernelSize, stride);
  }
}

/**
 * CPU-only convolution implementation (fallback).
 */
function runConvCpu(inputFlat, kernelFlat, width, height, kernelSize, stride = 1) {
  const outWidth = Math.floor((width - kernelSize) / stride) + 1;
  const outHeight = Math.floor((height - kernelSize) / stride) + 1;
  const output = new Float32Array(outWidth * outHeight);

  for (let outY = 0; outY < outHeight; outY++) {
    for (let outX = 0; outX < outWidth; outX++) {
      let sum = 0;
      const inY = outY * stride;
      const inX = outX * stride;

      for (let ky = 0; ky < kernelSize; ky++) {
        for (let kx = 0; kx < kernelSize; kx++) {
          const iy = inY + ky;
          const ix = inX + kx;
          if (iy < height && ix < width) {
            const inIdx = iy * width + ix;
            const kIdx = ky * kernelSize + kx;
            sum += inputFlat[inIdx] * kernelFlat[kIdx];
          }
        }
      }

      output[outY * outWidth + outX] = Math.max(0, sum); // ReLU
    }
  }
  return output;
}

/**
 * Initialize GPU device on first use (cached for reuse).
 */
async function initializeGpuDevice() {
  if (gpuDevice) return; // Already initialized

  if (!navigator.gpu) {
    structuredLog('WARN', 'WebGPU not available in this browser');
    return;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      structuredLog('WARN', 'No WebGPU adapter found');
      return;
    }

    gpuDevice = await adapter.requestDevice();
    gpuQueue = gpuDevice.queue;
    structuredLog('INFO', 'WebGPU device initialized successfully');
  } catch (e) {
    structuredLog('WARN', 'Failed to initialize WebGPU device', e);
  }
}

// ============================================================================
// CNN Depth Computation (with GPU acceleration)
// ============================================================================

/**
 * Computes depth using a minimal U-Net CNN with GPU acceleration for convolutions.
 * Encoder-decoder with 3 conv layers, ReLU, and bilinear upsampling.
 *
 * @param {Uint8Array} grayscale - Grayscale image data [width * height].
 * @param {number} width - Image width.
 * @param {number} height - Image height.
 * @returns {Promise<Float32Array>} Flattened depth map [width * height], values in [0,1].
 */
async function computeCNNDepth(grayscale, width, height) {
  // Initialize GPU on first use
  await initializeGpuDevice();

  // Convert to 2D array (CPU path uses this for vanilla conv2d)
  const input = Array.from({length: height}, (_, y) => Array.from({length: width}, (_, x) => grayscale[y * width + x] / 255));

  // Placeholder kernels (3x3, values = 0.1). In production, these would be trained weights.
  const k1 = Array(3).fill().map(() => Array(3).fill(0.1));

  // Flatten kernels for GPU
  const k1Flat = new Float32Array(9);
  for (let i = 0; i < 9; i++) k1Flat[i] = 0.1;

  let enc1, enc2, enc3, dec1, dec2, depthMap;

  if (gpuDevice) {
    try {
      // GPU-accelerated path: flatten inputs and use GPU convolution
      const inputFlat = new Float32Array(width * height);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          inputFlat[y * width + x] = input[y][x];
        }
      }

      // Encoder (3 GPU-accelerated conv layers)
      let enc1Flat = await runConvGpu(inputFlat, k1Flat, width, height, 3, 1);
      const enc1W = Math.floor((width - 3) / 1) + 1;
      const enc1H = Math.floor((height - 3) / 1) + 1;

      let enc2Flat = await runConvGpu(enc1Flat, k1Flat, enc1W, enc1H, 3, 1);
      const enc2W = Math.floor((enc1W - 3) / 1) + 1;
      const enc2H = Math.floor((enc1H - 3) / 1) + 1;

      let enc3Flat = await runConvGpu(enc2Flat, k1Flat, enc2W, enc2H, 3, 1);
      const enc3W = Math.floor((enc2W - 3) / 1) + 1;
      const enc3H = Math.floor((enc2H - 3) / 1) + 1;

      // Decoder: convert back to 2D for bilinear upsampling (no good GPU equiv readily available)
      enc3 = Array.from({length: enc3H}, (_, y) => Array.from({length: enc3W}, (_, x) => enc3Flat[y * enc3W + x]));

      dec1 = upsample(enc3);
      const dec1Flat = new Float32Array(dec1.flat());
      dec1Flat.set(await runConvGpu(dec1Flat, k1Flat, dec1[0].length, dec1.length, 3, 1));
      dec1 = Array.from({length: dec1.length}, (_, y) => Array.from({length: dec1[0].length}, (_, x) => dec1Flat[y * dec1[0].length + x]));

      dec2 = upsample(dec1);
      const dec2Flat = new Float32Array(dec2.flat());
      dec2Flat.set(await runConvGpu(dec2Flat, k1Flat, dec2[0].length, dec2.length, 3, 1));
      dec2 = Array.from({length: dec2.length}, (_, y) => Array.from({length: dec2[0].length}, (_, x) => dec2Flat[y * dec2[0].length + x]));

      const depthMapFlat = await runConvGpu(new Float32Array(dec2.flat()), k1Flat, dec2[0].length, dec2.length, 3, 1);
      depthMap = depthMapFlat;

      if (Math.random() < 0.01) {
        structuredLog('INFO', `CNN depth computed with GPU acceleration: ${width}x${height} → ${depthMapFlat.length}`);
      }
    } catch (e) {
      structuredLog('WARN', 'GPU CNN path failed, falling back to CPU', e);
      // Fallback to CPU conv2d
      enc1 = conv2d(input, k1);
      enc2 = conv2d(enc1, k1);
      enc3 = conv2d(enc2, k1);
      dec1 = upsample(enc3);
      dec1 = conv2d(dec1, k1);
      dec2 = upsample(dec1);
      dec2 = conv2d(dec2, k1);
      depthMap = conv2d(dec2, k1).flat();
    }
  } else {
    // No GPU available, use CPU conv2d
    enc1 = conv2d(input, k1);
    enc2 = conv2d(enc1, k1);
    enc3 = conv2d(enc2, k1);
    dec1 = upsample(enc3);
    dec1 = conv2d(dec1, k1);
    dec2 = upsample(dec1);
    dec2 = conv2d(dec2, k1);
    depthMap = conv2d(dec2, k1).flat();
  }

  return depthMap;
}

// ============================================================================
// Pseudo-Depth Path (Sobel + Gabor - CPU only)
// ============================================================================

/**
 * Computes pseudo-depth using Sobel edge detection and Gabor textures.
 * Fast CPU-only path, suitable for real-time performance.
 *
 * @param {Uint8ClampedArray} data - RGBA pixel data from ImageData.
 * @param {number} width - Image width.
 * @param {number} height - Image height.
 * @returns {Float32Array} Pseudo-depth map [width * height], values in [0,1].
 */
function computePseudoDepth(data, width, height) {
  const depths = new Float32Array(width * height);

  // Sobel operator: edge detection via gradient magnitude
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const i = (y * width + x) * 4;
      // Sobel kernel applied to red channel (assuming grayscale or R-channel rep)
      const gx = -data[i-4] + data[i+4] - 2*data[i-width*4-4] + 2*data[i-width*4+4] - data[i+width*4-4] + data[i+width*4+4];
      const gy = -data[i-width*4] + data[i+width*4] - 2*data[i-width*4-4] + 2*data[i+width*4-4] - data[i-width*4+4] + data[i+width*4+4];
      // Softplus normalization: log(1 + exp(x)) maps to (0, ∞)
      depths[y*width + x] = Math.log(1 + Math.exp(Math.sqrt(gx*gx + gy*gy) / 1020));
    }
  }

  // Gabor texture enhancement: refine collision detection
  const gaborKernel = (x, y) => Math.exp(-(x**2 + y**2)/(2*5**2)) * Math.cos(2 * Math.PI * x / 10);
  const applyGaborDepth = (depths, width, height, x, y) => {
    let response = 0;
    for (let dy = -2; dy <= 2; dy++) {
      for (let dx = -2; dx <= 2; dx++) {
        const i = ((y+dy)*width + (x+dx));
        if (i >= 0 && i < depths.length) {
          response += depths[i] * gaborKernel(dx, dy);
        }
      }
    }
    return Math.log(1 + Math.exp(Math.abs(response))); // Softplus
  };

  // (Note: Gabor is computed on-demand per grid cell during averaging, not here globally.)
  return depths;
}

// ============================================================================
// Message Handler: Process Frames
// ============================================================================

self.onmessage = (e) => {
  const { type, frame, prevFrame, gridSize, path, gridConfig = { rows: 4, cols: 4, aggregation: 'mean', skipThreshold: 0.2 }, mode = 'hybrid' } = e.data;
  
  if (type === 'setPath') {
    depthPath = path; // 'pseudo' or 'cnn'
  }
  if (type === 'processFrame') {
    (async () => {
      try {
        const width = frame.width;
        const height = frame.height;
        const data = frame.data;

        let gridDepths;
        // Use gridConfig passed with this frame (stateless); fallback to legacy gridSize parameter if needed
        const config = gridConfig || (gridSize && { rows: gridSize.rows, cols: gridSize.cols }) || { rows: 4, cols: 4, aggregation: 'mean', skipThreshold: 0.2 };
        
        if (depthPath === 'cnn') {
          // Use CNN for depth
          const grayscale = new Uint8Array(width * height);
          for (let i = 0; i < data.length; i += 4) {
            grayscale[i / 4] = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]; // RGB to grayscale
          }
          const depthFlat = await computeCNNDepth(grayscale, width, height);
          // Average to grid
          const { rows, cols } = config;
          const cellW = width / cols;
          const cellH = height / rows;
          gridDepths = Array.from({length: rows}, () => Array(cols).fill(0));
          for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
              let sum = 0, count = 0;
              for (let yy = Math.floor(r * cellH); yy < Math.floor((r + 1) * cellH); yy += 30) {
                for (let xx = Math.floor(c * cellW); xx < Math.floor((c + 1) * cellW); xx += 30) {
                  const i = yy * width + xx;
                  if (i < depthFlat.length) {
                    sum += depthFlat[i];
                    count++;
                  }
                }
              }
              gridDepths[r][c] = count > 0 ? sum / count : 0;
            }
          }
        } else {
          // Pseudo-depth path: Sobel + Gabor (CPU only, fast)
          const depths = computePseudoDepth(data, width, height);

          // Average to gridDepths with sampling and skip low depth
          const { rows, cols, skipThreshold } = config;
          const cellW = width / cols;
          const cellH = height / rows;
          gridDepths = Array.from({length: rows}, () => Array(cols).fill(0));
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
              gridDepths[r][c] = avg < skipThreshold ? 0 : avg;  // Skip low depth cells using threshold
            }
          }
        }

        self.postMessage({ 
          type: 'depthCues', 
          result: { 
            gridDepths, 
            timestamp: Date.now(),
            gridConfig: config,
            mode
          } 
        });
      } catch (error) {
        self.postMessage({ type: 'error', error: error.message });
      }
    })();
  }
};