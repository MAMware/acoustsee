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
