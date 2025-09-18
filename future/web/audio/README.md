# Audio Subsystem

This directory contains all logic related to sound generation and processing for AcoustSee.

## Key Files

- `audio-processor.js`: The central "Conductor" that orchestrates all sound production.
- `audio-manager.js`: Manages the lifecycle of the Web Audio API `AudioContext`, including user-gesture unlocking.
- `sound-profiles.js`: A manifest mapping visual `objectType` strings to sound characteristics and synthesizers.
- `synths/`: A directory of pluggable synthesizer modules.

## The `playCues` Data Flow

`playCues` in `audio-processor.js` is the heart of this module:

1. Input: `cues` from the Video Subsystem.
2. Mapping: Look up the cue's `objectType` in the sound profile manifest.
3. Transformation: Create `note` objects merging cue data with profile params.
4. Grouping: Group notes by `playFunction`.
5. Output: Call each synth with (notes, synthContext) where `synthContext` includes `audioContext`, `masterGain`, etc.

## Adding a New Synth

1. Create a file under `web/audio/synths/`.
2. Export a `play...` function and (optionally) `synthMeta`.
3. Register the synth in `available-synths.js`.
4. Add a `sound-profiles.js` entry mapping an `objectType` to your synth.
