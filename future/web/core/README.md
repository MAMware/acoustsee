# Core Subsystem

This directory contains the central architectural components that form the "brain" of the AcoustSee application. It manages the application's state, orchestrates all actions via a command bus, and provides the context for all other subsystems to communicate.

## Core Architectural Pattern: A Centralized, Event-Driven Engine

The application is built around a single, headless **Engine** (`engine.js`). This engine is **not** a monolithic controller; rather, it is a lightweight coordinator that enforces a clean, one-way data flow and decouples all major subsystems.

### Key Files & Concepts

1.  **`engine.js` (The Engine):**
    *   **Responsibilities:**
        *   Holds the single, authoritative application `state` object.
        *   Provides the central `dispatch` method for queueing all actions.
        *   Manages a registry of `command handlers` that contain the actual business logic.
        *   Notifies all subsystems of state changes via the `onStateChange` listener.
    *   **Pattern:** This implements a standard **Redux-like, unidirectional data flow.**

2.  **`state.js` (State Factory):**
    *   **Responsibilities:**
        *   Exports `createInitialState()` factory function that returns a fresh state object
        *   Defines the shape and defaults of the entire application state
        *   This state object must be **fully JSON serializable**. It contains settings, flags, and data, but **no functions, class instances, or live browser objects** (like `MediaStream`). This "state hygiene" is critical for stability and debugging.
    *   **Pattern:** Uses the **Factory Pattern** to prevent state bypass. The factory ensures each state instance is created fresh and controlled by the Engine, not imported as a live object.

3.  **`commands/` (The Command Handlers):**
    *   **Responsibilities:**
        *   This directory contains all the application's business logic, organized into modular files (e.g., `media-commands.js`, `settings-commands.js`).
        *   Each file exports a `register...Commands(engine)` function, which is called at startup in `main.js`.
        *   Inside, individual command handlers are registered with the engine (e.g., `engine.registerCommandHandler('startProcessing', ...)`).
    *   **Pattern:** This is an implementation of the **Command Pattern**. It cleanly separates the "what to do" (the dispatched command) from the "how to do it" (the handler logic).

4.  **`context.js` (Dependency Injection and Legacy Bridge):**
    *   **Responsibilities:**
        *   Provides a simple mechanism for **Dependency Injection** (DI). For example, it holds a reference to the global `DOM` object.
    *   **Legacy Note:** This file contains older patterns like `getDispatchEvent()`. New code should **not** use these. Instead, the `engine` instance should be passed directly to any function that needs it during initialization.

## The Unidirectional Data Flow

Understanding this flow is the key to understanding the entire application.

1.  **Action:** The **UI** (or another subsystem) calls `engine.dispatch('someCommand', { payload })`. This is the *only* way to initiate a change in the application.

2.  **Command Handling:** The **Engine** finds the registered `command handler` for `'someCommand'` and executes it.

3.  **State Mutation:** The **Command Handler** contains the logic to perform the action. If necessary, it calls `engine.setState({ ... })` to update the application state. This is the *only* place where the state is ever modified.

4.  **Notification:** After the state is updated, the **Engine** notifies all registered listeners (via `onStateChange`) that a new state is available.

5.  **Reaction:** The **UI** and other subsystems receive the new state and re-render or react to the changes accordingly.

This clean, predictable cycle makes the application easy to debug, reason about, and extend.

## State Structure & Rules

### What CAN Be in State
✅ Primitive values: strings, numbers, booleans  
✅ JSON-serializable objects and arrays  
✅ Configuration data: settings, flags, parameters  
✅ Simple data structures from analysis: coordinates, metrics  

### What CANNOT Be in State
❌ Functions (e.g., `playFunction`, `mapFunction`)  
❌ Class instances (e.g., `AudioContext`, `Worker`)  
❌ DOM elements (e.g., `document.getElementById('video')`)  
❌ Live objects (e.g., `MediaStream`, `ImageData`)  

**Why?** State must be JSON-serializable for debugging, persistence, and logging. Live objects go in engine properties outside state.

### State Structure Template

```javascript
// core/state.js - Factory function for initial state
export function createInitialState() {
  return {
    // ✅ Configuration
    updateInterval: 50,
    motionThreshold: 30,
    maxNotes: 24,
    gridType: 'hex-tonnetz',
    synthesisEngine: 'sine-wave',
    language: 'en-US',
    
    // ✅ Loaded resources (arrays/objects only)
    availableGrids: [],  // Populated at init via engine.setState()
    
    // ✅ UI state
    isProcessing: false,
    settingsMode: false,
    
    // ✅ Performance metrics
    fps: 0,
    cpuUsage: 0,
    
    // ✅ Video capture state
    videoCapture: {
      usingCanvas: false,           // Set when Canvas path active
      detectedAt: null,             // Timestamp of path detection
      capabilities: {
        hasMediaStreamTrackProcessor: false, // GPU capability
        hasOffscreenCanvas: true,            // Canvas capability
      }
    },
    
    // ❌ DO NOT ADD:
    // audioContext: null,  // ❌ Live object
    // playFunction: null,  // ❌ Function
    // videoElement: null,  // ❌ DOM element
  };
}
```

**Why Factory Pattern?**
The factory function prevents the **state bypass anti-pattern**. Instead of exporting a live state object that any module could import and mutate directly, we provide a factory. This ensures:
- ✅ Engine controls state initialization timing
- ✅ No modules can bypass the Engine by importing state directly
- ✅ Each call to `createInitialState()` returns a fresh object (useful in tests)
- ✅ All state mutations must go through `engine.setState()` or dispatch commands

### Video Capture State Tracking (Nov 6: Alpha Phase)


**What is `videoCapture`?**

The `videoCapture` object tracks which video frame capture method is active at runtime. This enables adaptive performance tuning based on the capture path (GPU vs Canvas).

**Why Track This?**

Performance characteristics differ dramatically:
- **GPU path:** Fast frame capture (~16-33ms latency), hardware-accelerated
- **Canvas path:** Slow frame capture (~100-250ms latency), CPU-bound

Worker timeouts must adapt accordingly:
- GPU: Base timeouts (Flow=100ms, Focus=200ms) are appropriate
- Canvas: 3x multiplier needed (Flow=300ms, Focus=600ms) due to capture overhead

**State Fields:**

| Field | Type | Purpose | Set By |
|-------|------|---------|--------|
| `usingCanvas` | boolean | True when Canvas 2D path is active | `frame-processor.js` |
| `detectedAt` | timestamp | When path was detected/switched | `frame-processor.js` |
| `capabilities.hasMediaStreamTrackProcessor` | boolean | Whether GPU API available | `capability-detector.js` |
| `capabilities.hasOffscreenCanvas` | boolean | Whether Canvas API available | `capability-detector.js` |

**When Is It Populated?**

```javascript
// In frame-processor.js → initializeVideoCanvasFallback()
if (engine?.state?.videoCapture) {
  // In frame-processor.js → initializeVideoCanvasFallback()
  engine.state.videoCapture.usingCanvas = true;  // Canvas path detected
  engine.state.videoCapture.detectedAt = Date.now();
  structuredLog('DEBUG', 'Canvas path active - timeouts adapted');
}
```

**How Performance Uses It:**

```javascript
// In utils/performance.js → getWorkerTimeoutConfig(state)
if (state?.videoCapture?.usingCanvas) {
  // Canvas is CPU-bound, 3-4x slower → 3x multiplier
  const canvasMultiplier = 3;
  return {
    flowTimeout: baseTimeout.flowTimeout * canvasMultiplier,    // 300ms
    focusTimeout: baseTimeout.focusTimeout * canvasMultiplier,  // 600ms
  };
}
```

**Important:** State is **JSON-serializable**. This allows:
- Dev panel to inspect which path is active
- Session logs to record what method was used
- Developers to debug "why is it slow?" by checking state history

---

## State Initialization Sequence

The engine's state is initialized IN ORDER during `main.js`:

1. **Create engine** - Engine calls `createInitialState()` factory
2. **Merge orchestration** - MUST preserve object identity (never spread)
3. **Load async resources** - grids, capabilities, etc. via `engine.setState()`
4. **Register handlers** - so commands can dispatch properly
5. **Setup listeners** - UI modules subscribe to state

**Critical:** The engine owns the entire state lifecycle. All state mutations go through `engine.setState()` or command dispatch.

### Factory Pattern for State Creation (Nov 18: Fixed)

Engine now uses the factory pattern to prevent state bypass:

```javascript
// core/engine.js
import { createInitialState } from './state.js';

export function createEngine() {
  let state = createInitialState();  // ✅ Fresh state from factory
  
  // Initialize orchestration state on engine creation
  state = mergeOrchestrationState(state);
  
  // ... rest of engine initialization
}

// Any module that needs state:
const state = engine.getState();  // ✅ Get current state
engine.setState({ someValue: 123 });  // ✅ Mutate only through engine
```

**Why This Matters:**
- ✅ No modules can bypass the engine by importing state directly
- ✅ All state mutations go through the command system
- ✅ Testing is isolated (each test gets fresh state from factory)
- ✅ Single Source of Truth enforced architecturally

### Object Identity (CRITICAL)

The engine's state must be the SAME JavaScript object throughout its lifetime:

```javascript
// BROKEN (what we had):
export let settings = { ... }       ← live object, any module could import
engine._state = { ...settings }     ← engine creates different object

// FIXED (what we have now):
export function createInitialState() {
  return { ... }                    ← factory, only engine calls it
}
engine._state = createInitialState()  ← single object, engine owns it
```

**Real Bug:** Grid Type dropdown was empty because `mergeOrchestrationState()` used spread operator, creating a new object. When `main.js` set `settings.availableGrids`, the engine didn't see it.

**Rule:** Always mutate the existing state object. Never create a new one (via spread or factory call).

```javascript
// ❌ WRONG:
function mergeOrchestrationState(existingState) {
  return { ...existingState, orchestration: {...} };  // NEW object
}

// ✅ CORRECT:
function mergeOrchestrationState(existingState) {
  if (!existingState.orchestration) {
    existingState.orchestration = createInitialOrchestrationState();
  }
  return existingState;  // SAME object
}
```

## Command Handler Registration & Dispatch

### Registration Order (CRITICAL)

All command handlers must be registered BEFORE any dispatch calls:

```javascript
// ❌ WRONG:
engine.dispatch('updateOrchestration', { capabilities });  // Handler doesn't exist!
registerDiagnosticsCommands(engine);  // Too late

// ✅ CORRECT:
registerDiagnosticsCommands(engine);
engine.dispatch('updateOrchestration', { capabilities });  // Handler exists
```

### Handler Structure

Each command file exports a registration function:

```javascript
// commands/diagnostics-commands.js
export function registerDiagnosticsCommands(engine) {
  engine.registerCommandHandler('updateOrchestration', (payload) => {
    const state = engine.getState();
    Object.assign(state.orchestration, payload);
    engine.setState({ orchestration: state.orchestration });
  });
  
  engine.registerCommandHandler('logMetric', (payload) => {
    // Handler logic
  });
}
```

Called in `main.js`:
```javascript
registerDiagnosticsCommands(engine);
registerAudioCommands(engine);
registerVideoCommands(engine);
```

## Common Mistakes to Avoid

**Mistake 1: Spread Operator on State**
```javascript
❌ state = { ...state, newField };  // Creates new object
✅ state.newField = value;           // Mutates existing
```

**Mistake 2: Dispatch Before Handler Registered**
```javascript
❌ engine.dispatch('myCommand', data);
   registerMyHandlers(engine);

✅ registerMyHandlers(engine);
   engine.dispatch('myCommand', data);
```

**Mistake 3: Putting Functions in State**
```javascript
❌ state.playFunction = () => {...};  // Cannot serialize
✅ // Keep functions outside state
   engine._playFunction = () => {...};
```

**Mistake 4: Forgetting Object Identity**
```javascript
❌ const newState = Object.assign({}, state);  // New object
✅ Object.assign(state, updates);               // Mutate existing
```

## Further Reading

For detailed rules on state management, dependency injection, and error handling, see **`ARCHITECTURE_RULES.md`** in the parent directory.