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
