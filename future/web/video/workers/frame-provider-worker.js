// filepath: future/web/video/workers/frame-provider-worker.js
import { installWorkerMonitor } from '../../ui/dev-panel/worker-instrument.js';

let canvas = null, ctx = null, videoStreamReader = null;
let isRunning = false, frameCounter = 0;

// Throttling state
let frameSkipRate = 1;     // Process every frame by default
let resolutionScale = 1.0; // Full resolution by default

const { instrumentSync } = installWorkerMonitor('FrameProvider');

const provideFrame = instrumentSync(() => {
  if (!isRunning || !videoStreamReader || !ctx) return;
  
  frameCounter++;
  // Apply frame skipping
  if (frameSkipRate > 1 && (frameCounter % frameSkipRate) !== 0) {
    return; // Skip this frame processing
  }
  
  try {
    const scaledWidth = Math.floor(canvas.width * resolutionScale);
    const scaledHeight = Math.floor(canvas.height * resolutionScale);

    // Draw the stream to the canvas, potentially scaled down
    ctx.drawImage(videoStreamReader, 0, 0, scaledWidth, scaledHeight);
    const imageData = ctx.getImageData(0, 0, scaledWidth, scaledHeight);
    
    self.postMessage({
      type: 'frame',
      payload: {
        frameId: frameCounter,
        startTime: performance.now(),
        imageDataBuffer: imageData.data.buffer,
        width: imageData.width,
        height: imageData.height,
        // Also send back metadata about the current throttling state
        resolutionScale,
        frameSkipRate
      }
    }, [imageData.data.buffer]);

  } catch (e) {
    if (e.name === 'InvalidStateError') isRunning = false;
  }
});

function loop() {
  provideFrame();
  if (isRunning) requestAnimationFrame(loop);
}

self.onmessage = (event) => {
  const { type, payload } = event.data;
  switch (type) {
    case 'init':
      canvas = payload.canvas;
      ctx = canvas.getContext('2d');
      videoStreamReader = payload.streamReader;
      self.postMessage({ type: 'ready' });
      break;
    case 'start':
      if (!isRunning) { isRunning = true; requestAnimationFrame(loop); }
      break;
    case 'stop':
      isRunning = false;
      break;
    // New throttling commands
    case 'setFrameSkipRate':
      frameSkipRate = Math.max(1, Math.floor(payload.skipRate || 1));
      break;
    case 'setResolutionScale':
      resolutionScale = Math.max(0.1, Math.min(1.0, payload.scale || 1.0));
      break;
  }
};