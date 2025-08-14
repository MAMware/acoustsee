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
export async function cleanupResources({ settings, audioContext, cleanupAudio, audioManager, DOM }) {
  // Prefer the shared audioManager when provided
  const manager = audioManager || (DOM && DOM.audioManager) || null;

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
  if (manager) {
    // Let the AudioManager perform its own teardown
    try {
      if (typeof manager.close === 'function') await manager.close();
    } catch (e) {
      console.warn('cleanupResources: audioManager.close failed', e);
    }
  } else if (audioContext) {
    // Prefer the provided cleanupAudio helper which will handle stopping nodes and
    // closing the context when appropriate. Only attempt to close the context
    // directly if cleanupAudio is not provided.
    if (cleanupAudio) {
      try {
        await cleanupAudio();
      } catch (e) {
        console.warn('cleanupResources: cleanupAudio failed', e);
      }
    } else {
      try { await audioContext.close(); } catch (e) { console.warn('cleanupResources: audioContext.close failed', e); }
    }
  }
  console.log("cleanupManager: Cleanup completed");
}