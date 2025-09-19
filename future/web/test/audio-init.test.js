import path from 'path';
import { pathToFileURL } from 'url';

// Provide minimal browser-like globals for modules that expect window/document
class FakeAudioContext {
  constructor() { this.state = 'suspended'; this.sampleRate = 44100; }
  async resume() { this.state = 'running'; }
  createGain() { return { gain: { value: 1 }, connect: () => {} }; }
  createOscillator() { return { type: 'sine', frequency: { value: 440 }, start: () => {}, stop: () => {}, connect: () => {}, disconnect: () => {} }; }
}

// Prefer assigning to the existing jsdom window if present to avoid clobbering
if (typeof window !== 'undefined') {
  window.AudioContext = FakeAudioContext;
  window.webkitAudioContext = FakeAudioContext;
  window.location = window.location || { hostname: 'localhost' };
  if (!window.navigator) window.navigator = {};
  try {
    Object.defineProperty(window.navigator, 'userAgent', { value: 'Jest Test', configurable: true });
  } catch (e) {
    // ignore if read-only
  }
} else {
  global.window = { AudioContext: FakeAudioContext, webkitAudioContext: FakeAudioContext, location: { hostname: 'localhost' } };
  global.navigator = { userAgent: 'Jest Test' };
}

test('initializeAudio throws without config and succeeds with AudioManager', async () => {
  // Import via relative specifiers so Jest module resolver can find the files
  const audioProc = await import('../audio/audio-processor.js');
  const AudioManagerMod = await import('../audio/audio-manager.js');
  const { AudioManager } = AudioManagerMod;

  await expect(audioProc.initializeAudio()).rejects.toThrow();

  const am = new AudioManager();
  await am.unlockAudio();
  await am.initialize();
  await expect(audioProc.initializeAudio({ audioManager: am, maxNotes: 4 })).resolves.not.toThrow();
});
