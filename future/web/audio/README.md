# Audio Subsystem

This directory contains all logic related to sound generation and processing. The system is designed as a modular pipeline with a central "Conductor" that orchestrates pluggable synthesizers.

## Key Files

-   **`audio-processor.js`:** The central "Conductor" that orchestrates all sound production via its `playCues` function.
-   **`audio-manager.js`:** Manages the lifecycle of the Web Audio API `AudioContext`, including critical user-gesture unlocking.
-   **`sound-profiles.js`:** A manifest mapping a semantic `objectType` (from a video `cue`) to a specific synthesizer and its base parameters.
-   **`synths/`:** A directory of pluggable synthesizer modules, each an independent "instrument."

## The "Conductor" Data Flow (`playCues`)

The `playCues` function in `audio-processor.js` is the sole entry point for generating sound in the application. It receives an array of `cues` from the `sonification-commands.js` bridge.

1.  **Input:** An array of `cues` (e.g., `{ objectType, pitch, intensity, position }`).
2.  **Mapping:** For each cue, it looks up the `objectType` in the `sound-profiles.js` manifest to find the appropriate sound profile.
3.  **Transformation:** It creates "note" objects by merging the dynamic properties from the cue with the static parameters from the sound profile.
4.  **Grouping (Performance Critical):** It groups all notes by the synthesizer (`playFunction`) responsible for playing them.
5.  **Output:** It calls each required synthesizer **only once per frame** with a batch of all the notes it needs to play, along with a shared `synthContext` (containing the `AudioContext`, `masterGain`, etc.).

This "Conductor" pattern is highly efficient and allows for complex soundscapes to be generated without overwhelming the audio engine. It also cleanly decouples the "what to play" (from the video pipeline) from the "how to play it" (managed by the audio pipeline).
