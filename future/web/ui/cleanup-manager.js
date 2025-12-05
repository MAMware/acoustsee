import { settings, setStream, setAudioInterval } from '../core/state.js';
import { cleanupAudio } from '../audio/audio-processor.js';

let isAudioInitialized = false;
let audioContext = null;

export function setupCleanupManager() {
  window.addEventListener("beforeunload", async () => {
    if (settings.stream) {
      settings.stream.getTracks().forEach((track) => track.stop());
      setStream(null);
    }
    if (settings.micStream) {
      settings.micStream.getTracks().forEach((track) => track.stop());
      settings.micStream = null;
    }
    if (settings.audioTimerId) {
      clearInterval(settings.audioTimerId);
      setAudioInterval(null);
    }
    if (isAudioInitialized && audioContext) {
      await cleanupAudio();
      await audioContext.close();
      isAudioInitialized = false;
      audioContext = null;
    }
    console.log("cleanupManager: Cleanup completed");
  });

  console.log("setupCleanupManager: Setup complete");
}

// Expose for audio-controls.js to update audioContext state
export function setAudioContextState(context, initialized) {
  audioContext = context;
  isAudioInitialized = initialized;
}