import { structuredLog } from '../../utils/logging.js';

// ============================================================================
// Helper Functions
// ============================================================================

function conv2d(input, kernel, stride = 1) {
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

function createConvolutionShader(width, height, kernelSize, stride = 1) {
  const outWidth = Math.floor((width - kernelSize) / stride) + 1;
  const outSize = outWidth * Math.floor((height - kernelSize) / stride) + 1;

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

// ============================================================================
// Strategies
// ============================================================================

export class DepthStrategy {
  async init() {}
  async process(data, width, height) { throw new Error('Not implemented'); }
  isSupported() { return true; }
  dispose() {}
}

export class WebGPUDepthStrategy extends DepthStrategy {
  constructor() {
    super();
    this.gpuDevice = null;
    this.gpuQueue = null;
    this.name = 'WebGPU';
  }

  isSupported() {
    return !!navigator.gpu;
  }

  async init() {
    if (!this.isSupported()) throw new Error('WebGPU not supported');
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) throw new Error('No WebGPU adapter found');
    this.gpuDevice = await adapter.requestDevice();
    this.gpuQueue = this.gpuDevice.queue;
    structuredLog('INFO', 'WebGPUDepthStrategy initialized');
  }

  async process(data, width, height) {
    if (!this.gpuDevice) await this.init();

    // Convert to grayscale (0-1 float)
    const inputFlat = new Float32Array(width * height);
    for (let i = 0; i < width * height; i++) {
      inputFlat[i] = data[i * 4] / 255; // Use Red channel as grayscale proxy
    }

    // Placeholder kernels (3x3, values = 0.1)
    const k1Flat = new Float32Array(9).fill(0.1);

    // Encoder (3 GPU-accelerated conv layers)
    let enc1Flat = await this._runConvGpu(inputFlat, k1Flat, width, height, 3, 1);
    const enc1W = Math.floor((width - 3) / 1) + 1;
    const enc1H = Math.floor((height - 3) / 1) + 1;

    let enc2Flat = await this._runConvGpu(enc1Flat, k1Flat, enc1W, enc1H, 3, 1);
    const enc2W = Math.floor((enc1W - 3) / 1) + 1;
    const enc2H = Math.floor((enc1H - 3) / 1) + 1;

    let enc3Flat = await this._runConvGpu(enc2Flat, k1Flat, enc2W, enc2H, 3, 1);
    const enc3W = Math.floor((enc2W - 3) / 1) + 1;
    const enc3H = Math.floor((enc2H - 3) / 1) + 1;

    // Decoder: convert back to 2D for bilinear upsampling (CPU fallback for upsample)
    // Note: Ideally upsample would also be GPU, but for now we mix
    const enc3 = Array.from({length: enc3H}, (_, y) => Array.from({length: enc3W}, (_, x) => enc3Flat[y * enc3W + x]));

    let dec1 = upsample(enc3);
    const dec1Flat = new Float32Array(dec1.flat());
    dec1Flat.set(await this._runConvGpu(dec1Flat, k1Flat, dec1[0].length, dec1.length, 3, 1));
    dec1 = Array.from({length: dec1.length}, (_, y) => Array.from({length: dec1[0].length}, (_, x) => dec1Flat[y * dec1[0].length + x]));

    let dec2 = upsample(dec1);
    const dec2Flat = new Float32Array(dec2.flat());
    dec2Flat.set(await this._runConvGpu(dec2Flat, k1Flat, dec2[0].length, dec2.length, 3, 1));
    dec2 = Array.from({length: dec2.length}, (_, y) => Array.from({length: dec2[0].length}, (_, x) => dec2Flat[y * dec2[0].length + x]));

    const depthMapFlat = await this._runConvGpu(new Float32Array(dec2.flat()), k1Flat, dec2[0].length, dec2.length, 3, 1);
    
    return depthMapFlat;
  }

  async _runConvGpu(inputFlat, kernelFlat, width, height, kernelSize, stride = 1) {
    const outWidth = Math.floor((width - kernelSize) / stride) + 1;
    const outHeight = Math.floor((height - kernelSize) / stride) + 1;
    const outSize = outWidth * outHeight;
    const inputSize = inputFlat.byteLength;
    const kernelSize_bytes = kernelFlat.byteLength;
    const outputSize_bytes = outSize * 4;

    const inputBuffer = this.gpuDevice.createBuffer({
      size: inputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(inputBuffer.getMappedRange()).set(inputFlat);
    inputBuffer.unmap();

    const kernelBuffer = this.gpuDevice.createBuffer({
      size: kernelSize_bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      mappedAtCreation: true,
    });
    new Float32Array(kernelBuffer.getMappedRange()).set(kernelFlat);
    kernelBuffer.unmap();

    const outputBuffer = this.gpuDevice.createBuffer({
      size: outputSize_bytes,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const shaderCode = createConvolutionShader(width, height, kernelSize, stride);
    const shaderModule = this.gpuDevice.createShaderModule({ code: shaderCode });

    const pipeline = this.gpuDevice.createComputePipeline({
      layout: 'auto',
      compute: { module: shaderModule, entryPoint: 'main' },
    });

    const bindGroup = this.gpuDevice.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: inputBuffer } },
        { binding: 1, resource: { buffer: kernelBuffer } },
        { binding: 2, resource: { buffer: outputBuffer } },
      ],
    });

    const commandEncoder = this.gpuDevice.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(pipeline);
    passEncoder.setBindGroup(0, bindGroup);
    const workgroups = Math.ceil(outSize / 256);
    passEncoder.dispatchWorkgroups(workgroups);
    passEncoder.end();

    this.gpuQueue.submit([commandEncoder.finish()]);

    const result = await readGpuBuffer(this.gpuDevice, this.gpuQueue, outputBuffer, outputSize_bytes);

    inputBuffer.destroy();
    kernelBuffer.destroy();
    outputBuffer.destroy();

    return result;
  }
}

export class PseudoDepthStrategy extends DepthStrategy {
  constructor() {
    super();
    this.name = 'Pseudo';
  }

  async process(data, width, height) {
    const depths = new Float32Array(width * height);

    // Sobel operator: edge detection via gradient magnitude
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        // Sobel kernel applied to red channel
        const gx = -data[i-4] + data[i+4] - 2*data[i-width*4-4] + 2*data[i-width*4+4] - data[i+width*4-4] + data[i+width*4+4];
        const gy = -data[i-width*4] + data[i+width*4] - 2*data[i-width*4-4] + 2*data[i+width*4-4] - data[i-width*4+4] + data[i+width*4+4];
        // Softplus normalization
        depths[y*width + x] = Math.log(1 + Math.exp(Math.sqrt(gx*gx + gy*gy) / 1020));
      }
    }

    return depths;
  }
}

export const DEPTH_STRATEGIES = [
  WebGPUDepthStrategy,
  PseudoDepthStrategy
];
