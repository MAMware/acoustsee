// File: web/audio/sound-profiles.js
// This manifest maps an `objectType` string (from an AcousticCue) to a
// sound profile. The profile specifies which synthesizer to use (`playFunction`)
// and the base parameters for that sound.

// 1. Import all available synth functions that will be used in our profiles.
import { playSineWave } from './synths/sine-wave.js';
import { playStrings } from './synths/strings.js';
import { playSawtoothPad } from './synths/sawtooth-pad.js';

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
      // Note: Pitch, intensity, and position will be supplied by the cue itself.
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
  }
};
