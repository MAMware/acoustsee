# Video Subsystem

This directory contains all logic for video capture, processing, and analysis. The system is built on a modern, multi-worker "FrameProvider -> Orchestrator -> Specialists" architecture designed for performance, modularity, and real-time adaptation.

**⚠️ CRITICAL ARCHITECTURAL RULES:**
1. **The video system does NOT know about the audio system.** It produces generic `cues` that are dispatched via events.
2. **All frame processing happens in workers.** The main thread only orchestrates and dispatches commands.
3. **Workers communicate via structured messages.** Use `{ type: 'command', data: {...} }` format.
4. **The Orchestrator delegates, it doesn't analyze.** Analysis logic belongs in Specialist workers.

---

## Component Status Matrix (Alpha Phase) November 10, 2025. v0.9.4-bugMotion

**RESOLVED:** Motion consolidation complete - now using only `fast-motion-worker.js` via FrameConductor. No more ambiguity between motion-worker.js and fast-motion-worker.js. 

**Legend:** ✅ STABLE (production-ready) | 🟡 WIP (in progress) | ❌ PLACEHOLDER (not started)

This matrix helps you understand which components are ready for testing vs. which are still being developed.

| Component | Status | Happy Path | Ready for Testing | Notes |
|-----------|--------|-----------|-----|-------|
| **Flow Mode (GPU)** |  UNSTABLE | Motion → Grid → Audio ✓ | Yes | Chrome/Brave/Edge, MediaStreamTrackProcessor, fast |
| **Flow Mode (Canvas)** |  UNSTABLE | Motion → Grid → Audio ✓ | Yes | Firefox/Safari/iOS, CPU-based capture, works everywhere |
| **Motion Worker** | UNSTABLE | Detects moving regions ✓ | Yes | Core component, robust motion detection |
| **Frame Conductor** | WIP | Orchestrates workers ✓ | Yes | Manifest-driven, hot-swap support |
| **Grid System** |  WIP | Maps motion → pitch ✓ | Yes | Linear-pitch + Circle-of-fifths, working |
| **Focus Mode** | 🟡 WIP | Framework exists | No | Semantic detection incomplete, produces placeholder cues |
| **Depth Worker** | 🟡 WIP | Stub implemented | No | Produces dummy data currently |
| **Hybrid Mode** | 🟡 WIP | Decision logic sketched | No | Auto-switching not yet working |
| **Segment Worker** | ❌ PLACEHOLDER | Not implemented | No | Object detection not started |

**For Alpha Testing:** Focus on Flow mode (GPU + Canvas). Other modes are scaffolding.

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

**Phase 3.1b Update:** Now uses `FrameConductor` for manifest-driven worker orchestration instead of hardcoded chain logic.

**Initialization:** Called via `initializeVideo(videoElement, engine, motionThreshold)`

**Responsibilities:**
- Receives frames from `FrameProvider`
- Delegates to `FrameConductor` to route frames through the appropriate worker chain
- FrameConductor determines which Specialist workers to activate based on `state.currentMode`
- Collects analysis results from workers
- Routes results to the active Grid's `mapFunction`
- Dispatches the final `cues` array via `'audioCuesReady'` event

**Mode-Specific Behavior:**

| Mode | Specialists Used | Grid Purpose | Output Type |
|------|-----------------|--------------|-------------|
| **Flow** | `fast-motion-worker.js` | Map spatial motion → soundscape | Textural, ambient cues |
| **Focus** | (Future: `segment-worker.js`, `depth-worker.js`) | Map semantic objects → sonic signatures | Discrete, recognizable cues |

**Key Points:**
- The Orchestrator is STATELESS - it doesn't remember previous frames
- We should not make musical/sound(cues) decisions - that's the Grid's job
- We do not create the the cues, we delegate to the Grid
- Worker chains are now defined in `workers/worker-manifest.js` (not hardcoded)
- Mode changes trigger automatic worker hot-swap via `FrameConductor.initializeForMode(newMode)`
- Adding new workers: just update the manifest, no code changes needed.
  - **Adding Workers Guide:** Edit `workers/worker-manifest.js` to add a new worker entry:
    ```javascript
    // workers/worker-manifest.js
    const WORKER_MANIFEST = {
      flow: [
        { worker: new Worker('workers/motion-detector.js'), timeout: 50, name: 'motion' },
        // Add new worker here:
        // { worker: new Worker('workers/my-custom-processor.js'), timeout: 30, name: 'custom' }
      ]
    };
    ```
  - FrameConductor reads this manifest on `initializeForMode()` and loads workers in sequence.
  - No code changes needed in `frame-conductor.js` or `frame-processor.js`.

**Lifecycle:**
```javascript
// Initialization (once at startup)
await initializeVideo({ videoElement, engine, ... });

// Mode changes (hot-swap workers via FrameConductor)
engine.onStateChange(state => {
  // FrameConductor automatically swaps workers when state.currentMode changes
});

// Cleanup (on app shutdown)
disposeVideo(); // Terminates all workers
```

---

### 2a. `frame-conductor.js` (Phase 3.1b - Manifest-Driven Orchestrator)

**Purpose:** Manifest-driven orchestrator that manages worker lifecycle and chains per mode.

**Key Features (Phase 3.1b):**
- Reads worker manifest (`workers/worker-manifest.js`) to determine workers per mode
- Manages worker loading/unloading with hot-swap support
- Executes workers in sequence (chain execution per mode)
- Validates all messages via `WorkerContract`
- Extracts capabilities from workers for audio pipeline feedback
- Handles errors gracefully without crashing

**Modes Supported:**
- `'flow'`: Real-time motion detection (<50ms latency target)
- `'focus'`: Semantic object detection (<200ms latency target)
- `'hybrid'`: Decision workers for mode detection (<10ms latency target)

**API:**
```javascript
// Create once at startup (latency budgets are diagnostic SLAs, not hard limits)
// These timeouts are configurable from dev-panel:
// Use `engine.dispatch('updateOrchestratorConfig', { flowTimeout: 100, focusTimeout: 200 })`
const conductor = new FrameConductor({ 
  flowTimeout: 100, 
  focusTimeout: 200, 
  hybridTimeout: 10 
});

// Initialize for a mode
await conductor.initializeForMode('flow'); // Loads Flow mode workers

// Process frames through current mode
const result = await conductor.processFrame(frameData, width, height, state);

// Get performance metrics
const metrics = conductor.getMetrics();
console.log(metrics.currentMode, metrics.lastFrameTimeMs);

// Hot-swap to new mode
await conductor.initializeForMode('focus'); // Unloads Flow workers, loads Focus workers 

// Cleanup on shutdown
conductor.dispose(); // Terminates all workers
```

**Benefits Over Hardcoded Logic:**
- 43% line count reduction (290+ lines of duplicate chain code removed)
- Adding new workers: update manifest only, no frame-processor changes
- Clear separation of concerns
- Full validation via WorkerContract
- Performance metrics exposed for diagnostics

---

### 3. Specialist Workers (`workers/fast-motion-worker.js`, etc.)

**Purpose:** Experts in a single, computationally expensive analysis task.

**Current Specialists:**
- `fast-motion-worker.js`: Detects motion regions via Lucas-Kanade optical flow on Y-plane (optimized for Flow mode, <15ms latency)

**Future Specialists:**
- `segment-worker.js`: Object segmentation using ML models
- `depth-worker.js`: Depth estimation from monocular video

**Contract:**
```javascript
// To specialist:
{ type: 'processingRequest', data: ArrayBuffer, width, height, state }

// From specialist (WorkerContract v2.0):
{ type: 'processingResult', capabilities: [...], result: { coords, intens, uFlow, vFlow }, timestamp }
// OR
{ type: 'processingError', error: '...' }
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

## Frame Timing & Performance Measurement

### The Timing Flow

Every frame carries timing metadata used for end-to-end performance diagnostics:

```javascript
// In frame-provider-worker.js
const startTime = performance.now();  // ← Captured at frame grab
const imageData = captureFrame();

postMessage({
  type: 'frame',
  imageData,
  startTime,    // ← Sent with frame
  timestamp: now
});

// In frame-processor.js (main thread)
handleFrameMessage(msg) {
  const analysisStart = performance.now();
  
  // Route through specialists and grid...
  const cues = await processFrame(msg.imageData);
  
  const analysisEnd = performance.now();
  const totalDuration = analysisEnd - msg.startTime;  // End-to-end!
  
  // Dispatch for diagnostics
  engine.dispatch('logFrameBenchmark', { 
    duration: totalDuration,
    frameId: msg.timestamp
  });
}
```

### Timing Assumptions (CRITICAL for Debugging)

⚠️ **Assumption 1: startTime is captured accurately**
- `startTime` should be measured BEFORE frame encoding
- If timestamp is captured too late, total duration is wrong
- If FrameProvider logs wrong time, diagnostics are misleading
- **Verify:** startTime should be ~0-5ms, not 20ms+

```javascript
// ❌ WRONG - captured too late:
const imageData = captureFrame();
const startTime = performance.now();  // Captured AFTER capture
postMessage({ type: 'frame', imageData, startTime });  // Wrong!

// ✅ CORRECT - captured first:
const startTime = performance.now();  // Captured FIRST
const imageData = captureFrame();
postMessage({ type: 'frame', imageData, startTime });
```

⚠️ **Assumption 2: Frames arrive in order**
- If Worker messages are reordered, timing appears wrong
- If frame N arrives after frame N+2, diagnostics get confused
- **Verify:** Check frame sequence numbers if added

```javascript
// In frame-processor.js
let lastFrameTimestamp = 0;
handleFrameMessage(msg) {
  if (msg.timestamp < lastFrameTimestamp) {
    structuredLog('WARN', 'Frame arrived out of order', {
      lastTimestamp: lastFrameTimestamp,
      currentTimestamp: msg.timestamp
    });
  }
  lastFrameTimestamp = msg.timestamp;
}
```

⚠️ **Assumption 3: CPU time is NOT linear**
- High device load affects frame processing unpredictably
- P90 (90th percentile) is used, not average, for a reason
- Outlier frames (garbage collection, etc.) happen
- **Verify:** If P90 looks wrong, check for outlier frames

```javascript
// In diagnostics
const durations = [5, 6, 7, 8, 8, 9, 250];  // Note the 250ms spike
const average = durations.reduce((a,b) => a+b) / durations.length;  // 41.7ms
const p90 = calculatePercentile(durations, 90);  // ~250ms (outlier)

// P90 is actually more useful for real-time systems!
```

### Performance Measurement Patterns

**Pattern 1: End-to-End Frame Timing**

```javascript
// Simplest pattern - what we currently do:
const analysisStart = performance.now();
// ... all processing ...
const analysisEnd = performance.now();
const duration = analysisEnd - analysisStart;

engine.dispatch('logFrameBenchmark', { duration });
```

**Pattern 2: Segment Timing (Advanced)**

```javascript
// Breaking down where time goes:
const times = {
  captureSent: msg.startTime,
  orchestratorReceived: performance.now(),
  specialistStart: null,
  specialistEnd: null,
  gridStart: null,
  gridEnd: null,
  dispatchTime: null
};

// Time specialist work
times.specialistStart = performance.now();
const analysis = await processWithSpecialist(msg.imageData);
times.specialistEnd = performance.now();

// Time grid work
times.gridStart = performance.now();
const cues = grid.mapFunction(analysis);
times.gridEnd = performance.now();

// Log with breakdown
const total = performance.now() - times.captureSent;
engine.dispatch('logFrameBenchmark', {
  total,
  captureToOrch: times.orchestratorReceived - times.captureSent,
  specialistTime: times.specialistEnd - times.specialistStart,
  gridTime: times.gridEnd - times.gridStart,
  dispatchTime: performance.now() - times.gridEnd
});
```

### Debugging Slow Frames

When diagnostics show 500ms+ per frame:

**Step 1: Identify the bottleneck**

```javascript
// Sample breakdown table:
┌─────────────────────┬────────┬───────────┐
│ Component           │ Time   │ Status    │
├─────────────────────┼────────┼───────────┤
│ Frame capture       │ 5ms    │ ✓ Good    │
│ Worker post delay   │ 2ms    │ ✓ Good    │
│ Specialist analysis │ 450ms  │ ✗ SLOW    │  ← Problem here!
│ Grid mapping        │ 10ms   │ ✓ Good    │
│ Audio generation    │ 20ms   │ ✓ Good    │
│ Dispatch/listeners  │ 5ms    │ ✓ Good    │
├─────────────────────┼────────┼───────────┤
│ TOTAL               │ 492ms  │ 🔴 BAD    │
└─────────────────────┴────────┴───────────┘
```

**Step 2: Measure within worker**

```javascript
// In specialist-worker.js
self.onmessage = (e) => {
  const { type, imageData, width, height } = e.data;
  
  if (type === 'processFrame') {
    const workerStart = performance.now();
    
    // Task 1: Prepare data
    const prepStart = performance.now();
    const data = new Uint8ClampedArray(imageData.data);
    const prepTime = performance.now() - prepStart;
    
    // Task 2: Analysis
    const analysisStart = performance.now();
    const regions = analyzeMotion(data, width, height);
    const analysisTime = performance.now() - analysisStart;
    
    // Task 3: Format output
    const formatStart = performance.now();
    const results = { movingRegions: regions };
    const formatTime = performance.now() - formatStart;
    
    const workerTotal = performance.now() - workerStart;
    
    // Send with timing breakdown
    self.postMessage({
      type: 'motionDetected',
      movingRegions: regions,
      timing: {
        total: workerTotal,
        prepare: prepTime,
        analysis: analysisTime,
        format: formatTime
      }
    });
  }
};
```

**Step 3: Check for specific problems**

```javascript
// Problem 1: ImageData is huge
if (width * height > 1920 * 1080) {
  structuredLog('WARN', 'Analyzing HD+ resolution', { width, height });
  // Solution: Reduce resolution in FrameProvider
}

// Problem 2: Motion detection over-threshold
if (regions.length > 50) {
  structuredLog('WARN', 'Too many motion regions', { 
    count: regions.length,
    threshold: currentThreshold
  });
  // Solution: Increase threshold or cluster regions
}

// Problem 3: Grid mapping too complex
const gridStart = performance.now();
const cues = grid.mapFunction(analysis);
const gridTime = performance.now() - gridStart;
if (gridTime > 10) {
  structuredLog('WARN', 'Grid mapping slow', { 
    gridId: grid.id,
    duration: gridTime,
    cuesGenerated: cues.length
  });
  // Solution: Optimize grid logic or limit output
}
```

### Frame Drop Scenarios

| Symptom | Likely Cause | Root Cause Check | Fix |
|---------|------------|-----------------|-----|
| Consistent 500ms+ per frame | Specialist too slow | Check worker timing breakdown | Optimize algorithm or reduce resolution |
| Occasional spikes (50ms → 1000ms) | Garbage collection | Look for heap snapshot growth | Reduce object allocation in loops |
| Frames skip sequence numbers | Worker thread blocked | Check browser DevTools performance | Move heavy work to separate worker |
| Audio context buffer underruns | Main thread stealing audio time | Check if video processing blocks audio | Use Web Worker for frame processing |
| Intermittent frame loss | Network/system load | Correlate with system CPU | Graceful degradation (skip frames) |
| Starting slow, then ok | Specialist initialization | Check worker startup | Lazy-load specialists only when needed |

### AutoFPS Feedback Loop

```javascript
// How the system adapts to performance:

class AutoFPS {
  constructor() {
    this.measurements = [];  // Rolling buffer of last 60 frames
    this.targetFPS = 20;     // Try to hit 20 FPS
    this.maxFrameTime = 1000 / this.targetFPS;  // 50ms
  }
  
  recordFrameTime(duration) {
    this.measurements.push(duration);
    if (this.measurements.length > 60) {
      this.measurements.shift();  // Keep last 60
    }
    
    // Analyze using P90 (90th percentile)
    const sorted = this.measurements.sort((a, b) => a - b);
    const p90Index = Math.floor(sorted.length * 0.9);
    const p90Duration = sorted[p90Index];
    
    // Adapt if needed
    if (p90Duration > this.maxFrameTime) {
      this.skipFrames++;  // Process fewer frames
      structuredLog('INFO', 'AutoFPS: Increasing skip rate', {
        p90Duration,
        skipFrames: this.skipFrames,
        targetFPS: 1000 / (this.maxFrameTime * (this.skipFrames + 1))
      });
    } else if (p90Duration < this.maxFrameTime * 0.5 && this.skipFrames > 0) {
      this.skipFrames--;  // Can afford more frames
      structuredLog('INFO', 'AutoFPS: Decreasing skip rate', {
        p90Duration,
        skipFrames: this.skipFrames
      });
    }
  }
}
```

---

## Performance Considerations

### The AutoFPS Feedback Loop // R61125 could we make this leanear and smarter by integrating with current data instead of adding overhead? like we do at the "DETERMINISTIC TRACDEID" research

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

## Video Capture Paths (GPU vs Canvas)

The system supports multiple video frame capture methods. Currently, two paths are being implemented; more are planned.

### Path 1: GPU-Accelerated (MediaStreamTrackProcessor) — R61125 NOT WORKING PROPERLY, "no motion, motion below threshold issues" UPDATE THIS TITLE WHEN FIXED

- **Browsers:** Chrome, Brave, Edge (modern versions only)
- **Method:** MediaStreamTrackProcessor API + OffscreenCanvas + Worker
- **Performance:** ~16-33ms latency (GPU-accelerated, hardware-optimized)
- **File:** `frame-provider-worker.js` (runs in dedicated worker, own RAF loop)
- **Frame Format:** `ImageData` via `postMessage`
- **Advantage:** Fast, smooth, hardware-accelerated
- **When Used:** Default path; tried first on all browsers

**Why GPU Path is Preferred (When Available):**
- Offloads frame extraction to specialized hardware
- Dedicated worker thread never blocks main thread
- Lowest latency for motion detection
- Scales well to high resolutions

### Path 2: CPU-Based (Canvas 2D) — R61125 NOT WORKING PROPERLY, "no motion, motion below threshold issues" UPDATE THIS TITLE WHEN FIXED

- **Browsers:** Firefox, Safari, iOS (universal, works everywhere)
- **Method:** HTMLVideoElement → `ctx.drawImage()` → `ctx.getImageData()`
- **Performance:** ~100-250ms latency (CPU-bound, main-thread blocking)
- **File:** `frame-processor.js` → `initializeVideoCanvasFallback()` (main thread RAF)
- **Frame Format:** Same `ImageData` format as GPU path
- **Advantage:** Universal compatibility, no special API requirements
- **Trade-off:** Slower due to:
  - `drawImage()` CPU cost (pixel readback from GPU memory)
  - `getImageData()` stalls main thread ~5-20ms per frame
  - Motion detection runs synchronously (not in worker)

**Why Canvas Path Exists:**
- MediaStreamTrackProcessor not available in Firefox/Safari (as of Nov 2025)
- iOS doesn't support MediaStreamTrackProcessor
- Canvas 2D is universally supported (safe fallback)
- "Fallback" terminology is misleading—it's the **only available** path on Firefox/Safari

**Note:** Canvas is NOT a workaround; it's a first-class path option on par with GPU.

### Path Selection (Automatic) // R61125 lets try to have this feature dinamic from the capability-detector.js

```javascript
// In frame-processor.js → initializeVideo()
try {
  // Try GPU path first (if MediaStreamTrackProcessor available)
  await initializeVideoGPU();  // Success → use GPU
} catch (e) {
  // Fall back to Canvas path (universal)
  await initializeVideoCanvasFallback();  // Always works
}
```

### Key Architecture: Path-Agnostic Workers

Both GPU and Canvas paths produce **identical output**:
- `ImageData` object (RGBA pixel data)
- Timing metadata (startTime, timestamp)
- Dimensions (width, height)

**Result:** Motion worker, grids, and audio pipeline are **path-agnostic**—they don't know or care which path produced the frames.

**Implication:** When adding new workers, design for ANY `ImageData` source. Don't hardcode GPU-specific optimizations.

### Timeout Adaptation Per Path

Because Canvas (CPU-bound) is ~3-4× slower than GPU:

| Path | Device Tier | Flow Timeout | Focus Timeout | Why |
|------|-------------|--------------|---------------|-----|
| GPU | Desktop | 100ms | 200ms | Fast hardware, GPU acceleration |
| GPU | Low-End | 200ms | 400ms | Slower CPU, overhead |
| Canvas | Desktop | 300ms | 600ms | 3x multiplier: CPU-bound capture |
| Canvas | Low-End | 600ms | 1200ms | 2x device + 3x path (cumulative) |

**How Adaptation Works:**
1. FrameConductor detects active path via `engine.state.videoCapture.usingCanvasFallback`
2. `performance.js` → `getWorkerTimeoutConfig()` calculates adaptive timeouts
3. Timeouts set once at initialization, reused for all frames
4. Debug logs show which timeouts are in use

See **"Worker Timeout Adaptation Strategy"** section in `future/web/utils/README.md` for full details.

### Future Paths (Planned, Not Yet Implemented)

- **WebGL Path:** Direct GPU texture access (browsers supporting WebGL 2.0)
- **WebGPU Path:** Next-gen GPU compute (Chromium + experimental)
- **Native Path:** Electron or mobile app wrapper (native video APIs)

When these are implemented, they'll follow the same pattern:
1. Produce `ImageData` (or compatible format)
2. Workers stay path-agnostic
3. Timeout adaptation extends to new path's characteristics

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
- [ ] Did you modify a worker? **Test in both Chrome and Firefox (different worker APIs and paths).**
- [ ] Did you add a Specialist? **Measure performance impact before merging.**
- [ ] Did you modify a Grid? **Test with various motion patterns.**
- [ ] Did you change the frame format? **Update ALL workers and the Orchestrator.**
- [ ] Did you add expensive computation? **Consider moving to a Specialist worker.**
- [ ] **NEW:** Testing both paths? **Run on Chrome (GPU) AND Firefox (Canvas)** to ensure path-agnostic code.
- [ ] **NEW:** Added worker? **Check timeout context** — does it respect adaptive timeouts from FrameConductor?

---

## Happy Path Testing Guide (Alpha Phase)

### Goal
Validate that core sonification works: **Motion → Grid → Audio**

### Happy Path (End-to-End)

1. Open browser with camera permission
2. Grant camera access
3. Move in front of camera
4. **Expect:** Audio plays in sync with motion
5. **Check dev-panel:** Shows FPS, motion regions, cues generated
6. Stop moving → **Expect:** Audio stops

### Testing Both Paths

| Step | Chrome/Brave | Firefox |
|------|--------------|---------|
| Start app | ✓ GPU path used | Canvas path used |
| Grant camera | ✓ | ✓ |
| Move | ✓ Audio plays | ✓ Audio plays (slower capture) |
| Check console | Look for "GPU path" logs | Look for "Canvas path" logs |
| Stop moving | ✓ Audio stops | ✓ Audio stops |
| Dev-panel | Shows FPS ~30-60 | Shows FPS ~5-15 (canvas is slower) |
| No errors | ✓ Confirm | ✓ Confirm |

**Success Criteria:** Audio output present in both browsers, timing difference expected but acceptable.

---

**Last Updated:** 6 November 2025 - Alpha Phase: Stable paths documented, WIP components tagged
