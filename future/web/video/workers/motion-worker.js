// Minimal motion-worker: receives Y-plane ArrayBuffer and returns compact moving regions.
// It uses a simple threshold-based difference check on a grid to identify motion points. 
// This approach is efficient and works well for basic motion detection needs.
// The worker communicates results back to the main thread with minimal overhead.
// It maintains state between frames to improve detection accuracy over time.
// This is a simpler alternative to the more complex frame-worker.js motion detection.
// It is suitable for scenarios where quick and lightweight motion detection is required.
// It can be extended in the future for more advanced features if needed.
// The code is designed to be easy to understand and modify for specific use cases.
// It avoids complex algorithms to ensure low latency and resource usage.
// REVISON 2025-09-11=R11925 - initial version, lets verify all the comments and the fact that we have frame-worker.js and justify why we have both.

// State to hold previous Y-plane data between frames for difference calculation (R11925: we could use a ring buffer for N frames?) 
let _prevY = null;
let _width = 0;
let _height = 0;
let _adaptiveThreshold = 20; // Start with default threshold

function simpleDetectYMotion(yBuf, width, height, step = 6, threshold = 20, maxRegions = 64) {
  const y = new Uint8Array(yBuf);
  if (!_prevY || _prevY.length !== y.length) {
    _prevY = new Uint8Array(y.length);
    _width = width; _height = height;
  }

  const coords = new Uint16Array(maxRegions * 2);
  const intens = new Uint8Array(maxRegions);
  let count = 0;

  for (let yy = 0; yy < height; yy += step) {
    for (let xx = 0; xx < width; xx += step) {
      const idx = yy * width + xx;
      const d = Math.abs(y[idx] - _prevY[idx]);
      if (d >= _adaptiveThreshold) {
        if (count < maxRegions) {
          coords[count * 2] = xx;
          coords[count * 2 + 1] = yy;
          intens[count] = d;
        }
        count++;
      }
    }
  }

  // store current y for next frame
  _prevY.set(y);

  // Adaptive threshold adjustment
  const oldThreshold = _adaptiveThreshold;
  if (count < 10) {
    _adaptiveThreshold = Math.max(5, _adaptiveThreshold * 0.95); // Lower threshold if too few detections
  } else if (count > 50) {
    _adaptiveThreshold = Math.min(50, _adaptiveThreshold * 1.05); // Raise threshold if too many detections
  }
  if (_adaptiveThreshold !== oldThreshold) {
    console.log(`Motion threshold adjusted from ${oldThreshold} to ${_adaptiveThreshold} (count: ${count})`);
  }

  // trim to maxRegions
  const returnedCount = Math.min(count, maxRegions);
  return { coords, intens, count: returnedCount };
}

self.onmessage = (ev) => {
  const msg = ev.data || {};
  if (msg.type === 'frame') {
    try {
      const { ts = 0, w = 0, h = 0, yBuffer, step = 6, threshold = 20, maxRegions = 64 } = msg;
      if (!yBuffer) {
        self.postMessage({ type: 'motion', ts, count: 0, coordsBuffer: new Uint16Array(0).buffer, intensBuffer: new Uint8Array(0).buffer });
        return;
      }
      const res = simpleDetectYMotion(yBuffer, w, h, step, threshold, maxRegions);
      // Transfer results
      const toSend = {
        type: 'motion',
        ts,
        count: res.count,
        coordsBuffer: res.coords.buffer,
        intensBuffer: res.intens.buffer
      };
      self.postMessage(toSend, [res.coords.buffer, res.intens.buffer]);
    } catch (e) {
      self.postMessage({ type: 'error', message: e && e.message ? e.message : String(e) });
    }
  } else if (msg.type === 'handshake') {
    // capability negotiation: we can support 'motion' and later depth/object if loaded
    self.postMessage({ type: 'ready', features: ['motion'] });
  } else if (msg.type === 'simulate') {
    // Respond to simulation request so the main thread can detect worker can run in simulated mode.
    self.postMessage({ type: 'ready', features: ['motion'], simulated: true });
  }
};
