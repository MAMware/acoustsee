  /* PLUGIN-META
  {
    "id": "sine-wave",
    "displayName": "Sine Wave",
    "description": "Simple sine-wave engine using the shared oscillator pool",
    "maxNotes": 16,
    "version": "0.1.0"
  }
  */

  export const synthMeta = {
    id: 'sine-wave',
    name: 'Sine Wave',
    author: 'acoustsee',
    description: 'Simple sine-wave engine using the shared oscillator pool',
    version: '0.1.0',
    maxNotes: 16
  };

  export function playSineWave(notes, ctx) {
    // Extract ALL dependencies used by the synth to avoid runtime ReferenceErrors
    const { audioContext, getOscillator, releaseOscillator, masterGain, oscillatorPool } = ctx || {};
    if (!audioContext || typeof getOscillator !== 'function' || !masterGain) {
      console.warn('sine-wave: audioContext or getOscillator missing; skipping');
      return;
    }

    const now = audioContext.currentTime;
    notes.forEach(note => {
      const oscData = getOscillator();
      if (!oscData) return; // pool exhausted

      const { osc, gain, panner } = oscData;

      // Configure oscillator
      try { osc.type = 'sine'; } catch (e) {}
      const freq = note.pitch || 440;
      try {
        if (typeof osc.frequency.setTargetAtTime === 'function') {
          osc.frequency.setTargetAtTime(freq, now, 0.01);
        } else {
          osc.frequency.value = freq;
        }
      } catch (e) {}

      // Envelope
      const attack = Math.max(0.001, note.attack || 0.01);
      const duration = Math.max(0.05, note.duration || 0.2);
      const release = Math.max(0.03, note.release || 0.1);
      const amp = Math.max(0, Math.min(1, note.intensity || 1.0));
      try {
        gain.gain.cancelScheduledValues(now);
        gain.gain.setValueAtTime(0, now);
        gain.gain.linearRampToValueAtTime(amp, now + attack);
        gain.gain.linearRampToValueAtTime(0.0001, now + duration);
      } catch (e) {}

      // Spatialization: use StereoPanner pan in range [-1, 1]
      const azimuth = note.position && typeof note.position.x === 'number' ? note.position.x : (typeof note.pan === 'number' ? note.pan : 0);
      try {
        if (typeof panner.pan.setTargetAtTime === 'function') {
          panner.pan.setTargetAtTime(Math.max(-1, Math.min(1, azimuth)), now, 0.01);
        } else {
          panner.pan.value = Math.max(-1, Math.min(1, azimuth));
        }
      } catch (e) {}

      // Connect graph to masterGain (never directly to destination)
      try {
        osc.connect(gain);
        gain.connect(panner);
        panner.connect(masterGain);
      } catch (e) {}

      // Start and schedule stop/cleanup. Use precise ended event for cleanup.
      try { 
        osc.start(now);
        const stopTime = now + duration + release;
        // Schedule stop so 'onended' fires for cleanup
        try { osc.stop(stopTime); } catch (e) { /* ignore */ }

        // Use the 'ended' event for precise cleanup instead of setTimeout.
        osc.onended = () => {
          try { structuredLog('DEBUG', `OSC_LIFECYCLE: ONENDED`, { id: oscData.id, synth: 'sine-wave' }); } catch (_) {}
          try { if (releaseOscillator) releaseOscillator(oscData); } catch (e) {}
        };
      } catch (e) { 
        // If start fails (e.g., already started), immediately release.
        try { if (releaseOscillator) releaseOscillator(oscData); } catch (ee) {}
      }
    });
  }
