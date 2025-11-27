// Simple Node test for AudioManager using a mocked AudioContext
import path from 'path';
import { fileURLToPath } from 'url';

// Setup a minimal global.window.AudioContext mock before importing the module
class FakeAudioContext {
  constructor() {
    this.state = 'suspended';
    this.sampleRate = 44100;
  }
  async resume() { this.state = 'running'; return Promise.resolve(); }
  async suspend() { this.state = 'suspended'; return Promise.resolve(); }
  createBuffer(channels, length, sampleRate) { return { channels, length, sampleRate }; }
  createBufferSource() {
    return {
      buffer: null,
      connect() {},
      start() {},
      stop() {}
    };
  }
  async close() { this.state = 'closed'; }
}

global.window = { AudioContext: FakeAudioContext, webkitAudioContext: FakeAudioContext };
global.navigator = { userAgent: 'Node.js Test' };
global.document = {
  visibilityState: 'visible',
  addEventListener: () => {},
  removeEventListener: () => {}
};

async function run() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const amPath = path.join(__dirname, '../../audio/audio-manager.js');
  const mod = await import(`file://${amPath}`);
  const { AudioManager } = mod;

  const am = new AudioManager();
  const unlocked = await am.unlockAudio();
  if (!unlocked) {
    console.error('TEST FAIL: unlockAudio returned false');
    process.exit(2);
  }
  if (!am.context || am.context.state !== 'running') {
    console.error('TEST FAIL: context not running after unlock');
    process.exit(3);
  }

  console.log('TEST PASS: AudioManager unlocked and context running (mock)');
  process.exit(0);
}

run().catch((e) => { console.error('TEST ERROR', e); process.exit(1); });
