// Centralizes teardown of event listeners and DOM cleanup
const listeners = [];

export function registerListener(target, type, handler) {
  target.addEventListener(type, handler);
  listeners.push({ target, type, handler });
}

export function cleanupAllListeners() {
  listeners.forEach(({ target, type, handler }) => {
    target.removeEventListener(type, handler);
  });
  listeners.length = 0;
}

// Resource cleanup for audio/video streams and intervals
export async function cleanupResources({ settings, audioContext, cleanupAudio }) {
  if (settings?.stream) {
    settings.stream.getTracks().forEach((track) => track.stop());
    if (settings.setStream) settings.setStream(null);
  }
  if (settings?.micStream) {
    settings.micStream.getTracks().forEach((track) => track.stop());
    settings.micStream = null;
  }
  if (settings?.audioTimerId) {
    clearInterval(settings.audioTimerId);
    if (settings.setAudioInterval) settings.setAudioInterval(null);
  }
  if (audioContext) {
    if (cleanupAudio) await cleanupAudio();
    await audioContext.close();
  }
  console.log("cleanupManager: Cleanup completed");
}