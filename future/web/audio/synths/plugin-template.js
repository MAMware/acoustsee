/* PLUGIN-META
{
  "id": "plugin-template",
  "name": "Plugin Template",
  "author": "Your Name",
  "description": "Minimal synth plugin template showing the required contract and defensive usage of ctx.",
  "version": "0.1.0"
}
*/

// Minimal synth plugin template for acoustsee
// - Must export `play(notes, ctx = {})`
// - Must NOT create or close an AudioContext
// - Use `ctx` to access audio resources provided by the app

export function playPluginTemplate(notes = [], ctx = {}) {
  const { audioContext, getOscillator, oscillatorPool } = ctx;

  if (!audioContext) {
    // Audio not initialized yet — be defensive and return early
    console.warn('plugin-template: audioContext not available; skipping play');
    return;
  }
  if (typeof getOscillator !== 'function') {
    console.warn('plugin-template: getOscillator helper not provided; skipping play');
    return;
  }

  // Very small example: for each note, obtain an oscillator from the shared pool,
  // set frequency and a simple gain envelope, then mark it inactive after duration.
  notes.forEach((note, i) => {
  try {
  const oscObj = getOscillator();
      if (!oscObj) return; // pool exhausted

      const { osc, gain, panner } = oscObj;
      const now = audioContext.currentTime;
      const freq = typeof note.frequency === 'number' ? note.frequency : (440 + (i * 20));
      const duration = typeof note.duration === 'number' ? note.duration : 0.2;
      const amp = typeof note.amplitude === 'number' ? note.amplitude : 0.25;

      // Configure nodes defensively
      try { osc.frequency.setValueAtTime(freq, now); } catch (e) {}
      try { gain.gain.cancelScheduledValues(now); gain.gain.setValueAtTime(0, now); } catch (e) {}
      try { gain.gain.linearRampToValueAtTime(amp, now + 0.01); } catch (e) {}
      try { gain.gain.linearRampToValueAtTime(0, now + duration); } catch (e) {}
      try { panner.pan.setValueAtTime(note.pan || 0, now); } catch (e) {}

      // Schedule a cleanup to mark oscillator available again after the note finishes
      setTimeout(() => {
        try { oscObj.active = false; } catch (e) {}
      }, (duration + 0.05) * 1000);

    } catch (err) {
      // Defensive: don't throw from plugin code
      console.warn('plugin-template: play() error', err && err.message);
    }
  });
}
