// Worker: simple motion detector that compares current frame to previous frame
// and returns a list of moving pixel points. The worker keeps prevFrameData
// internally to avoid round-tripping that state across messages.

let prevFrameData = null;

self.onmessage = function (ev) {
  const msg = ev.data || {};
  if (msg.type === 'process') {
    const { frameBuffer, width, height, motionThreshold = 20, maxRegions = 128 } = msg;
    try {
      if (!frameBuffer || !width || !height) {
        self.postMessage({ type: 'result', result: { movingRegions: [] } });
        return;
      }

      const frame = new Uint8ClampedArray(frameBuffer);
      if (!prevFrameData || prevFrameData.length !== frame.length) prevFrameData = new Uint8ClampedArray(frame.length);

      const movingRegions = [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const r = frame[idx];
          const g = frame[idx + 1];
          const b = frame[idx + 2];
          const intensity = (r + g + b) / 3;

          const pr = prevFrameData[idx] || 0;
          const pg = prevFrameData[idx + 1] || 0;
          const pb = prevFrameData[idx + 2] || 0;
          const prevIntensity = (pr + pg + pb) / 3;

          const delta = Math.abs(intensity - prevIntensity);
          if (delta > motionThreshold) {
            movingRegions.push({ pixelX: x, pixelY: y, intensity, delta });
          }
        }
      }

      // Keep only the largest deltas
      movingRegions.sort((a, b) => b.delta - a.delta);
      const sliced = movingRegions.slice(0, maxRegions);

      // Update prev data
      prevFrameData.set(frame);

      self.postMessage({ type: 'result', result: { movingRegions: sliced } });
    } catch (e) {
      self.postMessage({ type: 'result', result: { movingRegions: [] } });
    }
  } else if (msg.type === 'reset') {
    prevFrameData = null;
  }
};
