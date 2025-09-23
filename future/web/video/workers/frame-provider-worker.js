// filepath: future/web/video/workers/frame-provider-worker.js
import { installWorkerMonitor } from '../../ui/dev-panel/worker-instrument.js';

let canvas = null;
let ctx = null;
let videoStreamReader = null;
let isRunning = false;
const { instrumentSync } = installWorkerMonitor('FrameProvider');

// The main loop: grab a frame, get its data, and send it back.
const provideFrame = instrumentSync(() => {
  if (!isRunning || !videoStreamReader || !ctx) return;
  try {
    ctx.drawImage(videoStreamReader, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    
    // Post the ImageData. Its .data (a Uint8ClampedArray) is transferable.
    self.postMessage({
      type: 'frame',
      payload: {
        imageDataBuffer: imageData.data.buffer,
        width: imageData.width,
        height: imageData.height
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
      if (!isRunning) {
        isRunning = true;
        requestAnimationFrame(loop);
      }
      break;
    case 'stop':
      isRunning = false;
      break;
  }
};