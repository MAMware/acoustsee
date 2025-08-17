/* PLUGIN-META
{
  "id": "strings",
  "name": "strings",
  "author": "GPT-5 mini (preview)",
  "description": "A lightweight Karplus–Strong plucked-string (guitar-like) synth plugin. No external assets required.",
  "version": "0.1.0"
}
*/

// Karplus–Strong plucked-string plugin (starter)
// - Exports: playKarplusStrongGuitar(notes, ctx = {})
// - Notes array: items may contain { frequency, midi, duration, amplitude, decay, position }
//   where `position` is { x, y, z } and `position.x` is used for stereo panning.
// - Uses ctx.audioContext (required). Does NOT create or close AudioContext.
// - Lightweight: creates short noise excitation and a feedback delay with damping filter.

export function playStrings(notes = [], ctx = {}) {
  const ac = ctx.audioContext;
  if (!ac) {
    console.warn('strings: audioContext not available; skipping');
    return;
  }

  const now = ac.currentTime;
  const maxVoices = typeof ctx.maxVoices === 'number' ? ctx.maxVoices : 16;
  let activeVoices = 0;

  function midiToFreq(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
  }

  notes.forEach((note, idx) => {
    if (activeVoices >= maxVoices) return; // simple voice cap
    const frequency = typeof note.frequency === 'number'
      ? note.frequency
      : (typeof note.midi === 'number' ? midiToFreq(note.midi) : 440 + (idx * 20));

    const duration = Math.max(0.05, (typeof note.duration === 'number' ? note.duration : 1.0));
  const amp = Math.min(1, Math.max(0, (typeof note.amplitude === 'number' ? note.amplitude : 0.25)));
  const decay = typeof note.decay === 'number' ? note.decay : 0.98; // feedback gain multiplier
  const panVal = note.position ? note.position.x : (typeof note.pan === 'number' ? note.pan : 0);

    // Karplus-Strong uses a delay time equal to the fundamental period
    const delayTime = Math.max(0.002, 1 / frequency);

    // Create short noise buffer for excitation
    const noiseLen = Math.floor(ac.sampleRate * 0.03); // 30ms noise
    const noiseBuf = ac.createBuffer(1, noiseLen, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = (Math.random() * 2 - 1) * 0.8;

    // Nodes
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = false;

    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    // Damping frequency roughly proportional to fundamental
    filter.frequency.value = Math.min(12000, 800 + frequency * 6);

    const delay = ac.createDelay(1.0);
    delay.delayTime.value = delayTime;

    const feedback = ac.createGain();
    // decay near 0.98-0.995 is long; lower values shorten sustain
    feedback.gain.value = Math.max(0, Math.min(0.999, decay));

    const outGain = ac.createGain();
    outGain.gain.value = amp;

    // Optional stereo panner if available (guarded)
    let panner = null;
    if (typeof ac.createStereoPanner === 'function') {
      panner = ac.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, panVal));
    }

    // Connect the KS loop: src -> filter -> delay -> out
    // and loop back: delay -> feedback -> filter
    src.connect(filter);
    filter.connect(delay);
    delay.connect(feedback);
    feedback.connect(filter);

    // Also route delay output to output gain -> panner? -> destination
    delay.connect(outGain);
    if (panner) outGain.connect(panner), panner.connect(ac.destination);
    else outGain.connect(ac.destination);

    const startTime = now + (note.when || 0);
    src.start(startTime);
    // Stop the source shortly after attack; the feedback loop sustains the tone
    src.stop(startTime + 0.03 + 0.01);

    // Envelope the output gain to shape amplitude over duration
    try { outGain.gain.setValueAtTime(amp, startTime); } catch (e) {}
    // exponential ramp to near-zero for natural decay
    try { outGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration); } catch (e) { outGain.gain.linearRampToValueAtTime(0, startTime + duration); }

    // Cleanup nodes after they finish
    const cleanupMs = (duration + 1.0) * 1000;
    activeVoices++;
    setTimeout(() => {
      try { src.disconnect(); } catch (e) {}
      try { filter.disconnect(); } catch (e) {}
      try { delay.disconnect(); } catch (e) {}
      try { feedback.disconnect(); } catch (e) {}
      try { outGain.disconnect(); } catch (e) {}
      try { panner && panner.disconnect(); } catch (e) {}
      activeVoices = Math.max(0, activeVoices - 1);
    }, cleanupMs);
  });
}
