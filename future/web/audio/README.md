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
-   **`audio-router.js`:** (ADR-0006) Decouples the video pipeline from the audio engine. Receives raw analysis data from `FrameConductor`, applies sonification mapping, and dispatches `audioCuesReady` events.
-   **`audio-manager.js`:** Manages the lifecycle of the Web Audio API `AudioContext`. **AudioContext is created immediately in the constructor (eager initialization, fail-fast).** Unlocking (power-on) resumes the context and triggers synthesis initialization.
-   **`sound-profiles.js`:** A manifest mapping a semantic `objectType` (from a video `cue`) to a specific synthesizer and its base parameters.
-   **`synths/`:** A directory of pluggable synthesizer modules, each an independent "instrument."

---

## Audio Initialization & Unlock Ceremony

**Lifecycle:**
- At app startup, `AudioManager` creates the `AudioContext` immediately (no lazy `_createContextIfNeeded`).
- The context starts in `suspended` state (browser security).
- On power-on, the user gesture resumes the context and runs `initializeAudio()`.
- `engine.audioApi` is assigned only after synthesis is initialized, exposing `playCues`, `resizeOscillatorPool`, and `setSelectedSynthEngine`.
- If audio is not ready, commands fail loudly (no silent fallback or degradation).

**Separation of Concerns:**
- `audioManager`: manages context lifecycle and unlock.
- `audioApi`: exposes playback surface (`playCues`, etc.) after synthesis init.

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
## Error Handling Policy

**Audio is required.** If `engine.audioApi` is missing or not ready, commands must fail loudly (ERROR log, no silent fallback). Language subsystem may degrade gracefully (returns key), but must never block audio initialization.

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

## Oscillator Pool Management

### Pool Sizing & Device Capability

The oscillator pool is created at startup with a device-aware size:

```javascript
// In audio-processor.js - initializeAudio()
const poolSize = getOptimalPoolSize();  // Device-dependent

function getOptimalPoolSize() {
  // Desktop/Laptop: 32 oscillators (support 32 simultaneous notes)
  // Tablet: 24 oscillators
  // Mobile: 16 oscillators (conserve memory and CPU)
  
  if (navigator.hardwareConcurrency >= 6) return 32;   // Desktop
  if (navigator.hardwareConcurrency >= 4) return 24;   // Tablet
  return 16;  // Mobile
}
```

### What Happens When Pool Is Exhausted?

When all oscillators are active and more notes arrive:

```javascript
function getOscillator() {
  // Try to get from available pool
  if (availablePool.length > 0) {
    return availablePool.pop();  // ✅ Reuse existing
  }
  
  // Pool empty - fallback options (in order of preference):
  
  // Option 1: Create NEW oscillator (⚠️ Warning: memory risk)
  const fallback = createFreshOscillator();
  console.warn('Pool exhausted - creating fallback oscillator');
  return fallback;
  
  // Option 2: Stop oldest active oscillator and reuse
  // (Not currently implemented, but could be added)
  
  // Option 3: Return null (drop note silently)
  // return null;
}
```

### When Pool Gets Exhausted (Symptoms):

| Symptom | Cause | Solution |
|---------|-------|----------|
| "Pool exhausted" warnings in console | More simultaneous notes than pool size | Reduce max cues in grid's mapFunction |
| Silent notes that don't play | getOscillator() returned null | Increase pool size if device allows |
| Memory usage grows unexpectedly | Creating fallback oscillators | Check grid output (cues array too large) |
| Audio becomes sporadic/choppy | CPU hitting limits with fallback creation | Optimize grid or reduce synthesizer complexity |

### Preventing Pool Exhaustion

**1. Limit cues array size in Grid's `mapFunction`:**

```javascript
// In a grid's mapFunction
export function mapMotion(analysisResult, context) {
  const regions = analysisResult.regions;
  
  // ✅ GOOD: Filter and limit
  const cues = regions
    .slice(0, 12)  // ← Limit to 12 regions
    .map(region => ({
      objectType: 'motion',
      pitch: frequencyFromRegion(region),
      intensity: region.energy * 0.8,
      duration: 0.5
    }));
  
  return { cues };
}

// ❌ BAD: No limit
export function mapMotion(analysisResult, context) {
  const cues = analysisResult.regions.map(region => ({
    // Every region becomes a note - can exceed 32!
  }));
  return { cues };
}
```

**2. Synth should handle `null` oscillator gracefully:**

```javascript
// In synth code
notes.forEach(note => {
  const oscData = getOscillator();
  
  if (!oscData) {
    // ✅ Graceful fallback
    console.warn('Oscillator not available - skipping note');
    return;  // Drop note silently, don't crash
  }
  
  // Continue with valid oscillator
  const { osc, gain } = oscData;
  // ...
});
```

**3. Monitor pool utilization:**

```javascript
// In diagnostics or dev panel
function getPoolMetrics() {
  const available = availablePool.length;
  const active = totalPoolSize - available;
  const utilization = active / totalPoolSize;
  
  return {
    available,
    active,
    totalSize: totalPoolSize,
    utilizationPercent: Math.round(utilization * 100),
    warning: utilization > 0.9  // Alert if >90% used
  };
}

// Log periodically
if (Math.random() < 0.01) {  // 1% sample
  const metrics = getPoolMetrics();
  if (metrics.warning) {
    structuredLog('WARN', 'Pool utilization critical', metrics);
  }
}
```

### Resizing the Pool

To support more simultaneous notes:

**Step 1:** Update pool size in `audio-processor.js`:
```javascript
const poolSize = 48;  // Increased from 32
```

**Step 2:** Test on target device:
```javascript
// In browser console with ?debug=true
const metrics = window.engine.getPoolMetrics?.();
console.log('Pool metrics:', metrics);
// Monitor memory: DevTools → Memory → Take heap snapshot
```

**Step 3:** Document the change:
```javascript
// POOL SIZE DECISION LOG (in comments)
// 2025-10-23: Increased from 32 to 48
// Reason: Support up to 16 regions per frame in 3-region grids
// Device baseline: Tested on iPhone 15 (4-core), iPad Pro (6-core)
// Memory impact: ~2.8MB additional (48 * ~58KB per oscillator + nodes)
// CPU impact: +3-5% when pool fully utilized
```

### Common Pool-Related Issues

**Issue 1: "Cannot set property 'type' of null"**
```
Cause: getOscillator() returned null (pool exhausted)
Debug: 
  1. Check pool size via getPoolMetrics()
  2. Check cues array length (grid.mapFunction output)
  3. Check if grid is limiting output properly
Fix: 
  - Reduce cues or increase pool size
  - Add null check in synth
```

**Issue 2: Pool grows unbounded**
```
Cause: Creating fallback oscillators constantly
Debug:
  1. Check console for "Pool exhausted" warnings
  2. Count frequency of warnings
  3. Check grid output with grid.mapFunction
Fix:
  - Limit cues in grid's mapFunction
  - Don't create fallbacks, return null instead
```

**Issue 3: Memory leaks after extended use**
```
Cause: Oscillators not being disconnected properly
Debug:
  1. Take heap snapshot at start and after 5 mins
  2. Compare memory usage
  3. Check if availablePool.length grows or shrinks
Fix:
  - Verify synth calls osc.disconnect()
  - Check releaseOscillator() is called
  - Look for setTimeout that doesn't fire
```

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
