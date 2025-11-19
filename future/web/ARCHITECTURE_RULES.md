# Rule X: Critical Subsystems Must Fail Loudly

**The Problem:**
Silent fallback or graceful degradation for core subsystems (like audio) undermines the application's accessibility and reliability. If audio is not ready, commands must fail loudly and log an ERROR. Language subsystem may degrade gracefully (returns key), but must never block audio initialization.

**Real Bug from Session:**
- Audio system was not initialized, but commands attempted to play cues, resulting in silent failures and no sound for users.
- Language fetch failures previously blocked audio initialization; now, language errors degrade gracefully and never block audio.

**Rule:**
- Audio is required. If `engine.audioApi` is missing or not ready, commands must log ERROR and fail. No silent fallback or degradation.
- Language subsystem may degrade gracefully (returns key), but must never block audio initialization.

**Example:**
```javascript
// audio-commands.js
if (!engine.audioApi) {
  structuredLog('ERROR', 'audioPlayCues FAILED: Audio system not initialized. App requires audio to function.', ...);
  return { played: false, reason: 'AUDIO_SYSTEM_NOT_READY', critical: true };
}
```
# Rule Y: No Console Hijacking

**The Problem:**
Monkey-patching console methods to route through structuredLog creates feedback loops and performance issues. All structured logs must use `structuredLog` directly.

**Real Bug from Session:**
- Console hijack caused infinite loop and 25MB log bomb.

**Rule:**
- Never override console methods. Use `structuredLog` explicitly for all logging.
# Architecture Rules - Critical for Avoiding Bugs

**Last Updated:** October 23, 2025  
**Purpose:** Central reference for architectural rules that prevent AI coding agents from introducing bugs.

---

## Rule 1: Never Create New State Objects

**The Problem:**
When you use the spread operator (`...`) to merge state, you create a NEW object. This breaks the object identity between the imported `settings` and the engine's internal state reference. Later modifications won't be visible to the engine.

**Real Bug from Session:**
- Grid Type dropdown was empty in the dev panel
- Root cause: `mergeOrchestrationState()` used spread operator
- When `main.js` set `settings.availableGrids = [...]`, the engine didn't see it (different object)
- Dev panel queried `state.availableGrids` and got `undefined`

**❌ WRONG:**
```javascript
// core/orchestration-state.js
function mergeOrchestrationState(existingState) {
  return {
    ...existingState,  // ← Creates NEW object - WRONG!
    orchestration: { ... }
  };
}

// main.js
const settings = loadSettings();
settings = mergeOrchestrationState(settings);  // settings is NOW A DIFFERENT OBJECT
settings.availableGrids = grids;  // This goes on the NEW object
engine.setState(settings);  // Engine gets it, but listeners have old reference
```

**✅ CORRECT:**
```javascript
// core/orchestration-state.js
function mergeOrchestrationState(existingState) {
  if (!existingState.orchestration) {
    existingState.orchestration = createInitialOrchestrationState();
  }
  return existingState;  // ← SAME object, just mutated
}

// main.js
const settings = loadSettings();
mergeOrchestrationState(settings);  // Mutates settings in-place
settings.availableGrids = grids;    // Goes on SAME object
engine.setState(settings);          // Engine and listeners all see same object
```

**Why This Matters:**
```javascript
// If you create a new object:
const obj1 = { x: 1 };
const obj2 = { ...obj1 };  // obj2 is new object
obj2.y = 2;                 // obj1 doesn't have y!
console.log(obj1.y);        // undefined ❌

// If you mutate:
const obj1 = { x: 1 };
obj1.y = 2;                 // Mutate directly
console.log(obj1.y);        // 2 ✅
```

**Rule:** Always mutate the existing state object. Never create a new one.

---

## Rule 2: Object Identity Preservation in State Management

**The Problem:**
JavaScript objects are compared by reference, not value. If you create a new object that looks identical, all code holding the old reference will see stale data.

**In AcoustSee:**
- `main.js` imports `settings` from `core/state.js`
- Engine receives this same `settings` object
- UI modules call `engine.getState()` and get the same object
- If ANY code creates a new state object, the others are broken

**Visual Explanation:**
```javascript
// BROKEN (what we had):
settings = { availableGrids: null }  ← main.js holds this

engine._state = { ...settings }      ← engine has DIFFERENT object

ui.subscribe(engine.getState())      ← ui gets yet another object

main.settings.availableGrids = [...]  ← only main.js sees this

// Consequence:
console.log(engine.getState().availableGrids);  // undefined ❌
console.log(ui.state.availableGrids);           // undefined ❌

// FIXED (what we have now):
settings = { availableGrids: null }  ← all hold SAME reference

engine._state = settings             ← same object

ui.subscribe(engine.getState())      ← same object

main.settings.availableGrids = [...]  ← ALL see this

// Result:
console.log(engine.getState().availableGrids);  // [...] ✅
console.log(ui.state.availableGrids);           // [...] ✅
```

**Rule:** The engine's state must be the SAME JavaScript object throughout its lifetime. Never reassign it, only mutate its properties.

---

## Rule 3: Dependency Flow - What Can Import What

**The Problem:**
Circular imports and direct core access break the dependency injection pattern. UI modules should receive dependencies, not import them.

**Import Rules:**

| Module | ✅ Can Import | ❌ Cannot Import |
|--------|---------------|-----------------|
| `main.js` | core/, audio/, video/, ui/, utils/ | (entry point) |
| `core/engine.js` | state.js, utils/ | audio/, video/, ui/ |
| `core/commands/` | utils/, state.js | audio/, video/, ui/ |
| `audio/` | utils/, core/state.js | video/, ui/, core/* (except state.js) |
| `video/` | utils/, core/state.js | audio/, ui/, core/* (except state.js) |
| `ui/` | utils/ (via inject), engine (via inject) | core/, audio/, video/ |
| `utils/` | Only other utils/ | core/, audio/, video/, ui/ |

**❌ WRONG - Direct Import from Core:**
```javascript
// ui/my-component.js
import engine from '../core/engine.js';  // ❌ FORBIDDEN

export function initializeMyComponent() {
  engine.dispatch('doSomething');  // ❌ Not injected
}
```

**❌ WRONG - Circular Dependency:**
```javascript
// core/engine.js
import { playSound } from '../audio/audio-processor.js';  // ❌ Creates circle

// audio/audio-processor.js
import { engine } from '../core/engine.js';  // ❌ Creates circle
```

**✅ CORRECT - Dependency Injection:**
```javascript
// ui/my-component.js
export function initializeMyComponent(engine, DOM) {
  // Receive engine as parameter, don't import
  
  engine.onStateChange(state => {
    // Use it here
  });
  
  return {
    dispose() {
      // Cleanup
    }
  };
}

// main.js
import { initializeMyComponent } from './ui/my-component.js';
const ui = initializeMyComponent(engine, DOM);  // ✅ Inject here
```

**Why?** 
- UI modules can be tested in isolation by passing mock engine
- Audio/video modules stay independent of UI
- No circular dependencies = reliable module loading
- Future module replacement is easy

**Rule:** Receive dependencies as function parameters, never import them directly.

---

## Rule 4: Register Command Handlers Before Dispatching Commands

**The Problem:**
If a command is dispatched before its handler is registered, the dispatch silently fails with no error. The command just evaporates.

**Real Bug from Session:**
- Capability detection dispatched `updateOrchestration` command
- Handler wasn't registered yet (initialization order issue)
- Capabilities never made it into state
- Dev panel showed "no capabilities detected" despite detection running

**❌ WRONG - Handlers Registered Too Late:**
```javascript
// main.js
export async function init() {
  const engine = createEngine();
  
  // ❌ Dispatch before handlers exist
  const capabilities = await detectAllCapabilities();
  engine.dispatch('updateOrchestration', { capabilities });
  
  // ❌ Too late - command already executed
  registerDiagnosticsCommands(engine);
  
  // ❌ Now handlers work, but first dispatch was lost
  engine.dispatch('logMetric', { fps: 60 });  // ✅ This one works
}
```

**✅ CORRECT - Handlers Registered First:**
```javascript
// main.js
export async function init() {
  const engine = createEngine();
  
  // ✅ Register all handlers FIRST
  registerDiagnosticsCommands(engine);
  registerAudioCommands(engine);
  registerVideoCommands(engine);
  
  // ✅ NOW dispatch - handlers are ready
  const capabilities = await detectAllCapabilities();
  engine.dispatch('updateOrchestration', { capabilities });
  
  // ✅ All dispatches work
  engine.dispatch('logMetric', { fps: 60 });
}
```

**Debugging:**
```javascript
// If command doesn't work, check:
console.log('Registered handlers:', engine.getRegisteredHandlers?.() || 'unknown');

// Before dispatching:
if (!engine.hasHandler('updateOrchestration')) {
  console.error('Handler not registered!');
}

// NEVER do this:
engine.dispatch('myCommand', data);
registerMyHandlers(engine);  // ❌ Too late
```

**Rule:** Register all command handlers during initialization, BEFORE any dispatch calls.

---

## Rule 5: State Must Be JSON-Serializable

**The Problem:**
If state contains functions, class instances, or live objects, it cannot be:
- Logged to IndexedDB
- Debugged in the dev panel
- Sent to analytics servers
- Reconstructed on page reload

**❌ WRONG - Non-Serializable State:**
```javascript
// core/state.js
export const settings = {
  // ❌ Functions in state
  playAudio: () => { /* ... */ },
  
  // ❌ Class instances in state
  audioContext: new AudioContext(),
  videoStream: mediaStream,
  
  // ❌ DOM elements in state
  uiElement: document.getElementById('video'),
  
  // ❌ Circular references in state
  self: this,
};

// This will crash when trying to log:
JSON.stringify(settings);  // TypeError: Converting circular structure to JSON
```

**✅ CORRECT - JSON-Serializable State:**
```javascript
// core/state.js
export const settings = {
  // ✅ Configuration (primitives and objects)
  sampleRate: 44100,
  bufferSize: 2048,
  maxNotes: 24,
  
  // ✅ Simple data structures
  availableGrids: [
    { id: 'hex', name: 'Hexagonal' },
    { id: 'square', name: 'Square Grid' }
  ],
  
  // ✅ State flags
  isProcessing: false,
  isOnline: true,
  
  // ❌ DO NOT add:
  // audioContext: null,       // Live object
  // playFunction: () => {},   // Function
  // videoElement: null,       // DOM element
};

// This works:
JSON.stringify(settings);  // ✅ Returns JSON string
```

**Where Live Objects Go:**
```javascript
// In main.js - NOT in state
const audioContext = new AudioContext();
const videoStream = await navigator.mediaDevices.getUserMedia();

// Engine manages them OUTSIDE of state
export const engine = {
  _state: settings,  // Serializable
  _audioContext: audioContext,  // Live objects here
  _videoStream: videoStream,
  
  getAudioContext() {
    return this._audioContext;
  }
};
```

**Rule:** State must only contain primitives, objects, and arrays. No functions, class instances, or DOM elements.

---

## Rule 6: Web Workers Must Use Message Passing Contract

**The Problem:**
Web Workers run in separate threads. They can't share JavaScript objects directly. The contract between main thread and worker must be explicit and type-checked.

**The Contract:**
```javascript
// ✅ Valid message from worker to main:
{
  type: 'frameReady',         // ← Always required
  imageData: ImageData,       // ← Payload
  timestamp: 1234567890
}

// ✅ Valid message from main to worker:
{
  type: 'processFrame',       // ← Always required
  imageData: ImageData,       // ← Payload
  options: { threshold: 30 }
}

// ❌ WRONG - no type:
{
  imageData: ImageData,       // ← What is this?
  value: 42
}

// ❌ WRONG - sending non-transferable:
{
  type: 'initWorker',
  audioContext: new AudioContext()  // ❌ Can't transfer AudioContext
}
```

**❌ WRONG - Type Checking Missing:**
```javascript
// frame-provider-worker.js
postMessage({
  imageData: frame,
  timestamp: now
  // ❌ No 'type' field - main thread doesn't know what to do
});

// main.js
worker.onmessage = (msg) => {
  // ❌ No type check
  processFrame(msg.data.imageData);  // Could be anything!
};
```

**✅ CORRECT - Explicit Contract:**
```javascript
// frame-provider-worker.js
postMessage({
  type: 'frameReady',  // ✅ Type always first
  imageData: frame,
  timestamp: now
});

// main.js
worker.onmessage = (msg) => {
  // ✅ Type check first
  if (msg.data.type === 'frameReady') {
    processFrame(msg.data.imageData);
  } else if (msg.data.type === 'error') {
    handleWorkerError(msg.data.error);
  }
};
```

**Transferable Objects:**
```javascript
// ✅ Can transfer (main thread can't use after):
const imageData = new ImageData(...);
worker.postMessage(
  { type: 'frame', imageData },
  [imageData.data.buffer]  // ← Transfer ownership
);

// ❌ Cannot transfer:
const settings = { sampleRate: 44100 };
worker.postMessage(
  { type: 'init', settings },
  [settings]  // ❌ Not transferable
);
```

**Rule:** All worker messages must include a `type` field. Main thread must type-check before processing.

---

## Rule 7: UI Module Disposal Contract

**The Problem:**
UI modules create listeners, timers, and DOM elements. If not cleaned up, they leak memory and keep the app running even after the user closes them.

**The Contract:**
Every UI module initialization MUST return a `dispose()` function:

```javascript
export function initializeMyUI(engine, DOM) {
  // Setup
  const element = document.createElement('div');
  DOM.uiPanelRoot.appendChild(element);
  
  let isListening = true;
  const handleStateChange = (state) => {
    if (!isListening) return;
    updateUI(state);
  };
  
  engine.onStateChange(handleStateChange);
  
  // ✅ REQUIRED: Return dispose function
  return {
    dispose() {
      isListening = false;  // Stop processing
      element.remove();     // Remove DOM
      // ❌ DO NOT manually unsubscribe from listeners
      // Engine handles that automatically
    }
  };
}
```

**❌ WRONG - No Disposal:**
```javascript
export function initializeMyUI(engine, DOM) {
  const element = document.createElement('div');
  DOM.uiPanelRoot.appendChild(element);
  
  engine.onStateChange(state => {
    updateUI(state);  // Listener never removed
  });
  
  // ❌ WRONG - no dispose function
  return { };
}

// Result: Listener fires forever, memory leaks, old code still runs
```

**❌ WRONG - Trying to Unsubscribe:**
```javascript
export function initializeMyUI(engine, DOM) {
  // ... setup ...
  
  const unsubscribe = engine.onStateChange(state => {
    updateUI(state);
  });
  
  return {
    dispose() {
      unsubscribe?.();  // ❌ Engine might not support this
    }
  };
}
```

**✅ CORRECT - Proper Disposal:**
```javascript
export function initializeMyUI(engine, DOM) {
  const element = document.createElement('div');
  DOM.uiPanelRoot.appendChild(element);
  
  let disposed = false;
  engine.onStateChange(state => {
    if (disposed) return;  // ✅ Check disposal flag
    updateUI(state);
  });
  
  return {
    dispose() {
      disposed = true;
      element.remove();
    }
  };
}

// When closing UI:
if (myUI?.dispose) {
  myUI.dispose();  // ✅ Cleans up everything
}
```

**Checklist for UI Module Disposal:**
- [ ] All DOM elements removed
- [ ] Intervals/timeouts cleared
- [ ] Event listeners removed (or flag checked)
- [ ] Workers terminated
- [ ] Pending promises ignored or cancelled
- [ ] Shared references cleared

**Rule:** Every UI initialization must return `{ dispose() {...} }`. Disposal must clean up all resources.

---

## Rule 8: Initialization Order in main.js

**The Problem:**
The app has 6+ subsystems that depend on each other. If initialization happens in the wrong order:
- State isn't populated yet (grids are undefined)
- Handlers aren't registered (commands fail)
- UI loads before engine is ready (listeners don't work)

**Correct Sequence:**

```javascript
// Step 1: Create the engine and load initial state
const engine = createEngine();
const settings = engine.getState();

// Step 2: Merge additional state (orchestration, etc.)
mergeOrchestrationState(settings);

// Step 3: Load async resources and populate state
const grids = await loadAvailableGrids();
settings.availableGrids = grids;  // ✅ Now in state

const capabilities = await detectAllCapabilities();
engine.dispatch('updateOrchestration', { capabilities });  // ✅ Handler ready

// Step 4: Register ALL command handlers
registerDiagnosticsCommands(engine);
registerAudioCommands(engine);
registerVideoCommands(engine);

// Step 5: Initialize subsystems (audio, video)
const audioEngine = initializeAudio(engine, settings);
const videoProcessor = initializeVideo(engine, settings);

// Step 6: Initialize UI modules (last!)
const devPanel = initializeDeveloperPanel(engine, DOM);
const touchUI = initializeTouchGestures(engine, DOM);
const controlPad = initializeManualControlPad(engine, DOM);

// Step 7: Final setup and listeners
setupEventListeners(engine);

// Step 8: Power on (if needed)
const powerSwitch = initializePowerButton(engine, DOM);
```

**Why Each Step Matters:**

1. **Create engine** - Foundation for everything
2. **Merge state** - Prepare state structure
3. **Load resources** - Populate availableGrids, capabilities, etc.
4. **Register handlers** - Ready to receive dispatch calls
5. **Initialize subsystems** - Audio/video can now dispatch commands
6. **Initialize UI** - UIs can subscribe to state
7. **Setup listeners** - Event listeners work on populated state
8. **Power on** - User can interact

**❌ WRONG - Incorrect Order:**
```javascript
// ❌ Wrong: UI before handlers
const devPanel = initializeDeveloperPanel(engine, DOM);  // UI tries to listen
registerDiagnosticsCommands(engine);  // Too late

// ❌ Wrong: Dispatch before handler
engine.dispatch('updateOrchestration', { capabilities });
registerDiagnosticsCommands(engine);  // Too late, command lost

// ❌ Wrong: UI before state populated
const controlPad = initializeManualControlPad(engine, DOM);
const grids = await loadAvailableGrids();
settings.availableGrids = grids;  // ❌ Too late, UI already rendered
```

**Rule:** Follow the 8-step initialization sequence in main.js exactly.

---

## Rule 9: Logging Sampling for High-Frequency Events

**The Problem:**
The frame processor runs at 60fps. If you log every frame, you get 3600 logs per minute, which:
- Overwhelms the log ring buffer
- Makes IndexedDB huge
- Slows down the app
- Makes debugging harder

**❌ WRONG - No Sampling:**
```javascript
// frame-processor.js - runs 60 times per second
function processFrame(imageData) {
  structuredLog('DEBUG', 'Processing frame', { 
    width: imageData.width,
    height: imageData.height
  });  // ❌ 3600 logs per minute!
}
```

**✅ CORRECT - With Sampling:**
```javascript
// frame-processor.js
let frameCount = 0;
function processFrame(imageData) {
  frameCount++;
  
  // Log every 60th frame (1 per second at 60fps)
  if (frameCount % 60 === 0) {
    structuredLog('DEBUG', 'Processing frame', { 
      width: imageData.width,
      height: imageData.height,
      frameCount
    });  // ✅ 1 log per second
  }
}

// Or use probability:
if (Math.random() < 0.01) {  // 1% of frames
  structuredLog('DEBUG', 'Sample frame', { /* ... */ });
}
```

**Where to Sample:**

| Location | Frequency | Sampling |
|----------|-----------|----------|
| frame-processor.js | 60fps | Every 60th frame (1/sec) |
| motion-worker.js | 60fps | Every 60th (1/sec) |
| Audio synth loop | Per note | Only on ERROR |
| UI state changes | Variable | Only on DEBUG |
| Command dispatch | Variable | Always log |
| Initialization | Once | Always log |

**Rule:** High-frequency code (>10fps) must use sampling. Every Nth frame or probability-based.

---

## Rule 10: Error Handling in Async Initialization

**The Problem:**
If any async operation fails during initialization (loading grids, detecting capabilities, etc.), the app silently fails with incomplete state.

**❌ WRONG - No Error Handling:**
```javascript
// main.js
async function init() {
  const grids = await loadAvailableGrids();  // ❌ What if fails?
  settings.availableGrids = grids;
  
  const capabilities = await detectAllCapabilities();  // ❌ What if fails?
  engine.dispatch('updateOrchestration', { capabilities });
}
```

**✅ CORRECT - Error Handling:**
```javascript
// main.js
async function init() {
  try {
    const grids = await loadAvailableGrids();
    if (!grids || grids.length === 0) {
      structuredLog('WARN', 'No grids available - using default');
      settings.availableGrids = getDefaultGrids();
    } else {
      settings.availableGrids = grids;
    }
  } catch (e) {
    structuredLog('ERROR', 'Failed to load grids', { error: e.message });
    settings.availableGrids = getDefaultGrids();
  }
  
  try {
    const capabilities = await detectAllCapabilities();
    engine.dispatch('updateOrchestration', { capabilities });
  } catch (e) {
    structuredLog('ERROR', 'Failed to detect capabilities', { error: e.message });
    // Use safe defaults
    engine.dispatch('updateOrchestration', { 
      capabilities: { canvas2D: true, webGL: false }
    });
  }
}
```

**Fallback Strategy:**
```javascript
// Always have defaults
const DEFAULT_GRIDS = [
  { id: 'square', name: 'Square Grid', mapFunction: squareGridMap }
];

const DEFAULT_CAPABILITIES = {
  mediaStreamTrackProcessor: false,
  canvas2D: true,
  webGL: false,
  webGPU: false,
  offscreenCanvas: false,
  webAssembly: false
};

// Use them when async fails
async function safeLoadGrids() {
  try {
    return await loadAvailableGrids();
  } catch (e) {
    structuredLog('ERROR', 'Grid loading failed, using defaults', 
      { error: e.message });
    return DEFAULT_GRIDS;
  }
}
```

**Rule:** All async initialization must have try/catch and fallback defaults.

---

## Rule 11: State Factory Pattern - Prevent State Bypass (Nov 18: Fixed)

**The Problem:**
If `state.js` exports a live state object, any module can import it directly and mutate state without going through the engine. This breaks the Single Source of Truth principle and creates invisible state mutations.

**Anti-Pattern (What We Had):**
```javascript
// core/state.js
export let settings = {  // ❌ Live object exported
  gridType: 'hex',
  isProcessing: false,
  // ...
};

// ANYWHERE in the code:
import { settings } from './core/state.js';
settings.gridType = 'square';  // ❌ BYPASSES engine!

// Engine doesn't know state changed
// Dev panel shows stale value
// No command handler ran
// No logging occurred
// This is a SILENT FAILURE
```

**Why This Is Dangerous:**
- ❌ Multiple entry points for state mutations (not Single Source of Truth)
- ❌ Impossible to debug "why did this value change?"
- ❌ No command logging or telemetry for state changes
- ❌ Tests are not isolated (state persists between tests)
- ❌ Breaks the Redux-like unidirectional data flow

**Solution: Factory Pattern (What We Have Now):**
```javascript
// core/state.js
export function createInitialState() {  // ✅ Factory function
  return {
    gridType: 'hex',
    isProcessing: false,
    // ...
  };
}

// core/engine.js
import { createInitialState } from './state.js';

export function createEngine() {
  let state = createInitialState();  // ✅ Engine owns state creation
  // Now state is PRIVATE to engine
  
  // Expose only through controlled methods:
  return {
    getState: () => ({ ...state }),        // Read-only copy
    setState: (updates) => {
      Object.assign(state, updates);       // Controlled mutation
      notifyListeners();
    },
    dispatch: (cmd, payload) => { /* ... */ }  // Command system
  };
}

// ANYWHERE in the code:
import { createInitialState } from './core/state.js';  // ❌ DON'T DO THIS
const myState = createInitialState();  // Creates fresh state, not connected to engine

// ✅ CORRECT:
const state = engine.getState();        // Get current state from engine
engine.setState({ gridType: 'square' }); // Mutate only through engine
```

**Pattern Benefits:**
```javascript
// 1. Every test gets fresh state
function createEngine() {
  let state = createInitialState();  // Fresh copy each call ✅
}

// 2. Engine controls initialization timing
// 3. No modules can bypass engine
// 4. All mutations go through dispatch or setState
// 5. Easy to add logging to all state changes
```

**What You Can't Do Anymore (Good!):**
```javascript
// ❌ FORBIDDEN:
import { settings } from '../core/state.js';  // This export doesn't exist
settings.someValue = 123;  // Can't do this anymore

// ❌ FORBIDDEN:
import { createInitialState } from '../core/state.js';
const myState = createInitialState();
myState.someValue = 123;  // Creates unconnected state object

// ✅ DO THIS INSTEAD:
const currentState = engine.getState();
engine.setState({ someValue: 123 });  // All mutations through engine
```

**Module Access Patterns:**

| Pattern | Where | How |
|---------|-------|-----|
| Command handler | `commands/*.js` | Receives `state` in context |
| UI module | `ui/**` | Calls `engine.getState()` |
| Core module | `core/` | Calls `engine.getState()` |
| Test | `test/` | Creates fresh engine, calls `createInitialState()` for mocks |

**Rule:** Never export a live state object. Always use factory pattern (`createInitialState()`) and let only the Engine own state mutations.

---

## Quick Reference Checklist

Before submitting code changes, verify:

### State Management
- [ ] No spread operator on state objects (`{...state}`)
- [ ] State mutations preserve object identity
- [ ] All state values are JSON-serializable
- [ ] No functions, classes, or DOM in state
- [ ] Never import `settings` directly from state.js ✅ NEW: Rule 11
- [ ] All state mutations go through `engine.setState()` or dispatch ✅ NEW: Rule 11
- [ ] No bypassing engine with direct state imports ✅ NEW: Rule 11

### Module Dependencies
- [ ] UI modules don't import from core/
- [ ] No circular imports
- [ ] Dependencies injected as parameters
- [ ] Audio/video don't depend on UI

### Command Handlers
- [ ] All handlers registered BEFORE any dispatch
- [ ] Handler registration in correct order
- [ ] Error handling in handlers
- [ ] Command payloads type-checked

### Initialization
- [ ] Resources loaded before UI init
- [ ] All handlers registered before dispatch
- [ ] State populated before listeners subscribe
- [ ] Async operations have error handling

### UI Modules
- [ ] Always returns `{ dispose() {...} }`
- [ ] Disposal cleans all resources
- [ ] Event listeners check disposal flag
- [ ] No memory leaks on close

### Logging
- [ ] High-frequency logs use sampling
- [ ] Errors logged at ERROR level
- [ ] Initialization steps logged at INFO
- [ ] Debug logs only with ?debug=true

### Web Workers
- [ ] All messages include `type` field
- [ ] Main thread type-checks before processing
- [ ] Transferable objects properly transferred
- [ ] Error messages returned to main thread

---

## Common Bugs We've Fixed

### Bug 0: State Bypass Anti-Pattern (November 18, 2025)
**Symptom:** Multiple modules importing and mutating state directly; changes invisible to engine
**Root Cause:** `state.js` exported live `settings` object; no enforcement of single mutation point
**Fix:** Converted to factory pattern: `export function createInitialState() {...}`
**Impact:** Removed 5 direct imports across main.js, ingest.js, media-commands.js, test files
**Rule Enforced:** Rule 11 (State Factory Pattern)

### Bug 1: Empty Grid Dropdown (October 2025)
**Symptom:** Grid Type dropdown had no options; Manual Control Pad broken
**Root Cause:** `mergeOrchestrationState()` used spread operator, creating new object
**Fix:** Modified to mutate existing object instead
**Rule Violated:** Rule 1 (never create new state objects)

### Bug 2: Capabilities Not Detected (October 2025)
**Symptom:** Only Canvas 2D showing on high-end iPhone, despite having 4-core processor
**Root Cause:** capability-detector.js existed but was never called during init
**Fix:** Added import and call in main.js STEP 1A
**Rule Violated:** Rule 8 (wrong initialization order)

### Bug 3: Command Handler Not Found (Hypothetical)
**Symptom:** `updateOrchestration` dispatch silently fails
**Root Cause:** Handler registered after dispatch call
**Fix:** Move handler registration before dispatch
**Rule Violated:** Rule 4 (handlers before dispatch)

---

## References

- Audio subsystem: `future/web/audio/README.md` - Oscillator pool rules
- Video subsystem: `future/web/video/README.md` - Worker contracts
- Core engine: `future/web/core/README.md` - State management
- UI modules: `future/web/ui/README.md` - Module contract
- Utilities: `future/web/utils/README.md` - Logging strategy

---

## Questions?

If you encounter a pattern not covered here, check:
1. The specific subsystem's README
2. Recent commits for similar patterns
3. Run with `?debug=true` for detailed logs
4. Check browser console for runtime errors

**For AI Coding Agents:** This document is the source of truth. If you violate any rule here, the resulting code will break the app. Ask the human if you're uncertain about any rule.
