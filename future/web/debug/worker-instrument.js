// Worker-side instrumentation helper
export function installWorkerMonitor(name = null, { wrapOnMessage = false } = {}) {
  const WORKER_MONITOR_ID = name || (`w-${Math.random().toString(36).slice(2,8)}`);
  let busyMs = 0;
  let lastTick = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();

  function instrumentSync(fn) {
    return function (ev) {
      const t0 = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
      try { return fn.call(this, ev); } finally { busyMs += ((typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now()) - t0; }
    };
  }

  try {
    if (wrapOnMessage && typeof self.onmessage === 'function') {
      self.onmessage = instrumentSync(self.onmessage);
    }
  } catch (e) {}

  setInterval(() => {
    const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
    const interval = Math.max(1, now - lastTick);
    const utilPct = Math.round(Math.min(100, (busyMs / interval) * 100));
    const mem = (typeof performance !== 'undefined' && performance && performance.memory) ? {
      usedJSHeapSize: performance.memory.usedJSHeapSize,
      totalJSHeapSize: performance.memory.totalJSHeapSize,
      jsHeapSizeLimit: performance.memory.jsHeapSizeLimit
    } : null;
    try { self.postMessage({ type: 'workerStats', id: WORKER_MONITOR_ID, util: utilPct, busyMs, intervalMs: interval, ts: Date.now(), memory: mem }); } catch (e) {}
    busyMs = 0;
    lastTick = now;
  }, 1000);

  return { id: WORKER_MONITOR_ID, instrumentSync };
}
