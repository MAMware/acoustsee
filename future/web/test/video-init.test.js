import path from 'path';
import { pathToFileURL } from 'url';

global.window = { location: { hostname: 'localhost' } };
global.navigator = { userAgent: 'Jest Test' };

// Skipping video initializer test under Jest: the module uses import.meta and
// worker-relative URLs which Jest's CJS transform doesn't parse in this
// configuration. Port to a bundler or run under a custom ESM-enabled runner.
test('initializeVideo returns api and processFrameWithState is callable', async () => {
  // Provide a fake Worker constructor that mimics postMessage/onmessage
  class FakeWorker {
    constructor(path, opts) {
      this._path = path;
      this._onmessage = null;
      this._onerror = null;
      // simulate ready message asynchronously
      setTimeout(() => {
        if (this.onmessage) this.onmessage({ data: { type: 'result', result: { movingRegions: [] } } });
      }, 0);
    }
    postMessage(msg, transfer) {
      // immediately echo a minimal response for process path
      setTimeout(() => {
        if (this.onmessage) this.onmessage({ data: { type: 'result', result: { movingRegions: [] } } });
      }, 0);
    }
    terminate() {}
    set onmessage(cb) { this._onmessage = cb; }
    get onmessage() { return this._onmessage; }
    set onerror(cb) { this._onerror = cb; }
    get onerror() { return this._onerror; }
  }

  const mod = await import('../video/frame-processor.js');
  // initialize with fake Worker and base URL
  mod.initializeVideo({ WorkerCtor: FakeWorker, workerBaseUrl: 'http://localhost/' });

  const res = await mod.processFrameWithState(new Uint8ClampedArray([0,0,0,0]), 1, 1);
  expect(res).toBeDefined();
});
