// Test for initializeVideo config behavior
import path from 'path';
import { fileURLToPath } from 'url';

global.window = { location: { hostname: 'localhost' } };
global.navigator = { userAgent: 'Node.js Test' };

async function run() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const fpPath = path.join(__dirname, '../../video/frame-processor.js');
  const mod = await import(`file://${fpPath}`);

  // 1) initializeVideo should accept config and return API
  try {
    const api = mod.initializeVideo({ engineDispatch: () => {}, motionThreshold: 0.02 });
    if (!api || typeof api.processFrame !== 'function') {
      console.error('TEST FAIL: initializeVideo did not return expected api');
      process.exit(2);
    }
    console.log('TEST PASS: initializeVideo returned API with processFrame');
  } catch (e) {
    console.error('TEST FAIL: initializeVideo threw', e);
    process.exit(3);
  }

  // 2) processFrame should be callable (use a tiny fake frame)
  try {
    const res = await mod.processFrameWithState(new Uint8ClampedArray([0,0,0,0]), 1, 1);
    if (!res || typeof res === 'undefined') {
      console.error('TEST FAIL: processFrameWithState returned undefined');
      process.exit(4);
    }
    console.log('TEST PASS: processFrameWithState callable');
  } catch (e) {
    console.error('TEST FAIL: processFrameWithState threw', e);
    process.exit(5);
  }

  process.exit(0);
}

run().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
