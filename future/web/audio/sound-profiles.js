// File: web/audio/sound-profiles.js

// 1. Import all available synth functions that will be used in our profiles.
import { playSineWave } from './synths/sine-wave.js';
import { playStrings } from './synths/strings.js';
import { playSawtoothPad } from './synths/sawtooth-pad.js';

/**
 * The Sound Profile Manifest.
 * This object maps an `objectType` string (from an AcousticCue) to a
 * sound profile, which includes the synthesizer to use (`playFunction`) and
 * the base parameters for that sound.
 */
export const soundProfileManifest = {
  // --- DEFAULT / FALLBACK PROFILE ---
  'default_motion': {
    playFunction: playSineWave,
    params: {
      duration: 0.2,
      attack: 0.01,
      release: 0.1
    }
  },

  'sign': {
    playFunction: playSineWave,
    params: {
      basePitch: 2500,
      duration: 0.05,
      attack: 0.005,
      release: 0.02
    }
  },

  'wall': {
    playFunction: playSawtoothPad,
    params: {
      basePitch: 300,
      duration: 0.5,
      filterCutoff: 1200
    }
  },
  
  'sidewalk': {
    playFunction: playStrings,
    params: {
      basePitch: 100,
      decay: 0.99,
      duration: 1.0
    }
  }
};
