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

2.  **`state.js` (The State Object):**
    *   **Responsibilities:**
        *   Defines the default shape of the application's entire state.
        *   This state object must be **fully JSON serializable**. It contains settings, flags, and data, but **no functions, class instances, or live browser objects** (like `MediaStream`). This "state hygiene" is critical for stability and debugging.

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
// core/state.js - The application state object
export const settings = {
  // ✅ Configuration
  updateInterval: 50,
  motionThreshold: 30,
  maxNotes: 24,
  gridType: 'hex-tonnetz',
  synthesisEngine: 'sine-wave',
  language: 'en-US',
  
  // ✅ Loaded resources (arrays/objects only)
  availableGrids: null,  // Populated at init
  
  // ✅ UI state
  isProcessing: false,
  settingsMode: false,
  
  // ✅ Performance metrics
  fps: 0,
  cpuUsage: 0,
  
  // ❌ DO NOT ADD:
  // audioContext: null,  // ❌ Live object
  // playFunction: null,  // ❌ Function
  // videoElement: null,  // ❌ DOM element
};
```

### State Initialization Sequence

The engine's state is initialized IN ORDER during `main.js`:

1. **Load settings** from `core/state.js`
2. **Merge orchestration** - MUST preserve object identity (never spread)
3. **Load async resources** - grids, capabilities, etc.
4. **Register handlers** - so commands can dispatch properly
5. **Setup listeners** - UI modules subscribe to state

**Critical:** Each step assumes the previous state object is still valid. Never create new state objects.

### Object Identity (CRITICAL)

The engine's state must be the SAME JavaScript object throughout its lifetime:

```javascript
// BROKEN (what we had):
settings = { availableGrids: null }  ← main.js holds this

engine._state = { ...settings }      ← engine has DIFFERENT object

// FIXED (what we have now):
settings = { availableGrids: null }  ← all hold SAME reference
engine._state = settings             ← same object
```

**Real Bug:** Grid Type dropdown was empty because `mergeOrchestrationState()` used spread operator, creating a new object. When `main.js` set `settings.availableGrids`, the engine didn't see it.

**Rule:** Always mutate the existing state object. Never use spread operator on state.

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