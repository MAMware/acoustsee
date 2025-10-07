# Audio Subsystem

This directory contains all logic related to sound generation and processing. The system is designed as a modular pipeline with a central "Conductor" that orchestrates pluggable synthesizers.

**⚠️ CRITICAL ARCHITECTURAL RULES:**
1. **The audio system does NOT know about the video system.** It receives generic `cues` via commands.
2. **All sound generation happens through `playCues()`.** No other function should create or start oscillators.
3. **Synthesizers are pure functions.** They receive `notes` and `ctx`, produce sound, return nothing.
4. **The oscillator pool is managed ONLY by `audio-processor.js`.** Synths receive unconnected, unstarted oscillators.

---

## Key Files

-   **`audio-processor.js`:** The central "Conductor" that orchestrates all sound production via its `playCues` function. **This is the ONLY file that should manage the oscillator pool.**
-   **`audio-manager.js`:** Manages the lifecycle of the Web Audio API `AudioContext`, including critical user-gesture unlocking.
-   **`sound-profiles.js`:** A manifest mapping a semantic `objectType` (from a video `cue`) to a specific synthesizer and its base parameters.
-   **`synths/`:** A directory of pluggable synthesizer modules, each an independent "instrument."

---

## The "Conductor" Data Flow (`playCues`)

The `playCues` function in `audio-processor.js` is the **sole entry point** for generating sound in the application. It receives an array of `cues` from the `sonification-commands.js` bridge.

### Flow:

1.  **Input:** An array of `cues` (e.g., `{ objectType, pitch, intensity, position }`).
2.  **Mapping:** For each cue, it looks up the `objectType` in the `sound-profiles.js` manifest to find the appropriate sound profile.
3.  **Transformation:** It creates "note" objects by merging the dynamic properties from the cue with the static parameters from the sound profile.
4.  **Grouping (Performance Critical):** It groups all notes by the synthesizer (`playFunction`) responsible for playing them.
5.  **Context Creation:** It creates a `synthContext` object containing:
    ```javascript
    {
      audioContext,      // The Web Audio API context
      getOscillator,     // Function to get oscillator from pool
      releaseOscillator, // Function to return oscillator to pool
      masterGain,        // The output gain node (for volume control)
      oscillatorPool,    // The pool array (for reference/cleanup)
      settings           // Any synth-specific settings
    }
    ```
6.  **Output:** It calls each required synthesizer **only once per frame** with a batch of all the notes it needs to play, along with the shared `synthContext`.

### Why This Pattern?

This "Conductor" pattern is highly efficient and allows for complex soundscapes to be generated without overwhelming the audio engine. It also cleanly decouples the "what to play" (from the video pipeline) from the "how to play it" (managed by the audio pipeline).

---

## Oscillator Pool Architecture

### THE RULES (Follow These Exactly):

1. **The pool stores UNCONNECTED, UNSTARTED oscillators**: `{ osc, gain, panner, active: false }`
2. **Synths are responsible for:**
   - Connecting: `osc.connect(gain)`, `gain.connect(panner)`, `panner.connect(masterGain)`
   - Starting: `osc.start(audioContext.currentTime)`
   - Configuring: Setting `osc.type`, `osc.frequency.value`, etc.
3. **Pool functions (in `audio-processor.js`):**
   - `resizeOscillatorPool()`: Creates initial pool - **NO wiring, NO starting**
   - `getOscillator()`: Returns pool item or creates fallback - **NO wiring, NO starting**
   - `releaseOscillator()`: Cleans up used oscillator, creates fresh replacement - **NO wiring, NO starting**
   - `playCues()` refill logic: Replenishes depleted pool - **NO wiring, NO starting**

### Why This Matters:

- **OscillatorNode.start() can only be called ONCE** - If the pool pre-starts them, synths can't start them again
- **Synths need flexibility** - They may want custom routing (filters, effects) between nodes
- **Separation of concerns** - Pool manages lifecycle, synths manage sound design

---

## Writing a Synth Plugin

### Contract:

```javascript
export function playSynthName(notes = [], ctx = {}) {
  // 1. Extract what you need from ctx
  const { audioContext, getOscillator, masterGain } = ctx;
  
  // 2. Validate requirements
  if (!audioContext || !getOscillator || !masterGain) {
    console.warn('synthName: required context not provided');
    return;
  }
  
  // 3. Process each note
  const now = audioContext.currentTime;
  notes.forEach(note => {
    const oscData = getOscillator();
    if (!oscData) return; // Pool exhausted
    
    const { osc, gain, panner } = oscData;
    
    // 4. CONFIGURE the oscillator (but don't connect or start yet)
    osc.type = 'sine';
    osc.frequency.value = note.pitch;
    gain.gain.value = note.intensity;
    panner.pan.value = note.position?.x || 0;
    
    // 5. CONNECT to output
    osc.connect(gain);
    gain.connect(panner);
    panner.connect(masterGain); // CRITICAL: This makes sound audible!
    
    // 6. START the oscillator
    osc.start(now);
    
    // 7. SCHEDULE stop and cleanup
    const duration = note.duration || 0.5;
    osc.stop(now + duration);
    setTimeout(() => {
      osc.disconnect();
      gain.disconnect();
      panner.disconnect();
      // Optionally: call releaseOscillator if you want to recycle
    }, duration * 1000 + 100);
  });
}

// 8. Export metadata
export const synthMeta = {
  id: 'synth-name',
  name: 'Display Name',
  description: 'What this synth does',
  maxNotes: 16
};
```

### Common Mistakes to Avoid:

❌ **DON'T** assume pool oscillators are connected or started
❌ **DON'T** use `oscillatorPool` directly without extracting it from `ctx`
❌ **DON'T** forget to connect to `masterGain` (no sound without this!)
❌ **DON'T** try to start an oscillator twice (it will throw)
❌ **DON'T** create global variables or maintain state between calls

✅ **DO** extract all dependencies from `ctx`
✅ **DO** validate required dependencies exist
✅ **DO** connect your audio graph to `masterGain`
✅ **DO** start oscillators after connecting them
✅ **DO** schedule cleanup to prevent memory leaks

---

## Special Case: Karplus-Strong Synthesis (Strings)

The `strings.js` synth uses Karplus-Strong (plucked string) synthesis, which is more complex:

### Critical Parameters:
- **Feedback gain**: MUST be < 1.0 to prevent runaway resonance. Recommended: 0.85-0.95
- **Initial excitation**: Should be LOW (0.2-0.4) to prevent clipping
- **Output amplitude**: Should be LOWER than other synths (0.08-0.15) due to resonance buildup

### Example (Correct):
```javascript
const feedback = ac.createGain();
feedback.gain.value = 0.90; // Safe range: prevents explosion
const amp = note.intensity * 0.15; // Lower than typical synths
```

### Example (WRONG - Will Clip):
```javascript
const feedback = ac.createGain();
feedback.gain.value = 0.98; // TOO HIGH - causes exponential growth
const amp = note.intensity * 0.5; // TOO HIGH - will clip
```

---

## Testing Your Synth

1. **No console errors** when selecting the synth
2. **Audible sound** when motion is detected (flow mode)
3. **No clipping** (check for distortion or loud pops)
4. **Clean silence** when motion stops
5. **CPU usage** stays reasonable (check dev panel metrics)

---

## File Checklist

When working in this directory:
- [ ] Did you modify `audio-processor.js`? **Read the oscillator pool rules above first.**
- [ ] Did you create a new synth? **Follow the contract exactly.**
- [ ] Did you modify an existing synth? **Test ALL synths afterwards - they share the pool.**
- [ ] Did you change the `synthContext`? **Update this README and all synths.**
- [ ] Did you see "oscillatorPool is not defined"? **You forgot to extract it from ctx.**
- [ ] Did you see "masterGain is not defined"? **You forgot to extract it from ctx.**
- [ ] Did you see "Cannot set property 'type' of null"? **The pool gave you a null oscillator - check pool size.**

---

**Last Updated:** 7 October 2025 - Oscillator pool architecture solidified
