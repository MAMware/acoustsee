// Microphone controller: encapsulates microphone start/stop logic

export async function startMic(constraints = { audio: true }) {
  if (!navigator?.mediaDevices?.getUserMedia) throw new Error('getUserMedia not available');
  const stream = await navigator.mediaDevices.getUserMedia(constraints);
  return stream;
}

export function stopMic(stream) {
  try {
    if (!stream) return;
    const tracks = stream.getTracks ? stream.getTracks() : [];
    tracks.forEach(t => {
      try { t.stop(); } catch (e) {}
    });
  } catch (e) {
    // best-effort
  }
}

// Helper for setting mic stream into shared state without creating a circular
// dependency on core/state.js. Tests patch this function to assert behavior.
export function setMicStream(stream, setFn) {
  // If a setter function is provided, call it (used by tests to simulate state storage)
  if (typeof setFn === 'function') return setFn(stream);
  // Otherwise, return the stream so callers can assign it to shared state.
  return stream;
}
