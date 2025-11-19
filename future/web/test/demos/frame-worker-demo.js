import { createInitialState } from '../../core/state.js';
import { setExternalFrameBuffer, enableFrameWorker, enableWorkerTransfer, shutdownFrameWorker } from '../../video/frame-processor.js';

const video = { /* stub for demo */ };
const canvas = { width: 640, height: 480, getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(640 * 480 * 4) }) }) };

let stream = null;
let procTimer = null;
let processing = false;
let buf = null;
const settings = createInitialState();

function log(...args) { console.log('[demo]', ...args); }

// Demo engine stub to emulate engine.dispatch for allocation commands
const demoEngine = {
  dispatch: (cmd, payload) => {
    if (cmd === 'allocateFrameBuffer') {
      const { width, height } = payload || {};
      try {
        const newBuf = new Uint8ClampedArray(Math.max(0, width) * Math.max(0, height) * 4);
        settings._frameBuffer = newBuf;
        return { ok: true, result: { frameBufferMeta: { width, height, allocatedAt: Date.now() } } };
      } catch (e) { return { ok: false, error: e?.message }; }
    }
    if (cmd === 'setFrameBuffer') {
      const { bufMeta } = payload || {};
      settings.frameBuffer = bufMeta || null;
      return { ok: true };
    }
    return { ok: false, error: 'unknown-cmd' };
  }
};

export async function runDemo() {
  const w = canvas.width; const h = canvas.height;
  const res = demoEngine.dispatch('allocateFrameBuffer', { width: w, height: h });
  buf = settings._frameBuffer;
  demoEngine.dispatch('setFrameBuffer', { bufMeta: { width: w, height: h, len: buf?.length || 0 } });
  setExternalFrameBuffer(buf);
  log('Buffer allocated', { len: buf.length });
  // quick cleanup
  shutdownFrameWorker();
}

// Allow CLI execution
if (require.main === module) runDemo().catch(e => console.error(e));
