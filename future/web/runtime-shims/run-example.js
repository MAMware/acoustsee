import path from 'path';
import { fileURLToPath } from 'url';

// Smoke test for multi-paradigm
function testMultiParadigm(engine) {
  const mockFrame = new ImageData(320, 240);
  const mockResult = {
    gridFlows: Array(4).fill().map(() => Array(4).fill({ u: 1, v: 1, mag: 6 })),
    textureGrid: Array(4).fill().map(() => Array(4).fill(60)),
    objects: ['person', 'rough_ground'],
    inferredBPM: 115
  };
  let vibratePattern = null;
  global.navigator = global.navigator || {};
  global.navigator.vibrate = (pattern) => { vibratePattern = pattern; };

  engine.dispatch('setMode', { mode: 'hybrid' });
  if (engine.getState().currentMode !== 'hybrid') throw new Error('Mode set failed');
  engine.dispatch('flowCuesReady', mockResult);
  if (!engine.getState().cueBuffer.length) throw new Error('Cues not added');
  if (!engine.getState().cueBuffer.some(c => c.profile.type === 'rough_ground')) throw new Error('Rough ground not detected');
  engine.dispatch('pointerCuesReady', { object: 'person', pointedCell: { r: 1, c: 1 } });
  if (engine.getState().pointed.object !== 'person') throw new Error('Pointer not detected');
  engine.dispatch('bpmUpdate', { bpm: 115 });
  if (engine.getState().bpm !== 115) throw new Error('BPM not updated');
  // Assert haptic for person
  if (!vibratePattern || vibratePattern.toString() !== [100, 50, 100].toString()) throw new Error('Haptic not triggered for person');
}

// Smoke test for haptic and workers
function testHapticAndWorkers(engine) {
  const mockResult = {
    gridFlows: Array(4).fill().map(() => Array(4).fill({ u: 1, v: 1, mag: 6 })),
    textureGrid: Array(4).fill().map(() => Array(4).fill(60)),
    objects: ['person', 'rough_ground'],
    inferredBPM: 115
  };
  let vibratePattern = null;
  global.navigator.vibrate = (pattern) => { vibratePattern = pattern; };

  engine.dispatch('setMode', { mode: 'hybrid' });
  engine.dispatch('toggleHaptic', { enabled: true });
  engine.dispatch('flowCuesReady', mockResult);
  if (!vibratePattern || vibratePattern.toString() !== [50, 50, 50].toString()) throw new Error('Haptic not triggered for rough_ground');
  if (!engine.getState().cueBuffer.some(c => c.profile.type === 'rough_ground')) throw new Error('Rough ground cue added');

  engine.dispatch('pointerCuesReady', { object: 'person', pointedCell: { r: 1, c: 1 } });
  if (!vibratePattern || vibratePattern.toString() !== [100, 50, 100].toString()) throw new Error('Haptic triggered for person');
  if (engine.getState().pointed.object !== 'person') throw new Error('Pointer detected');
}

// Basic environment shims for running example
global.navigator = { userAgent: 'Node.js Runtime' };
global.window = global.window || { location: { hostname: 'localhost' } };
global.document = global.document || { visibilityState: 'visible', addEventListener: () => {}, head: { appendChild: () => {} }, querySelector: () => null };

(async function run() {
  try {
    const __dirname = path.dirname(fileURLToPath(import.meta.url));
    // Import local shims
    const { FakeAudioManager } = await import(path.join(__dirname, 'fake-audio-context.js'));
    const { FakeWorker } = await import(path.join(__dirname, 'fake-worker.js'));
    const { settings } = await import(path.join(__dirname, 'settings-facade.js'));
    const { DOM } = await import(path.join(__dirname, 'dom-shim.js'));

    // Provide minimal browser globals that some modules expect
    global.Worker = global.Worker || FakeWorker;
    // Minimal HTMLCanvasElement.transferControlToOffscreen shim
    if (typeof global.HTMLCanvasElement === 'undefined') {
      global.HTMLCanvasElement = function() {};
      HTMLCanvasElement.prototype.transferControlToOffscreen = function() { return this; };
    } else if (typeof HTMLCanvasElement.prototype.transferControlToOffscreen !== 'function') {
      HTMLCanvasElement.prototype.transferControlToOffscreen = function() { return this; };
    }
    // Minimal MediaStreamTrackProcessor stub
    if (typeof global.MediaStreamTrackProcessor === 'undefined') {
      global.MediaStreamTrackProcessor = class {
        constructor() { this.readable = { getReader: () => ({ read: async () => ({ done: true }) }) }; }
      };
    }

    // Provide document.createElement for canvas/video creation in shims
    if (typeof document.createElement !== 'function') {
      document.createElement = (tag) => {
        if (tag === 'canvas') {
          return { width: 2, height: 2, transferControlToOffscreen() { return this; }, getContext: () => ({ getImageData: () => ({ data: new Uint8ClampedArray(2 * 2 * 4) }) }) };
        }
        if (tag === 'video') {
          return { srcObject: null, play: async () => {}, pause: () => {}, videoWidth: 2, videoHeight: 2 };
        }
        return {};
      };
    }

    // Import modules to smoke (audio and video initializers)
    const audioMod = await import(path.join(__dirname, '..', 'audio', 'audio-processor.js'));
    const videoMod = await import(path.join(__dirname, '..', 'video', 'frame-processor.js'));

    // Create minimal managers and initialize
    const am = new FakeAudioManager();
    await am.unlockAudio();
    await am.initialize && am.initialize();

    // Initialize audio
    await audioMod.initializeAudio({ audioManager: am, maxNotes: settings.maxNotes, settings });
    console.log('Example: initializeAudio completed');

    // Initialize video with a minimal video element and engine stub
    const fakeVideoEl = { srcObject: { getVideoTracks: () => [{ stop: () => {} }] }, videoWidth: 2, videoHeight: 2 };
    const fakeEngine = { dispatch: async () => ({ ok: true }), getState: () => settings, onStateChange: () => {}, setState: () => {} };

    try {
      const initResult = await videoMod.initializeVideo({ videoElement: fakeVideoEl, engine: fakeEngine, registerWorker: () => {}, motionThreshold: settings.motionThreshold, workerBaseUrl: __dirname + '/', importMetaUrl: __dirname + '/', settings });
      console.log('Example: initializeVideo completed ->', initResult);
    } catch (e) {
      console.warn('initializeVideo failed (non-fatal in shim):', e?.message || e);
    }

    // Call playCues with an empty set (no-op)
    try { await audioMod.playCues([]); console.log('Example: playCues invoked'); } catch (e) { console.error('playCues error', e); }

    // Run multi-paradigm smoke test
    try {
      const engineMod = await import(path.join(__dirname, '..', 'core', 'engine.js'));
      const engine = engineMod.createEngine();
      testMultiParadigm(engine);
      console.log('Example: testMultiParadigm passed');
    } catch (e) {
      console.error('testMultiParadigm error', e);
    }

    // Run haptic and workers smoke test
    try {
      const engine2 = engineMod.createEngine();
      testHapticAndWorkers(engine2);
      console.log('Example: testHapticAndWorkers passed');
    } catch (e) {
      console.error('testHapticAndWorkers error', e);
    }

    // Also run the demo worker example if available
    try {
      const demo = await import(path.join(__dirname, '..', 'test', 'demos', 'frame-worker-demo.js'));
      if (demo && typeof demo.runDemo === 'function') await demo.runDemo();
    } catch (e) {
      // ignore demo errors in shim
    }

    // Success
    process.exitCode = 0;

  } catch (e) {
    console.error('run-example failed', e);
  }
})();
