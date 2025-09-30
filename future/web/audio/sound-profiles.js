// File: web/audio/sound-profiles.js
// This manifest maps an `objectType` string (from a Cue) to a
// sound profile. The profile specifies which synthesizer to use (`playFunction`)
// and the base parameters for that sound.

import { playSineWave } from './synths/sine-wave.js';
import { playStrings } from './synths/strings.js';
import { playSawtoothPad } from './synths/sawtooth-pad.js';
// As you create new synths, you will import their play functions here.

/**
 * The Sound Profile Manifest.
 */
export const soundProfileManifest = {
  // --- DEFAULT / FALLBACK PROFILE ---
  // A simple, clear sound for any generic motion detected.
  'default_motion': {
    playFunction: playSineWave,
    params: {
      duration: 0.2,
      attack: 0.01,
      release: 0.1
      // Note: Pitch, intensity, and position are supplied dynamically by the cue itself.
    }
  },

  // --- EXAMPLE FUTURE PROFILES ---
  // These demonstrate how you would add more specific sounds later when you
  // have an object detection module.

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
  },

  'bottle': {
    playFunction: playStrings, // The Karplus-Strong synth is great for a "plucked" plastic sound
    params: {
      decay: 0.97,
      duration: 0.8
      // Pitch and intensity will be provided by the Grid's "sonic sculpture"
    }
  }
};
