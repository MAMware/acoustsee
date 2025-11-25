/**
 * Fake Web Audio API for testing audio modules in Node.js
 * 
 * LIMITATIONS:
 * - Does NOT produce actual sound
 * - Does NOT simulate precise timing or sample-accurate scheduling
 * - Does NOT implement all AudioNode types (only basic ones)
 * 
 * ENHANCEMENTS (v0.9.5+):
 * - VALIDATES audio graph connections (catches missing connect() calls)
 * - Tracks node connections to detect broken audio paths
 * - Logs warnings when nodes are not properly connected
 * 
 * USE FOR:
 * - Smoke testing synth initialization
 * - Verifying audio graph construction logic
 * - Testing oscillator/gain node creation patterns
 * - **CATCHES connection errors that would be silent in real browser**
 * 
 * ALWAYS follow up with real browser testing to validate timing and actual audio output.
 */

export class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.sampleRate = 44100;
    this.destination = { _incomingConnections: new Set(), _nodeType: 'AudioDestination' };
    this._nodeRegistry = new Map();  // Track all created nodes
  }

  async resume() { this.state = 'running'; }

  createGain() {
    const node = {
      gain: { value: 1, setValueAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      connect: (target) => this._registerConnection(node, target),
      disconnect: () => this._unregisterConnections(node),
      _outgoingConnections: new Set(),
      _nodeType: 'GainNode',
      _id: Math.random().toString(36).substring(7)
    };
    this._nodeRegistry.set(node._id, node);
    return node;
  }

  createOscillator() {
    const node = {
      type: 'sine',
      frequency: { value: 440, setValueAtTime: () => {}, setTargetAtTime: () => {}, exponentialRampToValueAtTime: () => {} },
      start: () => { node._started = true; },
      stop: () => { node._stopped = true; },
      connect: (target) => this._registerConnection(node, target),
      disconnect: () => this._unregisterConnections(node),
      _outgoingConnections: new Set(),
      _nodeType: 'OscillatorNode',
      _id: Math.random().toString(36).substring(7),
      _started: false,
      _stopped: false
    };
    this._nodeRegistry.set(node._id, node);
    return node;
  }

  /**
   * Register a connection between nodes for validation
   * Detects unconnected audio paths that would be silent in production
   */
  _registerConnection(source, target) {
    if (!source || !target) {
      console.warn('[FakeAudioContext] Attempted to connect null/undefined node');
      return;
    }
    if (!source._outgoingConnections) {
      source._outgoingConnections = new Set();
    }
    source._outgoingConnections.add(target);
    
    if (target._incomingConnections) {
      target._incomingConnections.add(source);
    }
  }

  /**
   * Unregister connections when disconnect() is called
   */
  _unregisterConnections(source) {
    if (source._outgoingConnections) {
      for (const target of source._outgoingConnections) {
        if (target._incomingConnections) {
          target._incomingConnections.delete(source);
        }
      }
      source._outgoingConnections.clear();
    }
  }

  /**
   * Validate audio graph state (call after setup to verify connections)
   * Returns array of validation errors (empty if valid)
   * 
   * @returns {Array<string>} Array of validation messages
   */
  validateAudioGraph() {
    const errors = [];
    
    // Check all nodes for connectivity
    for (const [nodeId, node] of this._nodeRegistry) {
      if (node._nodeType === 'OscillatorNode') {
        // Oscillators must be connected to something
        if (!node._outgoingConnections || node._outgoingConnections.size === 0) {
          errors.push(`Oscillator ${nodeId} has no outgoing connections (will be silent)`);
        }
        // Warn if started but not connected
        if (node._started && (!node._outgoingConnections || node._outgoingConnections.size === 0)) {
          errors.push(`Oscillator ${nodeId} was started but is not connected (error in production)`);
        }
      }
      
      if (node._nodeType === 'GainNode') {
        // Gain nodes should be connected to something (unless they're final destination)
        if (!node._outgoingConnections || node._outgoingConnections.size === 0) {
          if (node !== this.destination) {
            errors.push(`GainNode ${nodeId} has no outgoing connections (will be silent)`);
          }
        }
      }
    }
    
    // Check if destination has incoming connections
    if (!this.destination._incomingConnections || this.destination._incomingConnections.size === 0) {
      errors.push('AudioContext destination has no incoming connections (no audio will play)');
    }
    
    return errors;
  }
}

export class FakeAudioManager {
  constructor() { this._ctx = new FakeAudioContext(); }
  get context() { return this._ctx; }
  async unlockAudio() { try { await this._ctx.resume(); return true; } catch(e){ return false; } }
  async initialize() { /* no-op */ }
}
