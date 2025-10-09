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
    this._listeners = Object.create(null);
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
        const message = { data: { type: 'result', result: { movingRegions: [] } } };
        // Call onmessage (traditional handler)
        try { this.onmessage(message); } catch (e) { /* best-effort */ }
        // Also dispatch as an Event so code using addEventListener sees it
        try { this.dispatchEvent && this.dispatchEvent(new CustomEvent('message', { detail: message.data })); } catch (e) {}
        // For compatibility, also dispatch a 'result' custom event
        try { this.dispatchEvent && this.dispatchEvent({ type: 'result', detail: message.data }); } catch (e) {}
      }
    }, 0);
  }
  terminate() { /* no-op */ }

  addEventListener(name, cb) {
    if (!this._listeners[name]) this._listeners[name] = [];
    this._listeners[name].push(cb);
  }

  removeEventListener(name, cb) {
    if (!this._listeners[name]) return;
    const idx = this._listeners[name].indexOf(cb);
    if (idx > -1) this._listeners[name].splice(idx, 1);
  }

  dispatchEvent(ev) {
    const name = ev && ev.type ? ev.type : 'message';
    const list = this._listeners[name] || [];
    for (const cb of list.slice()) {
      try { cb(ev); } catch (e) {}
    }
  }
}
