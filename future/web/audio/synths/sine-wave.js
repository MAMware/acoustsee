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
    const { audioContext, getOscillator, releaseOscillator, masterGain } = ctx || {};
    if (!audioContext || typeof getOscillator !== 'function') {
      console.warn('sine-wave: audioContext or getOscillator missing; skipping');
      return;
    }

    const now = audioContext.currentTime;
    notes.forEach(note => {
      const osc = getOscillator();
      if (!osc) return;

      const gainNode = audioContext.createGain();
      const panner = audioContext.createPanner();
      try { panner.panningModel = 'equalpower'; } catch (e) {}
      const posX = note.position && typeof note.position.x === 'number' ? note.position.x : 0;
      try { panner.setPosition(posX, 0, 1 - Math.abs(posX)); } catch (e) {}

      try { osc.type = 'sine'; } catch (e) {}
      try { osc.frequency.setValueAtTime(note.pitch || 440, now); } catch (e) {}

      gainNode.gain.setValueAtTime(0, now);
      gainNode.gain.linearRampToValueAtTime(note.intensity || 1.0, now + (note.attack || 0.01));
      gainNode.gain.linearRampToValueAtTime(0, now + (note.duration || 0.2));

      try { osc.connect(gainNode); gainNode.connect(panner); panner.connect(masterGain); } catch (e) {}

      try { osc.start(now); } catch (e) {}
      const stopTime = now + (note.duration || 0.2) + (note.release || 0.1);
      try { osc.stop(stopTime); } catch (e) {}

      setTimeout(() => {
        try { osc.disconnect(); } catch (e) {}
        try { gainNode.disconnect(); } catch (e) {}
        try { panner.disconnect(); } catch (e) {}
        try { releaseOscillator(osc); } catch (e) {}
      }, Math.max(0, (stopTime - now) * 1000) + 50);
    });
  }
