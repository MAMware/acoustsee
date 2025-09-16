// Minimal worker charts utilities (RingBuffer and simple sparkline renderer)
// R16925: Code from legacy version of worker-charts.js from /trashcan/ui/debug can be used if needed.

export class RingBuffer {
  constructor(size = 64) { this.size = size; this.arr = []; }
  push(v) { this.arr.push(v); if (this.arr.length > this.size) this.arr.shift(); }
  toArray() { return Array.from(this.arr); }
}

export function makeThrottledRenderer(fn, fps = 10) {
  let scheduled = false;
  const minMs = 1000 / Math.max(1, fps);
  let last = 0;
  return function() {
    const now = performance.now();
    if (scheduled) return;
    if (now - last < minMs) {
      scheduled = true;
      setTimeout(() => { scheduled = false; last = performance.now(); fn(); }, minMs - (now - last));
    } else { last = now; fn(); }
  };
}

export function scaleCanvasForDPR(canvas, w, h) {
  const dpr = window.devicePixelRatio || 1;
  canvas.width = Math.round((w || canvas.width) * dpr);
  canvas.height = Math.round((h || canvas.height) * dpr);
  canvas.style.width = (w || canvas.width / dpr) + 'px';
  canvas.style.height = (h || canvas.height / dpr) + 'px';
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function drawMultiSparkline(canvas, seriesMap = new Map(), opts = {}) {
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const width = canvas.width / (window.devicePixelRatio || 1);
    const height = canvas.height / (window.devicePixelRatio || 1);
    ctx.clearRect(0, 0, width, height);
    const keys = Array.from(seriesMap.keys());
    keys.forEach((k, idx) => {
      const arr = seriesMap.get(k) || [];
      ctx.beginPath();
      const color = `hsl(${(idx * 137) % 360},72%,58%)`;
      ctx.strokeStyle = color;
      const max = Math.max(1, ...arr);
      arr.forEach((v, i) => {
        const x = (i / Math.max(1, arr.length - 1)) * width;
        const y = height - (v / max) * height;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });
  } catch (e) {}
}
