/* PLUGIN-META
{
  "id": "strings",
  "name": "strings",
  "author": "GPT-5 mini (preview)",
  "description": "A lightweight Karplus–Strong plucked-string (guitar-like) synth plugin. No external assets required.",
  "version": "0.1.0"
}
*/

import {
  STRINGS_AMPLITUDE_CAP,
  STRINGS_AMPLITUDE_DEFAULT,
  STRINGS_EXCITATION_AMPLITUDE,
  STRINGS_DECAY_FEEDBACK_MIN,
  STRINGS_DECAY_FEEDBACK_MAX,
  STRINGS_NOISE_DURATION,
  STRINGS_MIN_DELAY_TIME,
  STRINGS_FILTER_FREQ_BASE,
  STRINGS_FILTER_FREQ_MULTIPLIER,
  STRINGS_FILTER_FREQ_MAX,
  STRINGS_ENVELOPE_RELEASE_VALUE,
  STRINGS_EXTRA_SUSTAIN_TIME,
  MIDI_A4_NOTE,
  MIDI_A4_FREQUENCY,
  EXPONENTIAL_RAMP_MIN
} from '../AUDIO_CONSTANTS.js';

// Karplus–Strong plucked-string plugin (starter)
// - Exports: playKarplusStrongGuitar(notes, ctx = {})
// - Notes array: items may contain { frequency, midi, duration, amplitude, decay, position }
//   where `position` is { x, y, z } and `position.x` is used for stereo panning.
// - Uses ctx.audioContext (required). Does NOT create or close AudioContext.
// - Lightweight: creates short noise excitation and a feedback delay with damping filter.

export function playStrings(notes = [], ctx = {}) {
  // Explicitly extract dependencies from ctx per synth contract
  const { audioContext: ac, masterGain } = ctx || {};
  if (!ac) {
    console.warn('strings: audioContext not available; skipping');
    return;
  }
  if (!masterGain) {
    console.warn('strings: masterGain not available; skipping');
    return;
  }

  const now = ac.currentTime;
  const maxVoices = typeof ctx.maxVoices === 'number' ? ctx.maxVoices : 16;
  let activeVoices = 0;

  function midiToFreq(m) {
    return MIDI_A4_FREQUENCY * Math.pow(2, (m - MIDI_A4_NOTE) / 12);
  }

  notes.forEach((note, idx) => {
    if (activeVoices >= maxVoices) return; // simple voice cap
    const frequency = typeof note.frequency === 'number'
      ? note.frequency
      : (typeof note.midi === 'number' ? midiToFreq(note.midi) : 440 + (idx * 20));

    const duration = Math.max(0.05, (typeof note.duration === 'number' ? note.duration : 1.0));
  const amp = Math.min(STRINGS_AMPLITUDE_CAP, Math.max(0, (typeof note.intensity === 'number' ? note.intensity * STRINGS_AMPLITUDE_CAP : STRINGS_AMPLITUDE_DEFAULT)));
  const decay = typeof note.decay === 'number' ? note.decay : STRINGS_DECAY_FEEDBACK_MAX; // Lower feedback to prevent runaway resonance
  const panVal = note.position ? note.position.x : (typeof note.pan === 'number' ? note.pan : 0);

    // Karplus-Strong uses a delay time equal to the fundamental period
    const delayTime = Math.max(STRINGS_MIN_DELAY_TIME, 1 / frequency);

    // Create short noise buffer for excitation
    const noiseLen = Math.floor(ac.sampleRate * STRINGS_NOISE_DURATION);
    const noiseBuf = ac.createBuffer(1, noiseLen, ac.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < noiseLen; i++) data[i] = (Math.random() * 2 - 1) * STRINGS_EXCITATION_AMPLITUDE;

    // Nodes
    const src = ac.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = false;

    const filter = ac.createBiquadFilter();
    filter.type = 'lowpass';
    // Damping frequency roughly proportional to fundamental
    filter.frequency.value = Math.min(STRINGS_FILTER_FREQ_MAX, STRINGS_FILTER_FREQ_BASE + frequency * STRINGS_FILTER_FREQ_MULTIPLIER);

    const delay = ac.createDelay(1.0);
    delay.delayTime.value = delayTime;

    const feedback = ac.createGain();
    // decay near 0.98-0.995 is long; lower values shorten sustain
    // Enforce safe feedback range 0.85 - 0.95 (see audio README rules)
    const safeDecay = Math.max(STRINGS_DECAY_FEEDBACK_MIN, Math.min(note.decay || decay || STRINGS_DECAY_FEEDBACK_MAX, STRINGS_DECAY_FEEDBACK_MAX));
    feedback.gain.value = safeDecay;

  const outGain = ac.createGain();
  // Enforce a hard cap on amplitude to avoid clipping and runaway levels
  const finalAmp = Math.min(STRINGS_AMPLITUDE_CAP, amp);
  outGain.gain.value = finalAmp;

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

    // Also route delay output to output gain -> panner? -> masterGain
    delay.connect(outGain);
    if (panner) outGain.connect(panner), panner.connect(masterGain);
    else outGain.connect(masterGain);

    const startTime = now + (note.when || 0);
    src.start(startTime);
    // Stop the source shortly after attack; the feedback loop sustains the tone
    src.stop(startTime + STRINGS_NOISE_DURATION + 0.01);

  // Envelope the output gain to shape amplitude over duration
  // Use the capped finalAmp to ensure safety
  try { outGain.gain.setValueAtTime(finalAmp, startTime); } catch (e) {}
    // exponential ramp to near-zero for natural decay
    try { outGain.gain.exponentialRampToValueAtTime(EXPONENTIAL_RAMP_MIN, startTime + duration); } catch (e) { outGain.gain.linearRampToValueAtTime(0, startTime + duration); }

    // Cleanup nodes after they finish
    const cleanupMs = (duration + STRINGS_EXTRA_SUSTAIN_TIME) * 1000;
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

export const synthMeta = {
  id: 'strings',
  name: 'Strings',
  author: 'GPT-5 mini (preview)',
  description: 'A lightweight Karplus–Strong plucked-string synth plugin.',
  version: '0.1.0',
  maxNotes: 8
};
