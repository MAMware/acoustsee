/**
 * Fake Web Worker for Testing
 * 
 * Simulates Web Worker message passing without loading or executing real worker code.
 * 
 * LIMITATIONS:
 * - Does NOT load or execute real worker scripts
 * - Does NOT simulate worker threading or parallel execution
 * - Does NOT handle transferable objects (like ImageData)
 * - Does NOT simulate worker errors or crashes
 * 
 * BEHAVIOR:
 * - Sends synthetic { type: 'ready', features: [] } on construction
 * - Echoes back { type: 'result', result: { movingRegions: [] } } on postMessage
 * - All messages are async (via setTimeout(0))
 * 
 * USE FOR:
 * - Testing worker initialization logic
 * - Verifying message format contracts
 * - Smoke testing modules that create workers
 * 
 * For real worker behavior, use browser integration tests.
 */

export class FakeWorker {
  constructor(url, opts = {}) {
    this.url = url;
    this.onmessage = null;
    this.onerror = null;
    // Simulate async ready message
    setTimeout(() => {
      if (this.onmessage) this.onmessage({ data: { type: 'ready', features: [] } });
    }, 0);
  }
  postMessage(msg, transfer) {
    // Immediately echo a sensible default for test patterns
    setTimeout(() => {
      if (this.onmessage) {
        // For frame-worker tests we expect a 'result' envelope sometimes
        this.onmessage({ data: { type: 'result', result: { movingRegions: [] } } });
      }
    }, 0);
  }
  terminate() { /* no-op */ }
}
