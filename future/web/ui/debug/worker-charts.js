// Lightweight charting helpers for Worker Explorer
export class RingBuffer {
  constructor(size) {
    this.size = size >>> 0;
    this.buf = new Uint8Array(this.size);
    this.start = 0; this.length = 0;
  }
  push(v) {
    const val = Math.max(0, Math.min(255, Math.round(v)));
    if (this.length < this.size) {
      this.buf[(this.start + this.length) % this.size] = val;
      this.length++;
    } else {
      this.buf[this.start] = val;
      this.start = (this.start + 1) % this.size;
    }
  }
  toArray() {
    const out = new Uint8Array(this.length);
    for (let i = 0; i < this.length; i++) out[i] = this.buf[(this.start + i) % this.size];
    return out;
  }
  clear() { this.start = 0; this.length = 0; }
}

export function scaleCanvasForDPR(canvas, widthCss, heightCss) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  canvas.width = Math.round(widthCss * dpr);
  canvas.height = Math.round(heightCss * dpr);
  canvas.style.width = `${widthCss}px`;
  canvas.style.height = `${heightCss}px`;
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return ctx;
}

export function makeThrottledRenderer(renderFn, hz = 2) {
  const minMs = Math.max(16, Math.floor(1000 / Math.max(1, hz)));
  let last = 0, scheduled = false;
  return function requestRender() {
    const now = performance.now();
    if (now - last >= minMs) {
      scheduled = false; last = now; requestAnimationFrame(renderFn);
    } else if (!scheduled) {
      scheduled = true;
      setTimeout(() => { scheduled = false; last = performance.now(); requestAnimationFrame(renderFn); }, minMs - (now - last));
    }
  };
}

function idToColor(id) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) h = Math.imul(h ^ id.charCodeAt(i), 16777619) >>> 0;
  const hue = (h % 360);
  return `hsl(${hue} 72% 58%)`;
}

export function drawMultiSparkline(canvas, seriesMap, colors = {}, opts = {}) {
  const ctx = canvas.getContext('2d');
  const width = canvas.clientWidth || parseFloat(canvas.style.width) || 320;
  const height = canvas.clientHeight || parseFloat(canvas.style.height) || 48;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = opts.background || '#020202';
  ctx.fillRect(0, 0, width, height);
  ctx.strokeStyle = 'rgba(255,255,255,0.04)'; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 1; i <= 2; i++) { const y = (height / 3) * i; ctx.moveTo(0, y); ctx.lineTo(width, y); }
  ctx.stroke();
  const pad = opts.pad || 3;
  const maxSamples = Math.max(1, ...Array.from(seriesMap.values()).map(a => a.length));
  const ids = Array.from(seriesMap.keys());
  ids.forEach((id) => {
    const arr = seriesMap.get(id) || new Uint8Array(0);
    const color = colors[id] || idToColor(String(id));
    ctx.strokeStyle = color; ctx.lineWidth = 1.6; ctx.beginPath();
    for (let i = 0; i < arr.length; i++) {
      const x = pad + (i / Math.max(1, maxSamples - 1)) * (width - pad * 2);
      const v = (arr[i] / 100) || 0;
      const y = height - pad - v * (height - pad * 2);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.lineTo(width - pad, height - pad); ctx.lineTo(pad, height - pad); ctx.closePath();
    ctx.fillStyle = `${color.replace('hsl', 'hsla').replace(')', ', 0.06)')}`;
    ctx.fill();
  });
  ctx.font = '10px system-ui, sans-serif'; ctx.fillStyle = '#bfead6'; ctx.textBaseline = 'top';
  let xOff = 6;
  ids.slice(0, 6).forEach((id) => {
    const arr = seriesMap.get(id) || new Uint8Array(0);
    const latest = arr.length ? arr[arr.length - 1] : '-';
    const color = colors[id] || idToColor(String(id));
    ctx.fillStyle = color; ctx.fillRect(width - 6 - xOff, 6, 8, 8);
    ctx.fillStyle = '#bfead6'; ctx.fillText(String(latest) + (latest === '-' ? '' : '%'), width - 6 - xOff - 36, 6);
    xOff += 46;
  });
}
