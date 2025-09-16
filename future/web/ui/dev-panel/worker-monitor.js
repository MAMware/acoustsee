// Lightweight worker registry and stats collector for the Dev Panel
export const workerRegistry = new Map(); // id -> { worker, name, last, _handler }

export function registerWorker(worker, name) {
  const id = name || `worker-${workerRegistry.size + 1}`;
  const entry = { worker, name: id, last: null, _handler: null };
  const handler = (ev) => {
    try {
      const d = ev?.data;
      if (d && d.type === 'workerStats') {
        entry.last = { ...d, receivedTs: Date.now() };
      }
    } catch (e) {}
  };
  try { worker.addEventListener('message', handler); } catch (e) {}
  entry._handler = handler;
  workerRegistry.set(id, entry);
  return id;
}

export function unregisterWorker(id) {
  const entry = workerRegistry.get(id);
  if (!entry) return;
  try { entry.worker.removeEventListener('message', entry._handler); } catch (e) {}
  workerRegistry.delete(id);
}

export function getWorkerStats() {
  const out = [];
  workerRegistry.forEach((v, k) => {
    out.push({ id: k, name: v.name, last: v.last });
  });
  return out;
}

// convenience globals for quick access from console/tests (dev-panel scoped)
if (typeof window !== 'undefined') {
  try {
    window.__acoustseeDevPanelRegisterWorker = registerWorker;
    window.__acoustseeDevPanelUnregisterWorker = unregisterWorker;
    window.__acoustseeDevPanelGetWorkerStats = getWorkerStats;
  } catch (e) {}
}
