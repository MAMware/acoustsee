import { settings, allocateFrameBuffer, setFrameBuffer } from '../core/state.js';
import { setExternalFrameBuffer, enableFrameWorker, enableWorkerTransfer, shutdownFrameWorker } from '../video/frame-processor.js';

const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const startCam = document.getElementById('startCam');
const stopCam = document.getElementById('stopCam');
const allocBuf = document.getElementById('allocBuf');
const toggleWorker = document.getElementById('toggleWorker');
const toggleTransfer = document.getElementById('toggleTransfer');
const startProc = document.getElementById('startProc');
const stopProc = document.getElementById('stopProc');
const logEl = document.getElementById('log');

let stream = null;
let procTimer = null;
let processing = false;
let buf = null;

function log(...args) { logEl.textContent = `${new Date().toISOString()} - ${args.map(a=>typeof a==='object'?JSON.stringify(a):String(a)).join(' ')}\n` + logEl.textContent; }

startCam.addEventListener('click', async () => {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    video.srcObject = stream;
    startCam.disabled = true; stopCam.disabled = false;
    log('Camera started');
  } catch (e) { log('Camera start error', e.message); }
});

stopCam.addEventListener('click', () => {
  if (stream) {
    for (const t of stream.getTracks()) t.stop();
    video.srcObject = null;
    stream = null;
    startCam.disabled = false; stopCam.disabled = true;
    log('Camera stopped');
  }
});

allocBuf.addEventListener('click', () => {
  const w = canvas.width; const h = canvas.height;
  buf = allocateFrameBuffer(w, h);
  setFrameBuffer(buf);
  setExternalFrameBuffer(buf);
  log('Buffer allocated', { len: buf.length });
});

toggleWorker.addEventListener('click', () => {
  settings.enableFrameWorker = !settings.enableFrameWorker;
  enableFrameWorker(settings.enableFrameWorker);
  log('enableFrameWorker', settings.enableFrameWorker);
});

toggleTransfer.addEventListener('click', () => {
  settings.workerTransferEnabled = !settings.workerTransferEnabled;
  enableWorkerTransfer(settings.workerTransferEnabled);
  log('workerTransferEnabled', settings.workerTransferEnabled);
});

startProc.addEventListener('click', () => {
  if (processing) return;
  processing = true; startProc.disabled = true; stopProc.disabled = false;
  procTimer = setInterval(async () => {
    if (!video || !canvas) return;
    try {
      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const img = ctx.getImageData(0,0,canvas.width,canvas.height);
      if (buf && buf.length === img.data.length) {
        buf.set(img.data);
      }
      // call the frame processor quietly by dispatching into engine in real app
      log('frame captured', { worker: settings.enableFrameWorker, transfer: settings.workerTransferEnabled });
    } catch (e) {
      log('process error', e.message);
    }
  }, 200);
});

stopProc.addEventListener('click', () => {
  if (!processing) return;
  clearInterval(procTimer);
  processing = false; startProc.disabled = false; stopProc.disabled = true;
  shutdownFrameWorker();
  log('processing stopped');
});

window.addEventListener('beforeunload', () => shutdownFrameWorker());

log('Demo ready');
