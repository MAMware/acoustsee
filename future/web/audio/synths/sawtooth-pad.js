/* PLUGIN-META
{
  "id": "sawtooth-pad",
  "name": "Sawtooth Pad",
  "author": "Gemini 2.5 Pro",
  "description": "A classic polyphonic pad synth using filtered sawtooth waves.",
  "version": "1.0.0"
}
*/

import {
  SAWTOOTH_ATTACK_TIME,
  SAWTOOTH_RELEASE_TIME,
  SAWTOOTH_FILTER_CUTOFF,
  SAWTOOTH_AMPLITUDE_SCALE,
  SAWTOOTH_DEFAULT_DURATION,
  SAWTOOTH_SMOOTHING_TIME
} from '../AUDIO_CONSTANTS.js';

// A simple polyphonic sawtooth synthesizer plugin.
export const synthMeta = {
  id: 'sawtooth-pad',
  name: 'Sawtooth Pad',
  author: 'Gemini 2.5 Pro',
  description: 'A classic polyphonic pad synth using filtered sawtooth waves.',
  version: '1.0.0',
  maxNotes: 16
};

export function playSawtoothPad(notes = [], ctx = {}) {
  const { audioContext, getOscillator, releaseOscillator, masterGain, oscillatorPool } = ctx;

  if (!audioContext || !getOscillator) {
    console.warn('sawtooth-pad: required audio context not provided.');
    return;
  }

  const now = audioContext.currentTime;
  const attackTime = SAWTOOTH_ATTACK_TIME;
  const releaseTime = SAWTOOTH_RELEASE_TIME;

  // CRITICAL FIX: Stop all voices when notes array is empty (camera stopped)
  if (!notes || notes.length === 0) {
    stopAllSawtoothVoices(oscillatorPool, releaseOscillator, audioContext, now, releaseTime);
    return;
  }

  // First, gracefully release any notes that are currently playing from this synth.
  

  // Then, play the new notes.
  notes.forEach(note => {
    const oscObj = getOscillator();
    if (!oscObj) return; // Pool is full

    const { osc, gain, panner } = oscObj;

    // Tag the oscillator so we know which synth it belongs to
    oscObj.synthId = 'sawtooth-pad';

    // --- Synth-specific settings ---
    osc.type = 'sawtooth';
    // Let's also add a low-pass filter to make it less harsh
    let filter;
    if (!oscObj.filter) {
        oscObj.filter = audioContext.createBiquadFilter();
        oscObj.filter.type = 'lowpass';
        // Connect osc -> filter -> gain -> panner -> masterGain
        osc.connect(oscObj.filter);
        oscObj.filter.connect(gain);
        gain.connect(panner);
        panner.connect(masterGain);
    }
    filter = oscObj.filter;
    filter.frequency.setValueAtTime(SAWTOOTH_FILTER_CUTOFF, now);
    
    // Start the oscillator
    try {
      osc.start(now);
    } catch (e) {
      // ignore if already started
    }
    
    // --- Standard note parameters ---
  const freq = note.pitch;
  const amp = note.intensity * SAWTOOTH_AMPLITUDE_SCALE;
  // Spatialization: prefer note.position.x (normalized -1..1) for azimuth/panning.
  const azimuth = note.position ? note.position.x : (note.pan || 0);

    osc.frequency.setTargetAtTime(freq, now, SAWTOOTH_SMOOTHING_TIME);
  panner.pan.setTargetAtTime(azimuth, now, SAWTOOTH_SMOOTHING_TIME);

    // --- Envelope (Attack -> Sustain -> Release) ---
    gain.gain.cancelScheduledValues(now);
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(amp, now + attackTime);
    // This is a simplification; a real pad would have a decay/sustain phase
    // Schedule stop and cleanup for this voice
    try {
  const stopTime = now + (note.duration || SAWTOOTH_DEFAULT_DURATION) + releaseTime;
      try { osc.stop(stopTime); } catch (e) { /* ignore */ }
      osc.onended = () => {
        try { structuredLog('DEBUG', `OSC_LIFECYCLE: ONENDED`, { id: oscObj.id, synth: 'sawtooth-pad' }); } catch (_) {}
        // try { if (releaseOscillator) releaseOscillator(oscObj); } catch (e) {} // TEMPORARILY DISABLED FOR DEBUGGING
      };
    } catch (e) {}
  });
}

// Helper function to stop all sawtooth-pad voices immediately
function stopAllSawtoothVoices(oscillatorPool, releaseOscillator, audioContext, now, releaseTime) {
  if (!oscillatorPool || !Array.isArray(oscillatorPool)) return;
  
  let stoppedCount = 0;
  
  oscillatorPool.forEach(oscObj => {
    if (oscObj.state === 'active' && oscObj.synthId === 'sawtooth-pad') {
      try {
        // Quick fade out
        oscObj.gain.gain.cancelScheduledValues(now);
        oscObj.gain.gain.setValueAtTime(oscObj.gain.gain.value || 0, now);
        oscObj.gain.gain.linearRampToValueAtTime(0, now + 0.05); // 50ms fade
        
        // Stop oscillator and release back to pool (schedule immediate stop after fade)
        try {
          if (oscObj.osc) {
            try { oscObj.osc.stop(now + 0.06); } catch (e) { /* ignore */ }
            oscObj.osc.onended = () => {
              // try { if (releaseOscillator) releaseOscillator(oscObj); } catch (e) {} // TEMPORARILY DISABLED FOR DEBUGGING
            };
          } else {
            if (releaseOscillator) releaseOscillator(oscObj);
          }
        } catch (e) {
          try { if (releaseOscillator) releaseOscillator(oscObj); } catch (ee) {}
        }
        
        stoppedCount++;
      } catch (e) {
        console.warn('Error stopping sawtooth voice:', e);
      }
    }
  });
  
  if (stoppedCount > 0) {
    console.log(`Stopped ${stoppedCount} sawtooth-pad voices`);
  }
}