# Application State Schema

This document defines the complete shape and semantics of AcoustSee's application state. All state is managed centrally by `core/engine.js` and must remain JSON-serializable.

---

## State Overview

The application state is a single JSON object that represents all persistent and operational configuration. It is:
- **Immutable in updates**: State is never mutated directly; changes come via `dispatch(command, payload)`
- **Observable**: All changes trigger `onStateChange(listener)` callbacks
- **Serializable**: Must be JSON-encodable (no functions, Workers, DOM nodes, or Symbols)
- **Authoritative**: The single source of truth for UI rendering and decision-making

---

## Root State Object

```javascript
{
  // ==== CORE SETTINGS (User Configuration) ====
  debugLogging: boolean,
  gridType: string | null,
  synthesisEngine: string,
  language: string,
  currentMode: 'flow' | 'focus',
  depthPath: 'pseudo' | 'cnn',
  enableDualModeDetection: boolean,  // See: ADR-dual-mode-detection, v0.10.0 migration
  enableSemanticDetection: boolean,
  motionThreshold: number,
  maxNotes: number,

  // ==== MEDIA & STREAMING ====
  stream: null | 'active',              // null or indicator string (not actual stream)
  micStream: null | 'active',
  isProcessing: boolean,

  // ==== ORCHESTRATION STATE (Real-Time Metrics) ====
  orchestration: {
    activeExtractor: string | null,
    capabilities: {
      mediaStreamTrackProcessor: boolean,
      canvas2D: boolean,
      webGL: boolean,
      webGPU: boolean,
      offscreenCanvas: boolean,
      wasm: boolean
    },
    metrics: {
      fps: number,
      frameExtractionTimeMs: number,
      gridMappingTimeMs: number,
      audioProcessingTimeMs: number,
      totalCycleTimeMs: number,
      gpuUtilization: number,
      cpuUtilization: number,
      memoryUsageMB: number,
      resolutionWidth: number,
      resolutionHeight: number,
      underutilization: number
    },
    decisionLog: Array<{
      event: string,
      reason?: string,
      timestamp: number
    }>,
    currentMode: string
  },

  // ==== CONFIGURATION & DISCOVERY ====
  availableGrids: Array<{
    id: string,
    meta: {
      id: string,
      name: string,
      description: string
    }
  }>,
  availableEngines: Array<{
    id: string,
    meta: {
      id: string,
      name: string,
      author: string,
      description: string,
      version: string,
      maxNotes: number
    }
  }>,
  availableLanguages: Array<{
    id: string
  }>,

  // ==== PERFORMANCE & OPTIMIZATION ====
  updateInterval: number,               // ms between updates
  autoFPS: boolean,
  autoFpsDownscale: number,              // 0.0-1.0 scale factor
  autoFpsSamples: number,
  autoFpsBenchmark: {
    lastIntervalMs: number | null,
    measuredAt: number | null,
    sampleCount: number,
    safetyFactor: number
  },
  enableFrameWorker: boolean,
  workerTransferEnabled: boolean,
  includeProcessFrameLogs: boolean,

  // ==== INGEST & ANALYTICS ====
  ingestEnabled: boolean,
  ingestPreferences: {
    useIdleCallback: boolean,
    maxEventsPerSecond: number,
    enableOnLowPerformance: boolean,
    enableOnMobile: boolean,
    performanceThresholds: {
      lowCpuCores: number,
      lowMemoryGB: number,
      slowConnectionTypes: string[],
      mobileOptimization: boolean
    }
  },
  ingestCategories: {
    user_workflow: string[],
    performance_critical: string[],
    auto_optimization: string[],
    performance_settings: string[]
  },

  // ==== UI & UX ====
  dayNightMode: 'day' | 'night',
  isSettingsMode: boolean,
  settings: {
    categories: string[],
    currentCategoryIndex: number
  },

  // ==== AUDIO CONTROL ====
  audioTimerId: null | number,
  audioResumeAttempts: number,
  audioResumeDelayMs: number,
  ttsEnabled: boolean,

  // ==== BUILD INFO ====
  buildInfo: {
    version: string,
    audio_version: string,
    video_version: string,
    ui_version: string,
    languages_version: string,
    utils_version: string
  },

  // ==== SESSION STATE ====
  resetStateOnError: boolean,
  videoSize: {
    width: number,
    height: number
  }
}
```

---

## State Sections & Semantics

### 1. Core Settings

**Scope**: User-configurable preferences that persist across sessions

```javascript
{
  debugLogging: true,              // Enable verbose console output
  gridType: 'linear-pitch',        // Active grid ('linear-pitch', 'circle-of-fifths', 'hex-tonnetz', or null)
  synthesisEngine: 'fm-synthesis', // Active synth engine
  language: 'en-US',               // UI language
  currentMode: 'flow',             // Operating mode ('flow' for navigation, 'focus' for identification)
  depthPath: 'pseudo',             // Depth estimation method ('pseudo' for Sobel, 'cnn' for ML model)
  enableDualModeDetection: false,  // Dual-paradigm mode (v0.10.0 will enable by default, see ADR)
  enableSemanticDetection: false,  // Use semantic object detection (experimental)
  motionThreshold: 20,             // Motion sensitivity (0-100, higher = less sensitive)
  maxNotes: 24                     // Maximum polyphonic voices
}
```

**Lifecycle**: Set on app boot from config, updated via `setGridType`, `setSynthEngine`, etc.

---

### 2. Media & Streaming

**Scope**: Camera and microphone stream state

```javascript
{
  stream: null,              // null = no stream, non-null string = stream active
  micStream: null,           // null = mic disabled, non-null string = recording
  isProcessing: boolean      // true = video processing active
}
```

**Why not actual streams?**: The state must be JSON-serializable. Streams are managed separately in `media-commands.js`.

---

### 3. Orchestration State (Real-Time Metrics)

**Scope**: Performance metrics, capabilities, and runtime decisions (refreshed continuously)

```javascript
{
  orchestration: {
    activeExtractor: 'canvasFallback',  // Which frame extraction is active
    capabilities: {
      mediaStreamTrackProcessor: false,  // GPU frame extraction available?
      canvas2D: true,                    // Canvas 2D available?
      webGL: true,
      webGPU: false,
      offscreenCanvas: true,
      wasm: false
    },
    metrics: {
      fps: 29.5,                         // Current frame rate
      frameExtractionTimeMs: 12.3,       // Time to extract frame
      gridMappingTimeMs: 5.7,            // Time to map motion to grid
      audioProcessingTimeMs: 2.1,        // Time to synthesize audio
      totalCycleTimeMs: 20.1,            // Total pipeline time (frame to audio)
      gpuUtilization: 45.0,              // GPU load %
      cpuUtilization: 60.0,              // CPU load %
      memoryUsageMB: 82.5,               // Current memory
      resolutionWidth: 640,
      resolutionHeight: 480,
      underutilization: 15.0             // Spare capacity %
    },
    decisionLog: [
      {
        event: 'Switched to flow mode',
        reason: 'User selection',
        timestamp: 1761133115000
      }
    ],
    currentMode: 'flow'
  }
}
```

**Updates**: Refreshed every `updateInterval` ms by metrics collector

---

### 4. Configuration & Discovery

**Scope**: Available grids, synth engines, and languages

```javascript
{
  availableGrids: [
    {
      id: 'linear-pitch',
      meta: {
        id: 'linear-pitch',
        name: 'Linear Pitch',
        description: 'Maps vertical position to pitch'
      }
    },
    // ... more grids ...
  ],
  availableEngines: [
    {
      id: 'fm-synthesis',
      meta: {
        id: 'fm-synthesis',
        name: 'FM Synthesis',
        author: 'acoustsee',
        description: 'Simple FM synthesis engine...',
        version: '0.1.0',
        maxNotes: 24
      }
    },
    // ... more engines ...
  ],
  availableLanguages: [
    { id: 'en-US' },
    { id: 'es-ES' }
  ]
}
```

**Lifecycle**: Loaded at boot from `web/grids/`, `web/audio/synths/`, and `web/languages/`

---

### 5. Performance & Optimization

**Scope**: Tuning parameters for adaptive performance

```javascript
{
  updateInterval: 166,                    // ms between metric refreshes (~6Hz for 60fps baseline)
  autoFPS: false,                         // Enable adaptive FPS scaling
  autoFpsDownscale: 0.25,                 // Scale factor when downscaling
  autoFpsSamples: 2,                      // Number of samples for auto-detect
  autoFpsBenchmark: {
    lastIntervalMs: 33.2,                 // Last measured frame time
    measuredAt: 1761133115000,
    sampleCount: 45,
    safetyFactor: 0.7                     // 70% headroom before scaling
  },
  enableFrameWorker: true,                // Use dedicated frame extraction worker
  workerTransferEnabled: false,           // Use Transferable objects for postMessage
  includeProcessFrameLogs: false          // Log every frame (verbose!)
}
```

---

### 6. Ingest & Analytics

**Scope**: Event reporting and performance optimization rules

```javascript
{
  ingestEnabled: true,
  ingestPreferences: {
    useIdleCallback: true,                // Send events during requestIdleCallback
    maxEventsPerSecond: 10,               // Rate limit
    enableOnLowPerformance: true,         // Continue reporting on slow systems
    enableOnMobile: true,
    performanceThresholds: {
      lowCpuCores: 2,                     // System is "low performance" if < 2 cores
      lowMemoryGB: 2,                     // System is "low performance" if < 2GB
      slowConnectionTypes: ['slow-2g', '2g'],
      mobileOptimization: true
    }
  },
  ingestCategories: {
    user_workflow: ['startProcessing', 'stopProcessing', 'toggleProcessing', 'setMode'],
    performance_critical: ['audioCuesReady', 'setFrameProviderThrottle', 'logFrameBenchmark'],
    auto_optimization: ['setFrameInterval', 'diagnosticTick'],
    performance_settings: ['setMaxNotes', 'setMotionThreshold', 'setAutoFPS']
  }
}
```

---

### 7. UI & UX

**Scope**: User interface state

```javascript
{
  dayNightMode: 'day',                   // Light or dark UI theme
  isSettingsMode: boolean,               // Settings panel open?
  settings: {
    categories: ['grid', 'synth', 'language', 'maxNotes', 'motionThreshold'],
    currentCategoryIndex: 0               // Active settings tab
  }
}
```

---

### 8. Audio Control

**Scope**: Web Audio API state

```javascript
{
  audioTimerId: null,                    // Scheduled audio resume (null if not scheduled)
  audioResumeAttempts: 2,                // Retries before giving up
  audioResumeDelayMs: 100,               // Delay between retries
  ttsEnabled: false                      // Text-to-speech for announcements (future)
}
```

---

### 9. Build Info

**Scope**: Version tracking for diagnostics

```javascript
{
  buildInfo: {
    version: '0.9.4-flowOrchestration',
    audio_version: '0.8.3-BPM',
    video_version: '0.8.3-flowOrchestration',
    ui_version: '0.7.0-touchPad',
    languages_version: '0.2-spaEng',
    utils_version: '0.9.6-hotPathDEBUG'
  }
}
```

---

### 10. Session State

**Scope**: Volatile runtime state

```javascript
{
  resetStateOnError: true,               // Automatically reset on unrecoverable error
  videoSize: {
    width: 640,
    height: 480
  }
}
```

---

## State Update Patterns

### Pattern 1: Simple Value Update

```javascript
// In command handler:
engine.setState({
  ...currentState,
  synthesisEngine: payload.engineId,
  audioTimerId: null  // Clear timer
});
```

### Pattern 2: Nested Object Update (e.g., metrics)

```javascript
// In metrics collector:
const currentOrch = currentState.orchestration || {};
engine.setState({
  ...currentState,
  orchestration: {
    ...currentOrch,
    metrics: {
      ...currentOrch.metrics,
      fps: newFps,
      frameExtractionTimeMs: newTime
    }
  }
});
```

### Pattern 3: Array Update (e.g., decision log)

```javascript
// Keep only last 10 events
const newLog = currentOrch.decisionLog.slice(-9);
newLog.push({
  event: 'Switched to focus mode',
  reason: 'User selection',
  timestamp: Date.now()
});

engine.setState({
  ...currentState,
  orchestration: {
    ...currentOrch,
    decisionLog: newLog
  }
});
```

---

## Immutability Rules

**NEVER**:
```javascript
❌ state.metrics.fps = 30;           // Direct mutation
❌ state.availableEngines.push(new); // Array mutation
❌ delete state.someKey;              // Property deletion
```

**ALWAYS**:
```javascript
✅ { ...state, synthesisEngine: 'new' }                    // Top-level copy
✅ { ...state, orchestration: { ...state.orchestration, ... } } // Nested copy
✅ const newArr = [...state.availableGrids, newGrid];       // Array spread
```

---

## Testing State Schema

### Validate Serializable

```javascript
const state = engine.getState();
const json = JSON.stringify(state); // Must not throw
const parsed = JSON.parse(json);    // Round-trip should work
console.assert(
  JSON.stringify(state) === JSON.stringify(parsed),
  'State must be JSON-serializable'
);
```

### Check for Forbidden Types

```javascript
function checkSerializable(obj, path = 'root') {
  for (const [key, value] of Object.entries(obj)) {
    if (value === null || value === undefined) continue;
    if (typeof value === 'function') throw new Error(`Function at ${path}.${key}`);
    if (value instanceof Worker) throw new Error(`Worker at ${path}.${key}`);
    if (value instanceof MediaStream) throw new Error(`MediaStream at ${path}.${key}`);
    if (typeof value === 'object') {
      checkSerializable(value, `${path}.${key}`);
    }
  }
}
checkSerializable(engine.getState());
```

---

## State Export Format

When exporting state (e.g., to file):

```json
{
  "exported_at": "2025-10-22T11:40:00.000Z",
  "app_version": "0.9.4-flowOrchestration",
  "state_version": 1,
  "state": {
    "debugLogging": true,
    "gridType": "linear-pitch",
    ...
  }
}
```

---

## Changelog / Schema Versions

When modifying state structure:

1. Increment `state_version` in export
2. Add migration function:
   ```javascript
   function migrateState(old, fromVersion) {
     if (fromVersion < 2) {
       // v1 → v2 migration
       old.newField = old.oldField ? processOldField(old.oldField) : null;
       delete old.oldField;
     }
     return old;
   }
   ```
3. Update this document
4. Add entry to `TASKS.md` under state schema changes

---

## Questions?

- Check `core/engine.js` for state initialization
- Review `commands/*.js` for state update patterns
- See `ARCHITECTURE.md` section 3 for core design
- File an issue if schema question arises
