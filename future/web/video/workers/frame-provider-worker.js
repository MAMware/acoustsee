// filepath: future/web/video/workers/frame-provider-worker.js
let canvas = null, ctx = null, streamReader = null, reader = null;
let isRunning = false, frameCounter = 0;

// Throttling state
let frameSkipRate = 1;     // Process every frame by default
let resolutionScale = 1.0; // Full resolution by default

async function provideFrame() {
  // Standalone frame provider; instrumentation removed to avoid ui -> video import
  if (!isRunning || !reader || !ctx) return;
  
  try {
    const { value: videoFrame, done } = await reader.read();
    if (done || !videoFrame) {
      isRunning = false;
      return;
    }
    
    frameCounter++;
    // Apply frame skipping
    if (frameSkipRate > 1 && (frameCounter % frameSkipRate) !== 0) {
      videoFrame.close(); // Always close the frame to prevent memory leaks
      return; // Skip this frame processing
    }
    
    const scaledWidth = Math.floor(videoFrame.displayWidth * resolutionScale);
    const scaledHeight = Math.floor(videoFrame.displayHeight * resolutionScale);

    // Ensure canvas matches the frame size
    if (canvas.width !== scaledWidth || canvas.height !== scaledHeight) {
      canvas.width = scaledWidth;
      canvas.height = scaledHeight;
    }

    // Draw the video frame to the canvas
    ctx.drawImage(videoFrame, 0, 0, scaledWidth, scaledHeight);
    const imageData = ctx.getImageData(0, 0, scaledWidth, scaledHeight);
    
    // Close the video frame to free memory
    videoFrame.close();
    
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
    console.error('Frame provider error:', e);
    isRunning = false;
  }
}

async function loop() {
  await provideFrame();
  if (isRunning) requestAnimationFrame(loop);
}

self.onmessage = (event) => {
  const { type, payload } = event.data;
  switch (type) {
    case 'init':
      canvas = payload.canvas;
      ctx = canvas.getContext('2d');
      streamReader = payload.streamReader;
      reader = streamReader.getReader();
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