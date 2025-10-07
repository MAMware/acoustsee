# Video Subsystem

This directory contains all logic for video capture, processing, and analysis. The system is built on a modern, multi-worker "FrameProvider -> Orchestrator -> Specialists" architecture designed for performance, modularity, and real-time adaptation.

**⚠️ CRITICAL ARCHITECTURAL RULES:**
1. **The video system does NOT know about the audio system.** It produces generic `cues` that are dispatched via events.
2. **All frame processing happens in workers.** The main thread only orchestrates and dispatches commands.
3. **Workers communicate via structured messages.** Use `{ type: 'command', data: {...} }` format.
4. **The Orchestrator delegates, it doesn't analyze.** Analysis logic belongs in Specialist workers.

---

## Core Architecture

### 1. `workers/frame-provider-worker.js` (The Frame Provider)

**Purpose:** Isolate camera access and provide a clean, steady stream of frames.

**Responsibilities:**
- Runs its own `requestAnimationFrame` loop in a dedicated worker
- Uses `OffscreenCanvas` and `MediaStreamTrackProcessor` for efficient capture
- Tags each frame with timing metadata (`startTime`) for performance measurement
- Dispatches `ImageData` to the main thread

**Key Points:**
- This is the ONLY place that touches the raw video stream
- It does NOT analyze frames - it just provides them
- Performance is measured END-TO-END (from this `startTime` to final audio cue)

**Message Contract:**
```javascript
// To worker:
{ type: 'init', videoTrack, offscreenCanvas, updateInterval }
{ type: 'setThrottle', skipFrames } // For performance adjustment

// From worker:
{ type: 'frame', imageData, width, height, timestamp, startTime }
```

---

### 2. `frame-processor.js` (The Orchestrator)

**Purpose:** Central coordination point that delegates analysis tasks based on application mode.

**Initialization:** Called via `initializeVideo(videoElement, engine, motionThreshold)`

**Responsibilities:**
- Receives frames from `FrameProvider`
- Determines which Specialist workers to activate based on `state.currentMode`
- Routes frame data to appropriate Specialists
- Collects analysis results from Specialists
- Passes results to the active Grid's `mapFunction`
- Dispatches the final `cues` array via `'audioCuesReady'` event

**Mode-Specific Behavior:**

| Mode | Specialists Used | Grid Purpose | Output Type |
|------|-----------------|--------------|-------------|
| **Flow** | `motion-worker.js` | Map spatial motion → soundscape | Textural, ambient cues |
| **Focus** | (Future: `segment-worker.js`, `depth-worker.js`) | Map semantic objects → sonic signatures | Discrete, recognizable cues |

**Key Points:**
- The Orchestrator is STATELESS - it doesn't remember previous frames
- It does NOT make musical decisions - that's the Grid's job
- It does NOT directly create cues - it delegates to the Grid

---

### 3. Specialist Workers (`workers/motion-worker.js`, etc.)

**Purpose:** Experts in a single, computationally expensive analysis task.

**Current Specialists:**
- `motion-worker.js`: Detects regions of motion using frame differencing

**Future Specialists:**
- `segment-worker.js`: Object segmentation using ML models
- `depth-worker.js`: Depth estimation from monocular video

**Contract:**
```javascript
// To specialist:
{ type: 'processFrame', imageData, width, height, threshold }

// From specialist:
{ type: 'motionDetected', movingRegions: [...], timestamp }
// OR
{ type: 'noMotion', timestamp }
```

**Rules for Writing Specialists:**

- ✅ **DO** use ES6 `import` for modern workers
- ✅ **DO** return structured, semantic data (not raw pixels)
- ✅ **DO** include timing information for performance tracking
- ❌ **DON'T** make musical decisions - return spatial/semantic data only
- ❌ **DON'T** maintain state across frames (each frame is independent)
- ❌ **DON'T** use `console.log` excessively (use structured messages)
- ❌ **DON'T** use `importScripts()`

---

### 4. Grids (`grids/`)

**Purpose:** Pluggable "sonic sculptor" modules that translate analysis data into musical concepts.

**Current Grids:**
- `linear-pitch.js`: Maps vertical position → pitch (simple, performant)
- `circle-of-fifths.js`: Maps angle from center → circle of fifths harmony
- `hex-tonnetz.js`: Maps position → just intonation harmony network

**Grid Contract:**
```javascript
export const gridMeta = {
  id: 'grid-id',
  name: 'Display Name',
  description: 'What musical mapping this grid provides'
};

export function mapFunction(analysisData, context) {
  // analysisData: From Specialist (e.g., { movingRegions: [...] })
  // context: { width, height, currentMode, settings }
  
  // Return: { cues: [...] }
  return {
    cues: [
      {
        objectType: 'motion',        // Used for sound profile lookup
        pitch: 440,                  // Hz (or MIDI note number)
        intensity: 0.5,              // 0.0 to 1.0
        position: { x: 0, y: 0 },   // Normalized -1 to 1
        duration: 0.2,               // Seconds (optional)
        // ... any other synth-specific parameters
      }
    ]
  };
}
```

**Mode-Specific Guidelines:**

**Flow Mode Grids:**
- Map SPATIAL data (position, motion vectors) → pitch/timbre
- Goal: Create ambient awareness of environment shape
- Priority: Low latency, continuous sound
- Example: Motion at top of frame = high pitch, bottom = low pitch

**Focus Mode Grids:**
- Map SEMANTIC data (object shape, type, properties) → melodic patterns
- Goal: Create recognizable "acoustic signature" for each object
- Priority: Accuracy, distinctiveness
- Example: Cup shape = glass harmonica melody

**Rules for Writing Grids:**
- ✅ **DO** normalize positions to -1 to 1 range
- ✅ **DO** limit `cues` array to reasonable size (12-24 max)
- ✅ **DO** use `objectType` consistently with `sound-profiles.js`
- ✅ **DO** provide sensible defaults for missing data
- ❌ **DON'T** access the audio system directly
- ❌ **DON'T** maintain state (grids are pure functions)
- ❌ **DON'T** perform expensive computation (delegate to Specialists)

---

## Data Flow (End-to-End)

```
Camera Stream
    ↓
[FrameProvider Worker] ← Tags with startTime
    ↓ (ImageData)
[frame-processor.js] ← Main thread orchestrator
    ↓ (Based on mode)
[Specialist Worker(s)] ← Analysis (motion, segmentation, etc.)
    ↓ (Structured results)
[Grid mapFunction] ← Translate to musical concept
    ↓ (cues array)
engine.dispatch('audioCuesReady', cues)
    ↓
[Audio Subsystem] ← See audio/README.md
```

**Timing Flow:**
```
startTime (FrameProvider) 
    → ... processing ... 
    → endTime (Sonification Handler)
    → logFrameBenchmark(duration)
    → Diagnostics Handler (performance analysis)
    → setFrameInterval (adjustment)
```

---

## Performance Considerations

### The AutoFPS Feedback Loop

The video subsystem participates in an intelligent performance management system:

1. **Measurement:** Each frame is tagged with `startTime` by the FrameProvider
2. **Reporting:** The end of the pipeline measures `endTime - startTime` and dispatches `'logFrameBenchmark'`
3. **Analysis:** The Diagnostics Handler collects these measurements in a rolling buffer
4. **Adjustment:** Based on the data, the system can:
   - Skip frames (e.g., process every 2nd frame)
   - Reduce resolution of `ImageData`
   - Disable expensive Specialists temporarily

### Performance Budget Guidelines

| Component | Target Time | Notes |
|-----------|-------------|-------|
| FrameProvider capture | < 5ms | Camera API + canvas draw |
| Specialist analysis | < 20ms | Per specialist, parallelizable |
| Grid mapping | < 2ms | Should be very fast |
| **Total pipeline** | **< 30ms** | **Leaves 35ms for audio + render (60 FPS)** |

---

## Adding a New Specialist Worker

1. Create `workers/my-specialist-worker.js`
2. Implement the message contract:
   ```javascript
   self.onmessage = (e) => {
     const { type, imageData, width, height } = e.data;
     if (type === 'processFrame') {
       // Your analysis logic here
       const results = analyzeFrame(imageData, width, height);
       self.postMessage({ type: 'analysisComplete', results });
     }
   };
   ```
3. Update `frame-processor.js` to create and route to your worker
4. Test performance impact using Dev Panel metrics
5. Document in this README

---

## Adding a New Grid

1. Create `grids/my-grid.js`
2. Implement the contract (see Grid Contract section above)
3. Export `gridMeta` and `mapFunction`
4. Add to `grids/available-grids.js` manifest
5. Test with both Flow and Focus modes (if applicable)
6. Document the musical mapping concept

---

## Common Issues & Solutions

### "Worker failed to load"
- **Cause:** Incorrect worker path or module type mismatch
- **Solution:** Check `basePath` is correct, verify ES6 `import` vs ES5 `importScripts()`

### "No motion detected" (but there is motion)
- **Cause:** Threshold too high or camera feed corrupted
- **Solution:** Check `motionThreshold` setting (0-100, lower = more sensitive)

### "Frames are skipped/stuttering"
- **Cause:** Pipeline is too slow, AutoFPS is throttling
- **Solution:** Optimize Specialist workers, reduce analysis complexity

### "Cues are empty"
- **Cause:** Grid `mapFunction` returned invalid structure
- **Solution:** Grid MUST return `{ cues: [...] }`, not just the array

---

## File Checklist

When working in this directory:
- [ ] Did you modify a worker? **Test in both Chrome and Firefox (different worker APIs).**
- [ ] Did you add a Specialist? **Measure performance impact before merging.**
- [ ] Did you modify a Grid? **Test with various motion patterns.**
- [ ] Did you change the frame format? **Update ALL workers and the Orchestrator.**
- [ ] Did you add expensive computation? **Consider moving to a Specialist worker.**

---

**Last Updated:** 7 October 2025 - Architecture stabilized, Focus mode in development
