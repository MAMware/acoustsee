import {
  FM_MODULATION_INDEX_DEFAULT,
  FM_RELEASE_TIME,
  FM_SMOOTHING_TIME,
  FM_DEFAULT_DURATION,
  FM_MAX_GAIN
} from '../AUDIO_CONSTANTS.js';

export const synthMeta = {
  id: 'fm-synthesis',
  name: 'FM Synthesis',
  author: 'acoustsee',
  description: 'Simple FM synthesis engine using modulators and shared oscillator pool.',
  version: '0.1.0',
  maxNotes: 24
};

// PERF OPTIMIZATION (Nov 28): Module-level modulator pool to prevent per-frame allocation
// Modulators are pre-allocated and recycled across notes
const MAX_MODULATORS = 32;  // Maximum concurrent FM modulators (matches maxNotes buffer)
let _modulatorPool = null;  // Lazy-initialized on first use with audioContext
let _modulatorPoolContext = null;  // Track which context the pool was created for

/**
 * Get or create the modulator pool for the given audio context
 * Pre-allocates all modulators to avoid creation during playback
 */
function getModulatorPool(audioContext) {
  // If context changed (page reload, new context), recreate pool
  if (_modulatorPoolContext !== audioContext) {
    _modulatorPool = null;
    _modulatorPoolContext = audioContext;
  }
  
  if (!_modulatorPool) {
    _modulatorPool = [];
    for (let i = 0; i < MAX_MODULATORS; i++) {
      const mOsc = audioContext.createOscillator();
      const mGain = audioContext.createGain();
      mOsc.type = 'sine';
      mGain.gain.setValueAtTime(0, audioContext.currentTime);
      // Start oscillator immediately (they stay running, gain controls output)
      mOsc.connect(mGain);
      mOsc.start();
      _modulatorPool.push({ 
        osc: mOsc, 
        gain: mGain, 
        inUse: false,
        connectedTo: null  // Track what carrier we're connected to
      });
    }
  }
  return _modulatorPool;
}

/**
 * Acquire a modulator from the pool
 * Returns null if pool is exhausted (graceful degradation)
 */
function acquireModulator(pool) {
  for (let i = 0; i < pool.length; i++) {
    if (!pool[i].inUse) {
      pool[i].inUse = true;
      return pool[i];
    }
  }
  return null;  // Pool exhausted - graceful degradation
}

/**
 * Release all modulators (called at end of playFmSynthesis)
 */
function releaseAllModulators(pool, audioContext) {
  const now = audioContext.currentTime;
  for (let i = 0; i < pool.length; i++) {
    const m = pool[i];
    if (m.inUse) {
      // Fade out smoothly to avoid clicks
      m.gain.gain.setTargetAtTime(0, now, FM_SMOOTHING_TIME);
      // Disconnect from carrier if connected
      if (m.connectedTo) {
        try { m.gain.disconnect(m.connectedTo); } catch (e) { /* ignore */ }
        m.connectedTo = null;
      }
      m.inUse = false;
    }
  }
}

export function playFmSynthesis(notes, ctx = {}) {
  // ctx may provide: audioContext, getOscillator, oscillatorPool, modulators, modulationIndex, settings
  // Require explicit injection of runtime helpers via ctx. Avoid reading from
  // global/window/globalThis so modules are testable and isolated.
  const audioContext = ctx.audioContext;
  const getOscillator = ctx.getOscillator;
  const masterGain = ctx.masterGain;
  const oscillatorPool = ctx.oscillatorPool || [];
  // PERF OPTIMIZATION: Use module-level modulator pool instead of ctx.modulators
  const modulatorPool = getModulatorPool(audioContext);
  const modulationIndex = typeof ctx.modulationIndex === 'number' ? ctx.modulationIndex : (ctx.settings?.modulationIndex ?? FM_MODULATION_INDEX_DEFAULT);

  if (!audioContext || typeof getOscillator !== 'function') {
    console.warn('playFmSynthesis: missing required ctx.audioContext or ctx.getOscillator — synth cannot run in isolation');
    return;
  }

  const now = audioContext.currentTime;
  const releaseTime = FM_RELEASE_TIME;

  // PERF OPTIMIZATION: Avoid slice().map().sort() chain - use index-based iteration
  // Normalize notes inline without creating intermediate arrays
  const noteCount = notes ? notes.length : 0;
  if (noteCount === 0) {
    releaseAllModulators(modulatorPool, audioContext);
    return;
  }

  for (let i = 0; i < noteCount; i++) {
    const n = notes[i];
    const pitch = n.pitch ?? n.freq ?? n.frequency ?? 0;
    const intensity = n.intensity ?? n.amplitude ?? n.amp ?? 0;
    const harmonics = n.harmonics || n.overtones || [];
    const azimuth = n.position ? n.position.x : (typeof n.pan === 'number' ? n.pan : 0);
    const modFreq = n.modFreq;
    const duration = typeof n.duration === 'number' ? n.duration : undefined;

    if (!pitch || intensity <= 0) continue;

    const oscData = getOscillator();
    if (!oscData) continue;

    // Carrier oscillator
    oscData.osc.type = 'sine';
    if (typeof oscData.osc.frequency.setTargetAtTime === 'function') {
      oscData.osc.frequency.setTargetAtTime(pitch, now, FM_SMOOTHING_TIME);
    } else if ('value' in oscData.osc.frequency) {
      oscData.osc.frequency.value = pitch;
    }
    if (oscData.gain && typeof oscData.gain.gain.setTargetAtTime === 'function') {
      oscData.gain.gain.setTargetAtTime(Math.min(FM_MAX_GAIN, intensity), now, FM_SMOOTHING_TIME);
    }
    if (oscData.panner && typeof oscData.panner.pan.setTargetAtTime === 'function') {
      oscData.panner.pan.setTargetAtTime(azimuth, now, FM_SMOOTHING_TIME);
    }
    oscData.active = true;

    // Connect the carrier oscillator path to output
    try {
      oscData.osc.connect(oscData.gain);
      oscData.gain.connect(oscData.panner);
      oscData.panner.connect(masterGain);
    } catch (e) {
      // ignore connection failures
    }

    // Start the carrier oscillator
    try {
      oscData.osc.start(now);
      // Schedule stop and cleanup for carrier
      const noteDuration = duration || FM_DEFAULT_DURATION;
      oscData.osc.onended = () => {
        try { structuredLog('DEBUG', `OSC_LIFECYCLE: ONENDED`, { id: oscData.id, synth: 'fm-synthesis' }); } catch (_) {}
      };
    } catch (e) {
      // ignore if already started
    }

    // PERF OPTIMIZATION: Acquire modulator from pre-allocated pool
    const modData = acquireModulator(modulatorPool);
    if (modData) {
      // configure modulator frequency
      const targetModFreq = modFreq || Math.max(0.5, pitch * 2);
      if (typeof modData.osc.frequency.setTargetAtTime === 'function') {
        modData.osc.frequency.setTargetAtTime(targetModFreq, now, FM_SMOOTHING_TIME);
      } else if ('value' in modData.osc.frequency) {
        modData.osc.frequency.value = targetModFreq;
      }

      // modulation depth scaled by intensity
      const depth = Math.max(0, Math.min(2000, modulationIndex * intensity));
      if (typeof modData.gain.gain.setTargetAtTime === 'function') {
        modData.gain.gain.setTargetAtTime(depth, now, FM_SMOOTHING_TIME);
      } else if ('value' in modData.gain.gain) {
        modData.gain.gain.value = depth;
      }

      // Connect modulator gain -> carrier.frequency (AudioParam)
      try {
        if (modData.connectedTo !== oscData.osc.frequency) {
          if (modData.connectedTo) {
            try { modData.gain.disconnect(modData.connectedTo); } catch (e) { /* ignore */ }
          }
          modData.gain.connect(oscData.osc.frequency);
          modData.connectedTo = oscData.osc.frequency;
        }
      } catch (e) {
        // ignore connection failures
      }
    }

    // harmonics: use additional oscillators from pool
    for (let h = 0; h < harmonics.length; h++) {
      const hFreq = harmonics[h];
      if (!hFreq) continue;
      const harmonicOsc = getOscillator();
      if (!harmonicOsc) continue;
      harmonicOsc.osc.type = 'sine';
      if (typeof harmonicOsc.osc.frequency.setTargetAtTime === 'function') {
        harmonicOsc.osc.frequency.setTargetAtTime(hFreq, now, FM_SMOOTHING_TIME);
      } else if ('value' in harmonicOsc.osc.frequency) {
        harmonicOsc.osc.frequency.value = hFreq;
      }
      if (harmonicOsc.gain && typeof harmonicOsc.gain.gain.setTargetAtTime === 'function') {
        harmonicOsc.gain.gain.setTargetAtTime(Math.min(1, intensity * 0.5), now, FM_SMOOTHING_TIME);
      }
      if (harmonicOsc.panner && typeof harmonicOsc.panner.pan.setTargetAtTime === 'function') {
        harmonicOsc.panner.pan.setTargetAtTime(azimuth, now, FM_SMOOTHING_TIME);
      }
      harmonicOsc.active = true;
      
      // Connect harmonic to output
      try {
        harmonicOsc.osc.connect(harmonicOsc.gain);
        harmonicOsc.gain.connect(harmonicOsc.panner);
        harmonicOsc.panner.connect(masterGain);
      } catch (e) {
        // ignore connection failures
      }
      
      // Start harmonic oscillator and schedule stop/cleanup
      try {
        harmonicOsc.osc.start(now);
        try { harmonicOsc.osc.stop(now + (duration || 0.5)); } catch (e) { /* ignore */ }
        harmonicOsc.osc.onended = () => {
          try { structuredLog('DEBUG', `OSC_LIFECYCLE: ONENDED`, { id: harmonicOsc.id, synth: 'fm-synthesis', role: 'harmonic' }); } catch (_) {}
          try { if (ctx.releaseOscillator) ctx.releaseOscillator(harmonicOsc); } catch (e) {}
        };
      } catch (e) {
        // ignore if already started
      }
    }
  }

  // Release unused modulators at end of frame
  // (modulators that weren't acquired this frame will fade out)
  // Note: We don't release here because modulators stay connected until next frame
}
