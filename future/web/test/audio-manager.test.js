import path from 'path';
import { pathToFileURL } from 'url';

class FakeAudioContext {
  constructor() { this.state = 'suspended'; this.sampleRate = 44100; }
  async resume() { this.state = 'running'; }
  async suspend() { this.state = 'suspended'; }
  createBuffer(channels, length, sampleRate) { return { channels, length, sampleRate }; }
  createBufferSource() { return { buffer: null, connect() {}, start() {}, stop() {} }; }
  async close() { this.state = 'closed'; }
}

if (typeof window !== 'undefined') {
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;
  window.location = window.location || { hostname: 'localhost' };
  if (!window.navigator) window.navigator = {};
  try {
    Object.defineProperty(window.navigator, 'userAgent', { value: 'Jest Test', configurable: true });
  } catch (e) {}
} else {
  global.window = { AudioContext: FakeAudioContext, webkitAudioContext: FakeAudioContext, location: { hostname: 'localhost' } };
  global.navigator = { userAgent: 'Jest Test' };
}

test('AudioManager unlocks and has running context', async () => {
  const mod = await import('../audio/audio-manager.js');
  const { AudioManager } = mod;

  const am = new AudioManager();
  const unlocked = await am.unlockAudio();
  expect(unlocked).toBeTruthy();
  expect(am.context).toBeDefined();
  expect(am.context.state).toBe('running');
});
