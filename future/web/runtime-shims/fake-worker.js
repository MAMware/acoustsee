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
