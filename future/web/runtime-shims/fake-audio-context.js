/**
 * Fake Web Audio API for testing audio modules in Node.js
 * 
 * LIMITATIONS:
 * - Does NOT produce actual sound
 * - Does NOT validate audio graph connections (won't catch missing masterGain!)
 * - Does NOT simulate precise timing or sample-accurate scheduling
 * - Does NOT implement all AudioNode types (only basic ones)
 * 
 * USE FOR:
 * - Smoke testing synth initialization
 * - Verifying audio graph construction logic
 * - Testing oscillator/gain node creation patterns
 * 
 * ALWAYS follow up with real browser testing to catch connection errors.
 */

export class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.sampleRate = 44100;
    this.destination = {};
  }
  async resume() { this.state = 'running'; }
  createGain() { return { gain: { value: 1 }, connect: () => {} }; }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 440, setTargetAtTime: () => {} },
      start: () => {},
      stop: () => {},
      connect: () => {},
      disconnect: () => {}
    };
  }
}

export class FakeAudioManager {
  constructor() { this._ctx = new FakeAudioContext(); }
  get context() { return this._ctx; }
  async unlockAudio() { try { await this._ctx.resume(); return true; } catch(e){ return false; } }
  async initialize() { /* no-op */ }
}
