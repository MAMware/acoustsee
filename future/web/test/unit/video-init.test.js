// NOTE: This test is temporarily skipped. It relies on ES Module features
// (import.meta.url) for loading workers, which can be flaky in a default
// Jest/CommonJS test environment. To re-enable, ensure the test runner is
// configured to properly handle ESM module workers or run this test in a
// dedicated ESM-based test harness.
import path from 'path';
import { pathToFileURL } from 'url';

global.window = { location: { hostname: 'localhost' } };
global.navigator = { userAgent: 'Jest Test' };

describe.skip('video initializer (skipped under default Jest)', () => {
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
  const mod = await import('../../video/frame-processor.js');
  // initialize with fake Worker and base URL
  mod.initializeVideo({ WorkerCtor: FakeWorker, workerBaseUrl: 'http://localhost/' });

  const res = await mod.processFrameWithState(new Uint8ClampedArray([0,0,0,0]), 1, 1);
  expect(res).toBeDefined();
  });
});
