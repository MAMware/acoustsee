/**
 * Minimal Engine Stub for Testing
 * 
 * Simulates the core engine's command bus and state management without
 * actually executing command handlers or triggering state changes.
 * 
 * LIMITATIONS:
 * - Does NOT execute registered command handlers
 * - Does NOT trigger onStateChange listeners
 * - Does NOT maintain real application state (returns static object)
 * - Does NOT validate command names or payloads
 * 
 * USE FOR:
 * - Verifying that modules dispatch correct commands
 * - Testing module initialization that requires engine reference
 * - Smoke testing command registration
 * 
 * For real command execution, use full integration tests.
 */

export const engine = {
  dispatch: (eventName, payload) => {
    console.log('[engine] dispatch', eventName, payload || {});
  },
  getState: () => ({ 
    maxNotes: 16, 
    motionThreshold: 20, 
    enableFrameWorker: false, 
    gridType: null, 
    synthesisEngine: 'fm-synthesis' 
  }),
  onStateChange: (cb) => {
    // No-op: shim does not simulate state changes by default
    return () => {};
  },
  registerCommand: (name, fn) => {
    // store or ignore; simple shim logs the registration
    console.log('[engine] registerCommand', name);
  }
};
