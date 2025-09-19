import path from 'path';
import { fileURLToPath } from 'url';

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

    // Initialize video with FakeWorker
    const videoApi = videoMod.initializeVideo({ WorkerCtor: FakeWorker, workerBaseUrl: __dirname + '/', importMetaUrl: __dirname + '/', motionThreshold: settings.motionThreshold, settings });
    console.log('Example: initializeVideo returned', Object.keys(videoApi));

    // Call a smoke processFrame
    const res = await videoMod.processFrameWithState(new Uint8ClampedArray([0,0,0,0]), 1, 1);
    console.log('Example: processFrameWithState ->', res);

    // Call playCues with an empty set (no-op)
    try { await audioMod.playCues([]); console.log('Example: playCues invoked'); } catch (e) { console.error('playCues error', e); }

  } catch (e) {
    console.error('run-example failed', e);
  }
})();
