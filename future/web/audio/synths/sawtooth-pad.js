/* PLUGIN-META
{
  "id": "sawtooth-pad",
  "name": "Sawtooth Pad",
  "author": "Gemini 2.5 Pro",
  "description": "A classic polyphonic pad synth using filtered sawtooth waves.",
  "version": "1.0.0"
}
*/

// A simple polyphonic sawtooth synthesizer plugin.
export function playSawtoothPad(notes = [], ctx = {}) {
  const { audioContext, getOscillator, oscillatorPool } = ctx;

  if (!audioContext || !getOscillator || !oscillatorPool) {
    console.warn('sawtooth-pad: required audio context not provided.');
    return;
  }

  const now = audioContext.currentTime;
  const attackTime = 0.1;  // Slow attack for a "pad" sound
  const releaseTime = 0.5; // A bit of a tail

  // First, gracefully release any notes that are currently playing from this synth.
  oscillatorPool.forEach(oscObj => {
    if (oscObj.active && oscObj.synthId === 'sawtooth-pad') {
      try {
        oscObj.gain.gain.cancelScheduledValues(now);
        oscObj.gain.gain.linearRampToValueAtTime(0, now + releaseTime);
        setTimeout(() => { oscObj.active = false; }, releaseTime * 1000);
      } catch (e) {}
    }
  });

  // Then, play the new notes.
  notes.forEach(note => {
    const oscObj = getOscillator();
    if (!oscObj) return; // Pool is full

    const { osc, gain, panner } = oscObj;

    // Tag the oscillator so we know which synth it belongs to
    oscObj.synthId = 'sawtooth-pad';
    oscObj.active = true;

    // --- Synth-specific settings ---
    osc.type = 'sawtooth';
    // Let's also add a low-pass filter to make it less harsh
    let filter;
    if (!oscObj.filter) {
        oscObj.filter = audioContext.createBiquadFilter();
        oscObj.filter.type = 'lowpass';
        // Connect osc -> filter -> gain
        osc.connect(oscObj.filter);
        oscObj.filter.connect(gain);
    }
    filter = oscObj.filter;
    filter.frequency.setValueAtTime(1200, now); // A good starting point for a pad
    
    // --- Standard note parameters ---
  const freq = note.pitch;
  const amp = note.intensity * 0.5; // Pads are usually a bit quieter
  // Spatialization: prefer note.position.x (normalized -1..1) for azimuth/panning.
  const azimuth = note.position ? note.position.x : (note.pan || 0);

    osc.frequency.setTargetAtTime(freq, now, 0.01);
  panner.pan.setTargetAtTime(azimuth, now, 0.01);

    // --- Envelope (Attack -> Sustain -> Release) ---
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(amp, now + attackTime);
    // This is a simplification; a real pad would have a decay/sustain phase
  });
}