// Minimal motion-worker: receives Y-plane ArrayBuffer and returns compact moving regions.
let _prevY = null;
let _width = 0;
let _height = 0;

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
      if (d >= threshold) {
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
  }
};
