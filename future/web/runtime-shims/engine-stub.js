export const engine = {
  dispatch: (eventName, payload) => {
    console.log('[engine] dispatch', eventName, payload || {});
  },
  getState: () => ({ maxNotes: 16, motionThreshold: 20, enableFrameWorker: false, gridType: null, synthesisEngine: 'fm-synthesis' }),
  onStateChange: (cb) => {
    // No-op: shim does not simulate state changes by default
    return () => {};
  },
  registerCommand: (name, fn) => {
    // store or ignore; simple shim logs the registration
    console.log('[engine] registerCommand', name);
  }
};
