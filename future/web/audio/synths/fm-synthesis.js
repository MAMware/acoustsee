export function playFmSynthesis(notes, ctx = {}) {
  // ctx may provide: audioContext, getOscillator, oscillatorPool, modulators, modulationIndex, settings
  const audioContext = ctx.audioContext || (typeof window !== 'undefined' && window.audioContext) || globalThis.audioContext;
  const getOscillator = ctx.getOscillator || (typeof window !== 'undefined' && window.getOscillator) || globalThis.getOscillator;
  const oscillatorPool = ctx.oscillatorPool || (typeof window !== 'undefined' && window.oscillatorPool) || globalThis.oscillatorPool || [];
  const modulators = ctx.modulators || (typeof window !== 'undefined' && window.modulators) || globalThis.modulators || [];
  const modulationIndex = typeof ctx.modulationIndex === 'number' ? ctx.modulationIndex : (ctx.settings?.modulationIndex || 50);

  if (!audioContext || typeof getOscillator !== 'function') {
    console.warn('playFmSynthesis: missing audioContext or getOscillator in context');
    return;
  }

  const now = audioContext.currentTime;
  const releaseTime = 0.05; // seconds for fade-out

  // Fade out / mark pool oscillators inactive to avoid clicks
  oscillatorPool.forEach(o => {
    if (o && o.gain && typeof o.gain.gain.cancelScheduledValues === 'function') {
      o.gain.gain.cancelScheduledValues(now);
      o.gain.gain.linearRampToValueAtTime(0, now + releaseTime);
    }
    if (o) o.active = false;
  });

  // Normalize notes: accept pitch / freq / frequency and intensity / amplitude
  const allNotes = (notes || []).slice().map(n => ({
    pitch: n.pitch ?? n.freq ?? n.frequency ?? 0,
    intensity: n.intensity ?? n.amplitude ?? n.amp ?? 0,
    harmonics: n.harmonics || n.overtones || [],
    pan: typeof n.pan === 'number' ? n.pan : 0,
    modFreq: n.modFreq
  })).sort((a, b) => b.intensity - a.intensity);

  let modIndex = 0;

  for (let i = 0; i < allNotes.length; i++) {
    const { pitch, intensity, harmonics = [], pan = 0, modFreq } = allNotes[i];
    if (!pitch || intensity <= 0) continue;

    const oscData = getOscillator();
    if (!oscData) continue;

    // Carrier oscillator
    oscData.osc.type = 'sine';
    if (typeof oscData.osc.frequency.setTargetAtTime === 'function') {
      oscData.osc.frequency.setTargetAtTime(pitch, now, 0.015);
    } else if ('value' in oscData.osc.frequency) {
      oscData.osc.frequency.value = pitch;
    }
    if (oscData.gain && typeof oscData.gain.gain.setTargetAtTime === 'function') {
      oscData.gain.gain.setTargetAtTime(Math.min(1, intensity), now, 0.015);
    }
    if (oscData.panner && typeof oscData.panner.pan.setTargetAtTime === 'function') {
      oscData.panner.pan.setTargetAtTime(pan, now, 0.015);
    }
    oscData.active = true;

    // FM modulator (one per note) - reuse if possible
    let modData;
    if (modIndex < modulators.length) {
      modData = modulators[modIndex];
    } else {
      const mOsc = audioContext.createOscillator();
      const mGain = audioContext.createGain();
      // start with zero gain to avoid clicks
      mGain.gain.setValueAtTime(0, now);
      modulators.push({ osc: mOsc, gain: mGain, started: false, connected: false });
      modData = modulators[modulators.length - 1];
    }

    // configure modulator
    modData.osc.type = 'sine';
    const targetModFreq = modFreq || Math.max(0.5, pitch * 2);
    if (typeof modData.osc.frequency.setTargetAtTime === 'function') {
      modData.osc.frequency.setTargetAtTime(targetModFreq, now, 0.015);
    } else if ('value' in modData.osc.frequency) {
      modData.osc.frequency.value = targetModFreq;
    }

    // modulation depth scaled by intensity
    const depth = Math.max(0, Math.min(2000, modulationIndex * intensity));
    if (typeof modData.gain.gain.setTargetAtTime === 'function') {
      modData.gain.gain.setTargetAtTime(depth, now, 0.015);
    } else if ('value' in modData.gain.gain) {
      modData.gain.gain.value = depth;
    }

    // Connect modulator -> gain -> carrier.frequency (AudioParam)
    try {
      if (!modData.connected) {
        modData.osc.connect(modData.gain);
        modData.gain.connect(oscData.osc.frequency);
        modData.connected = true;
      }
    } catch (e) {
      // ignore connection failures
    }

    // start modulator once
    if (!modData.started) {
      try {
        modData.osc.start();
      } catch (e) {
        // ignore if already started
      }
      modData.started = true;
    }

    modIndex++;

    // harmonics: use additional oscillators from pool
    for (let h = 0; h < harmonics.length; h++) {
      const hFreq = harmonics[h];
      if (!hFreq) continue;
      const harmonicOsc = getOscillator();
      if (!harmonicOsc) continue;
      harmonicOsc.osc.type = 'sine';
      if (typeof harmonicOsc.osc.frequency.setTargetAtTime === 'function') {
        harmonicOsc.osc.frequency.setTargetAtTime(hFreq, now, 0.015);
      } else if ('value' in harmonicOsc.osc.frequency) {
        harmonicOsc.osc.frequency.value = hFreq;
      }
      if (harmonicOsc.gain && typeof harmonicOsc.gain.gain.setTargetAtTime === 'function') {
        harmonicOsc.gain.gain.setTargetAtTime(Math.min(1, intensity * 0.5), now, 0.015);
      }
      if (harmonicOsc.panner && typeof harmonicOsc.panner.pan.setTargetAtTime === 'function') {
        harmonicOsc.panner.pan.setTargetAtTime(pan, now, 0.015);
      }
      harmonicOsc.active = true;
    }
  }

  // Fade-out any unused modulators
  for (let i = modIndex; i < modulators.length; i++) {
    const m = modulators[i];
    if (m && m.gain && typeof m.gain.gain.cancelScheduledValues === 'function') {
      m.gain.gain.cancelScheduledValues(now);
      m.gain.gain.linearRampToValueAtTime(0, now + releaseTime);
    }
  }
}
