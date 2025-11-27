// Test for initializeAudio config behavior
import path from 'path';
import { fileURLToPath } from 'url';

// Minimal globals to satisfy imports
class FakeAudioContext {
  constructor() { this.state = 'suspended'; this.sampleRate = 44100; }
  async resume() { this.state = 'running'; }
  createGain() { return { gain: { value: 1 }, connect: () => {} }; }
  createOscillator() {
    return {
      type: 'sine',
      frequency: { value: 440 },
      start: () => {},
      stop: () => {},
      connect: () => {},
      disconnect: () => {}
    };
  }
}

global.window = { AudioContext: FakeAudioContext, webkitAudioContext: FakeAudioContext, location: { hostname: 'localhost' } };
global.navigator = { userAgent: 'Node.js Test' };
global.document = { visibilityState: 'visible', addEventListener: () => {}, removeEventListener: () => {} };

async function run() {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  const apPath = path.join(__dirname, '../../audio/audio-processor.js');
  const amPath = path.join(__dirname, '../../audio/audio-manager.js');
  const audioProc = await import(`file://${apPath}`);
  const AudioManagerMod = await import(`file://${amPath}`);
  const { AudioManager } = AudioManagerMod;

  // 1) Missing config should throw
  try {
    await audioProc.initializeAudio();
    console.error('TEST FAIL: initializeAudio did not throw without config');
    process.exit(2);
  } catch (e) {
    console.log('TEST PASS: initializeAudio threw when missing config');
  }

  // 2) Provide audioManager in config
  const am = new AudioManager();
  await am.unlockAudio();
  await am.initialize();
  try {
    await audioProc.initializeAudio({ audioManager: am, maxNotes: 4 });
    console.log('TEST PASS: initializeAudio succeeded with audioManager in config');
  } catch (e) {
    console.error('TEST FAIL: initializeAudio threw with valid config', e);
    process.exit(3);
  }
  process.exit(0);
}

run().catch(e => { console.error('TEST ERROR', e); process.exit(1); });
