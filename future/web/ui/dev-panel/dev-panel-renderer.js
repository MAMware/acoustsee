// Dev-panel renderer for the overlay canvas (renamed for consistency)

let ctx;
let canvas;
let videoEl = null;

export function initializeDevPanelRenderer(engine, DOM) {
  canvas = DOM.debugOverlayCanvas || document.getElementById('debugOverlayCanvas');
  videoEl = DOM.videoFeed || document.getElementById('videoFeed');
  if (!canvas || !videoEl) return;
  ctx = canvas.getContext('2d');

  // Keep canvas sized to video feed
  function resize() {
    if (!videoEl) return;
    const w = videoEl.videoWidth || videoEl.clientWidth;
    const h = videoEl.videoHeight || videoEl.clientHeight;
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  // Render on state change to avoid heavy per-frame work when idle
  engine.onStateChange(state => {
    try {
      resize();
      render(state);
    } catch (e) { /* best-effort */ }
  });
}

function render(state) {
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const result = state && state.lastProcessingResult;
  if (!result) return;

  if (state.currentMode === 'flow') {
    drawFlowModeDebug(result);
  } else if (state.currentMode === 'focus') {
    drawFocusModeDebug(result);
  }
  try {
    if (state && state.dualModeWIP) {
      ctx.save();
      ctx.fillStyle = 'rgba(180,20,20,0.06)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      const text = 'WIP MODE (SIMULATED) ARCH-3';
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(-0.35);
      ctx.font = 'bold 48px sans-serif';
      ctx.fillStyle = 'rgba(220,40,40,0.16)';
      ctx.textAlign = 'center';
      ctx.fillText(text, 0, 0);

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.font = '14px sans-serif';
      ctx.fillStyle = 'rgba(220,40,40,0.95)';
      const caption = 'This is a simulated mode change. Heavy ML pipelines are disabled.';
      ctx.fillText(caption, 12, canvas.height - 12);
      ctx.restore();
    }
  } catch (e) { /* best-effort watermark; ignore errors */ }
}

function drawFlowModeDebug(result) {
  if (!result || !result.movingRegions) return;
  ctx.fillStyle = 'rgba(255, 100, 0, 0.5)';
  for (const region of result.movingRegions) {
    ctx.beginPath();
    ctx.arc(region.x, region.y, region.radius || 10, 0, 2 * Math.PI);
    ctx.fill();
  }
}

function drawFocusModeDebug(result) {
  if (!result || !result.identifiedObjects) return;
  for (const obj of result.identifiedObjects) {
    ctx.strokeStyle = '#00FF00';
    ctx.lineWidth = 2;
    const b = obj.bbox || obj;
    ctx.strokeRect(b.x, b.y, b.width, b.height);

    ctx.fillStyle = '#00FF00';
    ctx.font = '16px sans-serif';
    const label = `${obj.label || 'obj'} (${(obj.confidence||0).toFixed(2)})`;
    ctx.fillText(label, b.x, Math.max(12, b.y - 6));
  }
}
