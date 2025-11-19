## Audio Pipeline Dependency

**Video processing is blocked until the audio system is ready.** FrameConductor and grid mapping will not dispatch cues until `engine.audioApi` is available and exposes `playCues`. This ensures accessibility and prevents silent failures.

**Unlock Ceremony:**
- At startup, `AudioManager` creates the `AudioContext` (suspended).
- Power-on resumes context and runs `initializeAudio()`.
- Only after synthesis init is `engine.audioApi` assigned and video-to-audio mapping enabled.
## Worker Chain Filtering (Debug Only)

Dev panel exposes worker chain filtering for diagnostics. Example:
```js
chain = manifest.filter(w => debugConfig[w.name] !== false);
```
This is for debug use only, not production fallback.
# Motion-to-Sound Pipeline Documentation

**Purpose:** Complete reference for how visual motion becomes audio in AcoustSee

**Last Updated:** November 14, 2025  
**Phase:** 3.1b (FrameConductor integrated, AudioRouter planned)  
**Related:** `audio/README.md`, `video/README.md`, `ARCHITECTURE_RULES.md`, `docs/adr/0006-video-to-audio-restructure.md`

**Status:**
- ✅ Phase 3.1a-b: FrameConductor-based worker orchestration (COMPLETE)
- ⏳ Phase 3.2: AudioRouter capability-aware routing (PLANNED)
- ⏳ Phase 2A-D: Orchestration visibility & quality profiles (PLANNED) R141125 HIGH PRIORITY

---

## 🎯 Overview: The Complete Pipeline

AcoustSee transforms camera motion into sound through a **4-stage pipeline** orchestrated by **FrameConductor** (Phase 3.1b):

```
┌─────────────┐    ┌──────────────────┐    ┌─────────────┐    ┌──────────────┐
│   Camera    │───▶│ FrameConductor   │───▶│    Grid     │───▶│    Audio     │
│   Frames    │    │  + Motion Worker │    │   Mapping   │    │  Synthesis   │
└─────────────┘    └──────────────────┘    └─────────────┘    └──────────────┘
  (RGB pixels)      (manifest-driven)       (pitch,volume)      (sound waves)
     640×480         0-64 regions            0-12 notes         Web Audio API
                    ✅ Phase 3.1b
```

**Key Principles:**
- **Manifest-driven orchestration**: FrameConductor reads `worker-manifest.js` to determine worker chains per mode
- **Consistent normalization**: Each stage has well-defined inputs/outputs (0-255 → 0-1 → Web Audio) R1411125 we wee need two steps prior the Web Audio? 
- **Capability-based routing**: Workers declare capabilities; AudioRouter (Phase 3.2) will route based on them

**Current Implementation (Phase 3.1b):**
- ✅ FrameConductor manages worker lifecycle (start, stop, hot-swap)
- ✅ Motion detection → Grid mapping → Audio cues (Flow mode)
- ✅ Intensity normalization fixed (magnitude × 255, grids /255)
- ⏳ AudioRouter not yet implemented (manual synth selection)
- ⏳ Capability-aware routing planned (Phase 3.2)

---

## 📊 Stage 1: Motion Detection

**Location:** `future/web/video/workers/fast-motion-worker.js`

**Algorithm:** Lucas-Kanade optical flow (gradient-based motion estimation)

### Input

- **Current frame:** Y-plane (luminance) `Uint8Array` of size `width × height`
- **Previous frame:** Stored internally for frame-to-frame comparison

**Parameters (Currently Hardcoded):**

| Parameter | Current | Planned | Status |
|-----------|---------|---------|--------|
| `step` | 6 pixels | User-configurable (Phase 2C) | Grid sampling interval (default: 6 pixels) Consider renaming to `samplingStep` in Phase 3.2+ |
| `threshold` | 20 (5-50) | Quality profile presets (Phase 2C) | Hardcoded |
| `maxRegions` | 64 | Adaptive based on device (Phase 2C) | Hardcoded |
| `windowSize` | 5 pixels | Quality profile presets (Phase 2C) | Hardcoded |

**⚠️ Current Limitation:** These parameters are not exposed to users. **Phase 2C (Quality Profiles)** will add:
- Dev panel GUI controls for real-time tuning
- Presets: "Subtle Motion", "Normal", "Large Motion"
- **Capability-aware defaults** (CPU cores, memory, GPU availability)
  - Uses polymorphic orchestration: detects device capabilities, not device type
  - See ADR 0007 for capability detection strategy // R141125 we could improve/update /workspaces/acoustsee/future/web/core/capability-detector.js for this task


### Processing

1. **Spatial derivatives** (Sobel-like convolution):
   ```javascript
   Ix = ∂I/∂x  // Horizontal gradient
   Iy = ∂I/∂y  // Vertical gradient
   It = I(t) - I(t-1)  // Temporal gradient
   ```

2. **Structure tensor** (per pixel neighborhood):
   ```javascript
   ATA = [[A11, A12],  where A11 = Σ(Ix²)
          [A12, A22]]        A12 = Σ(Ix·Iy)
                             A22 = Σ(Iy²)
   ```

3. **Optical flow solution** (2×2 matrix inversion):
   ```javascript
   [u] = ATA⁻¹ · [-Σ(Ix·It)]
   [v]           [-Σ(Iy·It)]
   ```
   - `u`: Horizontal velocity (pixels/frame)
   - `v`: Vertical velocity (pixels/frame)

4. **Magnitude calculation**:
   ```javascript
   magnitude = √(u² + v²)  // Euclidean distance
   // Typical range: 0.01-1.0 px/frame for normal motion
   //                1.0-5.0 px/frame for fast motion
   ```

5. **Intensity normalization**:
   ```javascript
   intensity = min(255, floor(magnitude × 255))
   // Maps optical flow magnitude to uint8 range:
   //   0.0 px/frame → 0 (no motion)
   //   1.0 px/frame → 255 (full intensity)
   //   >1.0 px/frame → clipped to 255
   ```

### Output

**Type:** `{ coords, intens, uFlow, vFlow, count }`

```javascript
{
  coords: Uint16Array,   // [x1,y1, x2,y2, ...] pixel coordinates
  intens: Uint8Array,    // [i1, i2, ...] motion intensity (0-255)
  uFlow: Float32Array,   // [u1, u2, ...] horizontal flow (px/frame)
  vFlow: Float32Array,   // [v1, v2, ...] vertical flow (px/frame)
  count: number          // Actual regions detected (≤ maxRegions)
}
```

**Data Contract:**
- `coords`: Pixel coordinates, range `[0, width)` × `[0, height)`
- `intens`: **Normalized to 0-255** (uint8), represents motion magnitude
- `uFlow`, `vFlow`: Raw velocities in pixels/frame (can be negative)
- `count`: Number of valid regions (arrays contain `count` valid entries)

### Tuning Parameters

| Parameter | Default | Range | Effect on Sound |
|-----------|---------|-------|-----------------|
| `step` | 6 | 2-16 | Smaller = more regions = more notes (denser sound) |
| `threshold` | 20 | 5-50 | Lower = detects subtle motion (quieter sounds audible) |
| `maxRegions` | 64 | 8-128 | Caps simultaneous notes (prevents audio overload) |
| `windowSize` | 5 | 3-9 | Larger = smoother flow estimates (less jittery) |

**Example Motion Profiles:** R141125 why dont we have the needed headroom in place rather than allowing clipping?

| Motion Type | magnitude | intensity | Notes |
|-------------|-----------|-----------|-------|
| Static (no motion) | 0.0 | 0 | Silent |
| Subtle hand wave | 0.3 | 76 | Quiet note |
| Normal gesture | 1.0 | 255 | Full volume |
| Fast arm swing | 3.0 | 255 (clipped) | Full volume |

---

## 🎼 Stage 1.5: FrameConductor Orchestration (NEW - Phase 3.1b)

**Location:** `future/web/video/frame-conductor.js`

**Purpose:** Manifest-driven worker lifecycle management and message routing

### What It Does

```javascript
// FrameConductor reads worker-manifest.js:
const FLOW_MODE_CHAIN = [
  { worker: 'fast-motion-worker.js', capabilities: ['motion_vectors'] },
  { worker: 'grid-aggregator-worker.js', capabilities: ['spatial_aggregation'] },
  { worker: 'pan-intensity-worker.js', capabilities: ['stereo_positioning'] }
];

// Automatically:
// 1. Loads workers based on mode (flow/focus/hybrid)
// 2. Validates messages using WorkerContract
// 3. Routes results through chain
// 4. Hot-swaps workers on mode change
```

### Key Benefits (Phase 3.1b)

- ✅ **Eliminates 290 lines of hardcoded chain logic** from frame-processor.js
- ✅ **Manifest-driven**: Add new workers by updating manifest (5 lines vs 50+ code changes)
- ✅ **Mode-aware hot-swapping**: Clean worker shutdown/restart on mode change
- ✅ **Centralized error handling**: All worker failures logged consistently

### Current Limitations

- ⏳ **AudioRouter not integrated**: Still uses hardcoded `audioCuesReady` dispatch (Phase 3.2)
- ⏳ **No capability-based routing**: Workers declare capabilities but routing is manual (Phase 3.2)
- ⏳ **No performance metrics exposed**: Timing data collected but not in dev panel (Phase 2A)

**See:** `docs/adr/0006-video-to-audio-restructure.md` for full Phase 3 roadmap

---

## 📐 Stage 2: Grid Mapping (Spatial→Musical)

**Location:** `future/web/video/grids/*.js`

**Purpose:** Convert pixel coordinates and motion intensity to musical parameters

**Orchestration:** Managed by FrameConductor (Phase 3.1b)

### Input

**Type:** Array of motion regions from Stage 1

```javascript
movingRegions = [
  { x: 320, y: 240, intensity: 150 },  // uint8 (0-255)
  { x: 100, y: 400, intensity: 200 },
  ...
]
```

### Grid Types

#### 1. Linear Pitch Grid (`linear-pitch.js`)

**Mapping:** Vertical position → pitch (simple linear relationship)

```javascript
pitch = 200 + (1 - (y / height)) × 800  // Hz
// Top of screen (y=0) → 1000 Hz (high)
// Bottom (y=height) → 200 Hz (low)
```

**Use case:** Intuitive spatial sonification (high objects = high pitch)

#### 2. Hex-Tonnetz Grid (`hex-tonnetz.js`)

**Mapping:** 2D position → harmonic relationships (music theory grid)

```javascript
// Screen divided into hexagonal cells
// Each cell = musical interval (major 3rd, perfect 5th, etc.)
// Neighboring cells form consonant harmonies
const hexCell = getHexCell(x, y, hexRadius);
const midiNote = hexToMidiNote(hexCell);
const pitch = 440 × 2^((midiNote - 69) / 12);  // MIDI to Hz
```

**Use case:** Harmonic motion (moving objects create chord progressions)

#### 3. Circle of Fifths Grid (`circle-of-fifths.js`)

**Mapping:** Angle around center → musical intervals

```javascript
const angle = atan2(y - centerY, x - centerX);  // -π to π
const bin = floor((angle + π) / (2π) × 12) % 12;  // 0-11
const scale = [0,7,2,9,4,11,6,1,8,3,10,5];  // Circle of fifths
const midiNote = 60 + scale[bin];
const pitch = midiToHz(midiNote);
```

**Use case:** Musical motion (circular gestures = key changes)

### Output

**Type:** Array of audio cues

```javascript
{
  cues: [
    {
      objectType: 'default_motion',  // Used to select synth/sound profile
      pitch: 440.0,                   // Frequency in Hz
      intensity: 0.588,               // Volume (0-1) - NORMALIZED FROM 0-255
      position: {
        x: 0.25,    // Stereo pan [-1, 1] (left to right)
        y: 0.0,     // Reserved for future use
        z: 0.0      // Reserved for distance/depth
      }
    },
    ...
  ]
}
```

**Data Contract:**
- `pitch`: Frequency in Hz (typically 20-20000, practical: 100-2000)
- `intensity`: **Normalized to 0-1** (float), maps to audio gain
  - **Fixed:** Now properly divides by 255 (not 100)
  - `intensity = min(1.0, motionIntensity / 255)`
- `position.x`: Stereo panning, -1 (left) to +1 (right)
- `position.y`, `position.z`: Reserved for future 3D audio

### Intensity Normalization Fix

**Before (Bug):**
```javascript
intensity: Math.min(1.0, intensity / 100)  // WRONG
// Result: intensity=255 → 2.55 (clipped to 1.0) - OK for loud motion
//         intensity=50  → 0.5  - OK
//         intensity=25  → 0.25 - Too quiet
//         intensity=10  → 0.1  - Nearly silent (should be ~4% volume)
```

**After (Fixed):**
```javascript
intensity: Math.min(1.0, intensity / 255)  // CORRECT
// Result: intensity=255 → 1.0   (full volume)
//         intensity=128 → 0.502 (half volume)
//         intensity=50  → 0.196 (20% volume)
//         intensity=10  → 0.039 (4% volume)
```

---

## 🎵 Stage 3: Sound Profile Selection

**Current Location:** `future/web/audio/sound-profiles.js` (manual selection)  
**Planned Location:** `future/web/audio/audio-router.js` (Phase 3.2 - capability-aware routing) R141125 this approach need documenting

**Purpose:** Map object types to synth engines and default parameters

**Current Implementation (Phase 3.1b):**
- ✅ Manual synth selection via `setSelectedSynthEngine()`
- ✅ Sound profiles define synth + parameters per object type
- ❌ No automatic routing based on worker capabilities
- ❌ No mode-aware audio parameter adjustments

**Planned Enhancement (Phase 3.2 - AudioRouter):**
```javascript
// Instead of manual selection:
engine.dispatch('audioCuesReady', cues);  // Goes to default synth

// AudioRouter will automatically route based on worker capabilities:
class AudioRouter {
  constructor(engine, audioProcessor) {
    // Listen for worker results, not hardcoded 'audioCuesReady' R141125 dont we need to update the contract? 
    engine.onCommand('workerResult', this._routeByCapability.bind(this));
  }
  
  _routeByCapability(result) {
    const { workerCapabilities, data, mode } = result;
    
    // Route based on declared worker capabilities
    if (workerCapabilities.includes('semantic_detection')) {
      // Use object-specific synths
      data.cues.forEach(cue => {
        if (cue.objectType === 'wall') cue.synth = 'sawtooth-pad';
        if (cue.objectType === 'person') cue.synth = 'karplus-strong';
      });
    }
    
    if (workerCapabilities.includes('depth_map')) {
      // Apply 3D spatialization
      data.cues.forEach(cue => {
        cue.position.z = depthToDistance(cue.depth); // 0-10 meters
      });
    }
    
    // Mode-aware parameter adjustment
    if (mode === 'focus') {
      data.cues.forEach(cue => {
        cue.duration *= 2;  // Longer notes in focus mode
        cue.reverb = 0.3;   // Add reverb
      });
    }
    
    this.audioProcessor.playCues(data.cues);
  }
}
// See ADR 0008 for complete composable parameter architecture
```

### Input

**Type:** Array of cues from Stage 2 (output of grid mapping)

```javascript
cues = [
  {
    objectType: 'default_motion', 
    pitch: 440,
    intensity: 0.6,
    position: { x: 0, y: 0, z: 0 }
  },
  {
    objectType: 'default_motion',
    pitch: 523,
    intensity: 0.8,
    position: { x: 0.5, y: 0, z: 0 }
  }
  // ... up to maxNotes cues (default: 12)
]
// Note: "Play Single Note" in dev panel bypasses this and calls synths directly
```

### Manifest 

**Current Structure (Phase 3.1b - Hardcoded per Synth):**

```javascript
soundProfileManifest = {
  'default_motion': {
    playFunction: playSineWave,  // Which synth to use
    params: {
      duration: 0.2,    // Note length (seconds)
      attack: 0.01,     // ADSR: Attack time
      release: 0.1      // ADSR: Release time (decay/sustain not yet exposed)
    }
  },
  'wall': {
    playFunction: playSawtoothPad,
    params: {
      duration: 0.5,
      attack: 0.05,
      release: 0.2,
      filterCutoff: 1200  // ⚠️ Synth-specific (should be global, see below)
    }
  }
}
```

**Proposed Architecture (Phase 3.3 - Composable Parameters):**

```javascript
    soundProfileManifest = {
      'wall': {
        playFunction: playSawtoothPad,
        envelope: {
          attack: 0.05,   // Full ADSR support
          decay: 0.1,
          sustain: 0.7,
          release: 0.2
        },
        filters: [
          { type: 'lowpass', frequency: 1200, Q: 1.0 }  // Global, not synth-specific
        ],
        // Video→Audio parameter mappings (Phase 3.3)
        mappings: {
          'depth → filters[0].frequency': (depth) => 500 + depth * 200,      // Closer = brighter
          'uFlow → envelope.attack': (uFlow) => Math.abs(uFlow) * 0.01,      // Faster = sharper
          'intensity → filters[0].Q': (intensity) => 0.5 + intensity * 2     // Louder = resonant
        }
      }
    }
    // This enables:
    // - Dev panel exposes all ADSR parameters
    // - Filters are global, reusable across synths
    // - Live mapping editor: "Map depth to filter cutoff"
    // - Preset system: "Doppler effect" applies velocity → pitch
    // See ADR 0008 for complete design
  
```

### Output

**Type:** Note parameters for audio synthesis

```javascript
{
  ...profile.params,         // Base synth parameters
  pitch: cue.pitch,          // From grid (Hz)
  intensity: cue.intensity,  // From grid (0-1)
  position: cue.position,    // From grid (stereo pan)
  playFunction: playSineWave // Which synth to invoke
}
```

---

## 🔊 Stage 4: Audio Synthesis

**Location:** `future/web/audio/synths/*.js`

**Purpose:** Generate actual sound using Web Audio API

### Input

Array of notes for a specific synth:
```javascript
notes = [
  {
    pitch: 440,        // Hz
    intensity: 0.6,    // 0-1
    position: { x: 0.5, y: 0, z: 0 },
    duration: 0.2,     // seconds
    attack: 0.01,      // seconds
    release: 0.1       // seconds
  },
  ...
]
```

### Processing (Example: Sine Wave Synth)

```javascript
export function playSineWave(notes, ctx) {
  const { audioContext, getOscillator, masterGain } = ctx;
  const now = audioContext.currentTime;
  
  notes.forEach(note => {
    // 1. Get oscillator from pool
    const { osc, gain, panner } = getOscillator();
    
    // 2. Configure frequency
    osc.type = 'sine';
    osc.frequency.value = note.pitch;  // Hz from grid
    
    // 3. Apply envelope (ADSR)
    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(note.intensity, now + note.attack);
    gain.gain.linearRampToValueAtTime(0, now + note.duration);
    
    // 4. Apply stereo panning
    panner.pan.value = note.position.x;  // -1 (left) to +1 (right)
    
    // 5. Connect audio graph
    osc.connect(gain).connect(panner).connect(masterGain);
    
    // 6. Schedule start/stop
    osc.start(now);
    osc.stop(now + note.duration + note.release);
  });
}
```

### Available Synths 
// R131125 review the synths becouse the filenames are incorrect

| Synth | File | Timbre | Use Case |
|-------|------|--------|----------|
| Sine Wave | `sine-wave.js` | Pure tone | Simple motion |
| Sawtooth Pad | `sawtooth-pad.js` | Rich harmonic | Walls/obstacles |
| Karplus-Strong | `karplus-strong.js` | Plucked string | Impacts/collisions |
| FM Bell | `fm-bell.js` | Metallic bell | Highlights |

### Output

**Type:** Web Audio API nodes connected to `masterGain`

**Audio characteristics:**
- **Frequency:** From `note.pitch` (Hz)
- **Amplitude:** From `note.intensity × gainScale` (0-1 in Web Audio)
- **Stereo position:** From `note.position.x` via StereoPanner
- **Duration:** From `note.duration` + `note.release`

---

## 🔄 Complete Data Flow Example

### Scenario: User waves hand (right side of screen, moderate speed)

We need to document the "Stage 0"  and that would be where the frame provider takes place. Also expose e.g. resolution and fps settings to the developer panel for user customization 

#### Stage 1: Motion Detection
```javascript
// Input: Camera frame (640×480 pixels)
// Optical flow detects hand motion: u=1.2, v=0.3 px/frame

// Output:
{
  coords: [480, 240],           // x=480 (right side), y=240 (center)
  intens: [255],                // magnitude=1.23 → 1.23×255 = 313 → clipped to 255
  uFlow: [1.2],                 // Moving right at 1.2 px/frame
  vFlow: [0.3],                 // Moving down slightly
  count: 1
}
```

#### Stage 2: Grid Mapping (Linear Pitch)

R141125 It seems that we might have hardcoded the resolution, instead it should be dynamic from the frame provider

```javascript
// Input: region = { x: 480, y: 240, intensity: 255 }

// Pitch calculation:
pitch = 200 + (1 - (240/480)) × 800 = 200 + 0.5 × 800 = 600 Hz

// Intensity normalization (FIXED):
intensity = min(1.0, 255/255) = 1.0

// Panning calculation:
pan = (480/640) × 2 - 1 = 0.5  // Right channel

// Output:
{
  objectType: 'default_motion',
  pitch: 600,
  intensity: 1.0,
  position: { x: 0.5, y: 0, z: 0 }
}
```

#### Stage 3: Sound Profile
```javascript
// Input: cue from Stage 2

// Select profile for 'default_motion' → sine wave
// Merge with defaults:
{
  pitch: 600,
  intensity: 1.0,
  position: { x: 0.5, y: 0, z: 0 },
  duration: 0.2,
  attack: 0.01,
  release: 0.1,
  playFunction: playSineWave
}
```

#### Stage 4: Audio Synthesis
```javascript
// Input: note from Stage 3

// Web Audio API operations:
osc.frequency.value = 600;           // 600 Hz tone
gain.gain.linearRamp(0 → 1.0, 0.01); // 10ms attack to full volume
panner.pan.value = 0.5;               // Panned right
osc.start(now);
osc.stop(now + 0.3);                  // Total: 200ms + 100ms release

// Result: 600 Hz sine wave, full volume, right channel, 300ms duration
```

**What the user hears:**
> "A clear, medium-pitched tone (600 Hz) at full volume, coming from the right speaker, lasting 0.3 seconds"

---

## 🐛 Bugs Fixed (November 13, 2025)

### Bug 1: Inconsistent Intensity Scaling

**Problem:**
```javascript
// Motion worker: outputs 0-255
intensity = magnitude × 500;  // Too aggressive, clips immediately

// Grids: normalize by wrong factor
intensity / 100;  // Should be /255
```

**Impact:**
- Subtle motion (magnitude < 0.2) produced intensity > 100, normalized to > 1.0 (clipped)
- Intense motion (magnitude > 0.5) produced intensity 255, normalized to 2.55 (clipped)
- Result: Most motion produced full volume (no dynamics)

**Fix:**
```javascript
// Motion worker: proper uint8 scaling
intensity = min(255, floor(magnitude × 255));  // 1.0 px/frame = 255

// Grids: correct normalization
intensity = min(1.0, intensity / 255);  // Uint8 to float
```

**Result:**
- Full dynamic range: subtle motion → quiet sound, intense motion → loud sound
- Linear relationship preserved through pipeline

### Bug 2: Unused Optical Flow Direction

**Problem:**
```javascript
// Motion worker calculates uFlow, vFlow but grids ignore them
const { x, y, intensity } = region;  // uFlow, vFlow not destructured
```

**Impact:**
- Direction information lost (can't distinguish left/right motion)
- Can't implement Doppler effects or approach warnings
- Reduces expressiveness of sonification

**Status:** Documented (not yet fixed - requires grid redesign)

**Future enhancement:**
```javascript
// Potential use: modulate pitch based on approach direction
const approaching = vFlow[i] > 0;  // Moving toward camera
if (approaching) {
  pitch *= 1.1;  // Slight pitch increase (Doppler effect)
}
```

---

## 🎛️ Configuration Reference

### State Structure

```javascript
state.motionDetection = {
  sensitivity: 20,        // Threshold (5-50)
  maxRegions: 64,         // Max simultaneous detections
  step: 6,                // Grid sampling (pixels)
  windowSize: 5           // Optical flow window
};

state.gridConfig = {
  type: 'linear-pitch',   // Grid algorithm
  rows: 4,                // Grid rows (for hex grids)
  cols: 4,                // Grid columns
  aggregation: 'mean'     // How to combine regions in cell
};

state.audio = {
  maxNotes: 12,           // Max simultaneous notes
  masterVolume: 0.8       // Global volume (0-1)
};
```

### Tuning Guidelines

**⚠️ Current Status:** These are **code-level guidelines only**. Users cannot adjust without editing source.

**Phase 2C (HIGH PRIORITY):** Will expose these as dev panel controls with live preview.

**For subtle motion (hand gestures):**
```javascript
sensitivity: 10   // Lower threshold
step: 4           // Denser sampling
```

**For large motion (full-body):**
```javascript
sensitivity: 30   // Higher threshold
step: 8           // Coarser sampling
maxNotes: 6       // Fewer simultaneous notes
```

**For musical expressiveness:**
```javascript
gridType: 'hex-tonnetz'  // Harmonic relationships
maxNotes: 8              // Allow chord formations
```

**For spatial awareness:**
```javascript
gridType: 'linear-pitch'  // Clear high/low mapping
step: 6                   // Moderate density
```

---

## 🔍 Debugging

**Architecture Context (Phase 3.1b):** FrameConductor orchestrates workers; check its state first.

### Problem: No sound on motion

**Check (in order):**

1. **FrameConductor initialized?**
   - Console: `frameConductor` should not be null
   - Check: `initializeVideo()` called during startup
   - **Phase 3.1b**: FrameConductor manages all workers

2. **Motion detection threshold too high?**
   - ⚠️ **Currently hardcoded** - cannot adjust without code change
   - **Phase 2C**: Will have dev panel GUI controls R141125 HIGH PRIORITY
   - Workaround: Edit `fast-motion-worker.js` line ~79, change `threshold = 20` to `10`

3. **Intensity normalization correct?**
   - **Fixed Nov 13**: Should be `/255` in all grids (was `/100`)
   - Verify: Check `linear-pitch.js` line 25, `hex-tonnetz.js` line 69, `circle-of-fifths.js` line 50

### Problem: Sound too quiet/loud

**Check:**
1. Intensity normalization correct?
   - Should be `/255` in all grids
2. Master volume set?
   - Check `state.audio.masterVolume`
3. Motion magnitude range?
   - Check optical flow values: typical 0.01-1.0 px/frame

### Problem: Jittery/unstable notes

**Check:**
1. Motion step size too small?
   - Increase `step` to 8-10
2. Optical flow window too small?
   - Increase `windowSize` to 7-9
3. Too many simultaneous notes?
   - Reduce `maxRegions` or `maxNotes`

---

## ⚠️ Anti-Pattern: Premature Verification

**Lessons from Phase 3 Development:**

We implemented verification steps **before defining "ready"**, causing:
- ❌ Tests written for features not yet implemented (AudioRouter)
- ❌ Documentation describing planned features as current
- ❌ Debugging guides assuming non-existent dev panel controls

**Definition of Ready (DoR) for Future Phases:**

**Only verify features that exist. Write tests after implementation, not before.**

**Phase 3.2 (AudioRouter) is Ready When:**
- [ ] `audio-router.js` exists and exports `AudioRouter` class
- [ ] AudioRouter listens for worker results (not hardcoded message types)
- [ ] Capability-based routing implemented (semantic_detection, depth_map, flow_vectors)
- [ ] Mode-aware audio parameters applied (flow vs focus vs hybrid)
- [ ] Integrated in `main.js` STEP 4 (after audio init)
- [ ] Unit tests pass (audio-router.test.js)
- [ ] Smoke tests updated to verify routing
- [ ] This document updated to remove "Planned" tags

**Phase 2C (Quality Profiles) is Ready When:**
- [ ] Dev panel has motion detection controls (step, threshold, maxRegions, windowSize)
- [ ] Quality presets implemented ("Subtle", "Normal", "Large Motion")
- [ ] Capability-aware defaults (CPU/memory/GPU-based, not device-type-based) from /workspaces/acoustsee/future/web/core/capability-detector.js
- [ ] State persists across page reload
- [ ] Documentation updated



---

## 📚 Related Documentation

**Architecture & Phases:**
- **Phase 3 Roadmap:** `docs/adr/0006-video-to-audio-restructure.md` - Complete Phase 3 plan
- **Phase 3.1b Status:** `docs/sessions/2025-10/W4/20251029-phase3-1b-quick-reference.md` - What's complete
- **Pipeline Proposal:** `PIPELINE_IMPROVEMENT_PROPOSAL.md` - Original Phase 3 design

**Subsystem Technical Docs:**
- **Architecture:** `future/web/README.md` - Module integration rules
- **Audio Subsystem:** `future/web/audio/README.md` - Synth architecture
- **Video Subsystem:** `future/web/video/README.md` - Frame processing (FrameConductor)
- **Performance:** `future/web/ARCHITECTURE_RULES.md` - Rules 6-7 (workers, logging)

---

**Questions or issues? Check:**
1. **Phase status:** ADR 0006 for what's implemented vs planned
2. **Pipeline overview:** This document (focuses on current implementation)
3. **Implementation details:** Subsystem READMEs
4. **Debugging patterns:** ARCHITECTURE_RULES.md
