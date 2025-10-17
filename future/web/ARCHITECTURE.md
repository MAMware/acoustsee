# AcoustSee Architecture Guide

This document defines the architectural contracts, patterns, and guardrails for AcoustSee. Follow these rules for all contributions.
This file is authoritative. Follow it to prevent regressions and circular rework.

## 1. Core Philosophy
AcoustSee is modular, testable, and extensible. Keep concerns separated: core logic, UI, and platform integration must remain decoupled 

Testing & CI

- Unit tests req## 18. Enforcement
- Add a CI lint rule to fail builds on core -> ui imports.
- Add tests that assert UIs expose `dispose()` and that calling `initialize*UI` twice does not create duplicate IDs.

---


## 19. Runtime basePath detection (hosting compatibility)r core command handlers and audio processor logic.
- UI smoke tests (headless/browser) required for each UI module (e.g., Playwright or Puppeteer).
- Linting rules must enforce core/ui import boundaries.
- PRs must include tests for new command handlers or UI behaviors.

## 15. Accessibility & Internationalization
- All interactive elements must provide keyboard access and ARIA attributes.
- Text must be extracted into `web/languages/` and UIs must support locale injection.

## 16. Versioning & Releases
- Expose BUILD_VERSION in `web/core/constants.js`. UIs should display the version badge.
- Keep changelog entries for architectural changes.

## 17. Onboarding & Maintenance
- Each UI folder must contain a README describing its public API and lifecycle (initialize + dispose).
- Keep a small architectural checklist in `docs/ARCHITECTURE_CHECKLIST.md` that PR reviewers use.


## 2. Core Operating Paradigms: Flow and Focus

To serve the distinct needs of active navigation and detailed exploration, AcoustSee is built on two core operating paradigms. The application can be switched between these modes by the user. This dual-mode architecture is a fundamental design principle. (See ADR-0002 for details).

*   **Navigation Mode ("Flow Mode"):**
    *   **Goal:** Provide real-time, low-latency spatial awareness for safe movement.
    *   **Behavior:** Uses fast, abstract processing to create a textural soundscape representing the shape of the environment. Performance is prioritized over detail.

*   **Identification Mode ("Focus Mode"):**
    *   **Goal:** Provide detailed, semantic information about specific objects in the user's vicinity.
    *   **Behavior:** Engages computationally intensive Machine Learning models (e.g., object segmentation, depth estimation) to trigger specific, recognizable "AcousticCues." Accuracy is prioritized over speed.


## 2.5. Architectural Pattern: Hexagonal Architecture (Ports & Adapters)

To ensure true modularity and testability, AcoustSee is designed following the principles of **Hexagonal Architecture**, also known as the **Ports and Adapters** pattern. The core principle is to isolate the application's central logic from external technologies and frameworks.

This creates a clean separation of concerns, allowing different "pipelines" (UI, Audio, Video) to be developed and tested independently.

### The Hexagon: The Application Core

The "Hexagon" represents the pure, business logic of the application. It has no knowledge of the outside world (like the DOM, Web Audio API, or specific ML models).

*   **Implementation:** `web/core/engine.js`
*   **Responsibility:** Manages application state and orchestrates commands. It is the single source of truth for the application's behavior.

### The Ports: The Formal API

The Hexagon defines "Ports," which are the formal, technology-agnostic APIs for interacting with the core.

1.  **Inbound Port (Driving Port):** This is the API for telling the application to *do something*.
  *   **Implementation:** The `engine.dispatch('command', payload)` method.
  *   **Contract:** All external interactions that modify or query the application state *must* go through the `dispatch` method.

2.  **Outbound Port (Driven Port):** This is the API for the application to announce that *something has happened*.
  *   **Implementation:** The `engine.on('event', listener)` method and the `engine.onStateChange(listener)` subscription.
  *   **Contract:** The core notifies the outside world of changes via these event listeners. It does not call external modules directly.

### The Adapters: The Outside World

"Adapters" are the pluggable modules that connect external technologies to the Hexagon's Ports. They are responsible for translating between the specific technology and the application's generic commands and events.

*   **UI Adapters (`web/ui/`):**
  *   **Technology:** The Browser DOM (clicks, swipes, etc.).
  *   **Function:** They listen for raw user input and *adapt* it into formal commands (e.g., a `click` becomes `dispatch('toggleProcessing')`). They also listen for state changes from the engine to update the screen.

*   **Audio Adapter (`web/audio/`):**
  *   **Technology:** The Web Audio API.
  *   **Function:** It listens for a generic `playCues` command from the engine and *adapts* it into specific Web Audio API calls (`createOscillator`, `.start()`, etc.). The engine itself does not know what an oscillator is.

*   **Video Adapter (`web/video/`):**
  *   **Technology:** Camera streams, Web Workers, and ML models.
  *   **Function:** It adapts raw video frames into meaningful data (like motion regions or identified objects) and can be triggered by commands from the engine.

*   **Test Adapters (`/test/`):**
  *   **Technology:** A testing framework (e.g., Playwright, Jest).
  *   **Function:** A test script acts as another adapter. It drives the application through the `dispatch` port and verifies outcomes by listening to the `onStateChange` port, all without needing a real browser or UI.

This architecture is the key to maintaining the project's integrity while allowing for independent, "pipeline-based" development.

### Visual Diagram

Below is a small diagram illustrating the Hexagonal Architecture mapping used by AcoustSee. The Application Core (the hexagon center) exposes ports; Adapters connect the outside world to those ports.

![Hexagonal Architecture diagram](./docs/hexagonal-architecture.svg)



## 3. Development Process

To prevent rework and ensure clarity, this project follows a lightweight development process based on documented tasks and architectural decisions.

*   **Task Tracking (`TASKS.md`):** All significant work is tracked in the `TASKS.md` file at the project root. Before starting work, please consult this file. All commits and Pull Requests should reference a Task ID (e.g., `PERF-1`).
*   **Architectural Decisions (`docs/adr/`):** Major architectural decisions are documented as Architectural Decision Records (ADRs) in the `docs/adr/` directory. These serve as the rationale for the project's structure.
*   **Work-in-Progress (WIP):** Code that is experimental or incomplete **must** be wrapped in a `WIP` comment block that references its Task ID. This protects it from premature refactoring.
  *Example:*
  ```javascript
  // --- WIP: PERF-1 ---
  // This logic is experimental. Do not modify without consulting TASKS.md.
  // --- END WIP ---
  ```

## 4. Headless Engine Pattern
- `web/core/` contains the headless Engine and command handlers.
- Core modules must not access `window`, `document`, or import anything from `web/ui/`.
- The Engine exposes `engine.dispatch(command, payload)` and registers command handlers in `web/core/commands/`.
- Command handlers return structured results (objects) and should not throw uncaught errors.

### Command Handler Categories
- `media-commands.js` — Camera, microphone, and media stream management
- `settings-commands.js` — Configuration and user preferences  
- `diagnostics-commands.js` — Performance measurement, AutoFPS, and system diagnostics
- `debug-commands.js` — Development and debugging utilities

## 5. Directory Responsibilities
- `web/core/` — state machine, command registration, headless business logic.
- `web/core/commands/` — grouped command implementations (media, settings, diagnostics, debug).
- `web/core/scheduler.js` — lightweight diagnostic scheduler for performance management.
- `web/ui/` — pluggable UI modules; each UI lives in its own subdirectory (e.g., `ui/dev-panel/`, `ui/touch-gestures/`).
- `web/audio/`, `web/video/`, `web/utils/` — well-scoped helpers and workers. UI-specific helpers (for example worker monitors) may be colocated under `web/ui/<name>/`.

## 6. Pluggable UI Contract
Each UI module must:
- Live under `web/ui/<name>/`.
- Export `initialize<Name>UI(engine, DOM, options = {})` (exact export name documented in the module README). Note: for the development dashboard the canonical module is `ui/dev-panel/` and it registers its initializer with the `ui-registry` (see below).
- Create its DOM under a provided root (use `DOM.uiPanelRoot` if supplied).
- Load its own stylesheet dynamically and run DOM measurement/wiring only in `link.onload`.
- Use scoped IDs/prefixes to avoid collisions (e.g., `acoustsee-devpanel-*`).
- Use event delegation where possible and avoid fragile index-based child access.
- Return a `dispose()` function (or attach it to the panel) that removes event listeners, clears intervals, stops polling, and removes created DOM.

Example signature:
```js
export function initializeDebugUI(engine, DOM, options = {}) {
  // returns { dispose() { ... } }
}
```

## 7. UI Submodule Structure
A UI directory should contain:
- `<name>.js` (coordinator, e.g. `dev-panel.js`)
- `<name>.behavior.js` (layout/visual behavior)
- `<name>.actions.js` (event wiring)
- `<name>.controls.js` (factory helpers)
- `<name>.css` (styles)
- `worker-charts.js` or other contained subcomponents


### ui-registry (recommended)
To avoid accidental global exports and to make dynamically-loaded UI modules discoverable to other boot-time handlers, the project provides a small `ui-registry` helper at `web/ui/ui-registry.js`.

The registry exposes:
- `registerComponent(name, initializerFn)` — modules call this at load-time to make their initializer available.
- `getComponent(name)` — returns the initializer function previously registered (or `undefined`).

Example usage from a UI module:
```js
import { registerComponent } from '../ui/ui-registry.js';
// Note: Dev panel initializer now follows a simplified signature. When running in
// debug mode the panel is initialized and shown immediately by calling:
export function initializeDevPanel(engine, DOM) { /* ... */ }
registerComponent('dev-panel', initializeDevPanel);
// Deprecated: previous versions accepted an `options` object (for example
// `autoOpen`) — that behavior has been removed. Use `?debug=true` in the URL
// to ensure the dev panel is loaded and visible at boot.
```

## 8. Video Subsystem: The Adaptive Frame Processing Pipeline

The video subsystem captures and analyzes camera input using an intelligent, performance-aware architecture.

### Core Architecture: FrameProvider + Orchestrator + Specialists

*   **FrameProvider Worker:** A dedicated worker that isolates camera access. It runs its own `requestAnimationFrame` loop to provide a clean, steady stream of video frames, tagging each with timing metadata for performance measurement.
*   **Orchestrator (`frame-processor.js`):** The central brain of the video pipeline. It receives frames from the `FrameProvider` and, based on the application's current mode (`flow` vs. `focus`), delegates analysis tasks to the appropriate specialist workers.
*   **Specialist Workers (`motion-worker.js`, `depth-worker.js`, etc.):** Each specialist is an expert in a single, computationally expensive task (e.g., motion detection, depth estimation, object recognition). They return structured, semantic data.
    *   **`motion-worker.js`:** Real-time optical flow and motion magnitude computation; fast, CPU-based.
    *   **`depth-worker.js`:** Monocular depth estimation with dual paths: GPU-accelerated CNN (WebGPU compute shaders) with CPU fallback, or fast CPU-only Sobel edge detection. See ADR-0005 for WebGPU acceleration strategy.
*   **Grids (`grids/`):** Pluggable **"Sonic Sculptor"** modules. Their role changes based on the mode:
    *   **In `Flow` Mode:** They translate unstructured spatial data (like raw motion) into a musical concept, creating an ambient soundscape. Example: `linear-pitch.js`.
    *   **In `Focus` Mode:** They translate structured semantic data from the specialists (like a detected object's shape or form) into a specific sonic signature, like a melody or arpeggio, effectively "drawing" the object's form with sound. // R161025 "structured semantic data" we might want to revisit this apprach, i dont think we need this complexity of semantic data, instead we should try to handle "abstract" data and to transforn it into sound, as direct as we can, lightweight in all termns.

### Data Flow & Output Contract

The Orchestrator coordinates the specialists and the active Grid to produce the final output: an array of `cues`. This array is then dispatched in an `'audioCuesReady'` event. The content and richness of these cues adapt to both the operating mode and real-time performance constraints.

### 8.1 Depth Worker: GPU-Accelerated Monocular Depth Estimation

The `depth-worker.js` specialist provides real-time, relative depth information for melody modulation and spatial scene understanding. It implements a hybrid architecture combining GPU acceleration with CPU fallback for compatibility.

#### Design Overview

The depth worker supports two distinct computational paths, selected via the `path` parameter:

1. **CNN Path (GPU-Accelerated):** Uses a minimal U-Net encoder-decoder architecture with WebGPU compute shaders for 2D convolution operations.
   - **Encoder:** 3 GPU-accelerated convolutional layers with ReLU activation.
   - **Decoder:** Bilinear upsampling + convolutional layers to reconstruct full-resolution depth map.
   - **Fallback:** If WebGPU unavailable or fails, automatically switches to CPU-only vanilla JS implementation.
   - **Output:** Flattened depth map [0, 1] averaged into grid cells per paradigm.

2. **Pseudo-Depth Path (CPU-Only):** Fast, dependency-free approach using Sobel edge detection.
   - **Sobel operator:** Detects edges via gradient magnitude; high-gradient regions → close objects.
   - **Softplus normalization:** `log(1 + exp(x))` maps edge magnitude to [0, ∞) → [0, 1].
   - **Gabor texture enhancement:** Optional; refines collision detection via Gabor-kernel correlation.
   - **Sampling:** Every 30 pixels per grid cell for speed; skip cells with depth < 0.2.

#### GPU Acceleration Strategy (WebGPU)

**See ADR-0005 for complete rationale and implementation details.**

- **Compute Shader (WGSL):** Parallelizes 2D convolution across GPU threads; workgroup size 256 for efficient utilization.
- **Buffer Management:** Async GPU buffer creation, data transfer, bind group setup, and readback.
- **Device Caching:** GPU device initialized once and cached to avoid repeated adapter/device creation overhead.
- **Graceful Fallback:** Any GPU failure (initialization, shader compilation, device loss) automatically triggers CPU path without interrupting playback.
- **Structured Logging:** Sampled logs (1% sample rate) for GPU operation monitoring without console spam.

#### Message Contract

**Input:** `{ type: 'processFrame', frame: ImageData, gridSize: { rows: 4, cols: 4 }, path: 'cnn'|'pseudo' }`

**Output:** `{ type: 'depthCues', result: { gridDepths: [[...], ...], timestamp: number } }`

- `gridDepths`: 2D array [rows][cols] with averaged depth per grid cell, normalized to [0, 1].
- `timestamp`: Frame processing completion time for diagnostics.

#### Performance Characteristics

- **Pseudo-depth path:** 20-40ms for 640×480 (CPU-only, no GPU overhead).
- **CNN path (GPU available):** 50-150ms for 640×480 encoder-decoder (10x faster than pure CPU).
- **CNN path (GPU unavailable):** 500-1000ms for 640×480 (falls back to vanilla JS conv2d).

#### Error Handling & Resilience

- **GPU initialization failure:** Log warning, use CPU path for all subsequent frames.
- **GPU shader compilation failure:** Catch exception, fall back to CPU for that frame; retry GPU on next frame.
- **Device loss:** Clear cached device; re-initialize on next frame with exponential backoff.
- **Out-of-memory:** GPU buffer allocation failure triggers automatic CPU path.

#### Integration Notes

- Used in **Focus Mode** (ML-1) for melody modulation via depth grid.
- Can be triggered at lower latency (<45ms) via frame skipping (every 2nd frame) for real-time responsiveness.
- Compatible with both paradigms; CNN path provides richer depth detail, pseudo-depth path prioritizes speed.

## 9. Audio Subsystem: The Adaptive Conductor

The audio subsystem, orchestrated by the `playCues` "Conductor," translates `cues` into sound. Its output also adapts to the current operating mode.

*   **The Conductor Pattern:** The core pattern remains the same: `playCues` maps `cues` to synthesizers via the `sound-profiles.js` manifest.
*   **In Flow Mode:** It generates continuous, textural, and abstract soundscapes designed for spatial awareness. Synthesizers used in this mode are optimized for responsiveness and clarity.
*   **In Focus Mode:** It generates discrete, specific, and recognizable sounds ("AcousticCues") that correspond to identified objects. The sound profiles for this mode are semantically rich (e.g., a glass synth for a `glass` objectType).

## 10. Performance Management: The AutoFPS Feedback Loop

AcoustSee implements an intelligent, closed-loop performance management system that automatically adjusts processing workload to maintain responsiveness and battery efficiency.

### The New, Modern System (How We Do It Now)

Our new system is a true, closed-loop feedback system made of several cooperating components. It separates the job of *processing* from the job of *measuring and adjusting*.

| Component | Responsibility | How it Works (The New AutoFPS) |
| :--- | :--- | :--- |
| **1. `FrameProvider` Worker** | **Process as fast as possible.** | It runs a `requestAnimationFrame` loop, providing a constant stream of frames at the maximum possible speed. Crucially, it **tags each frame** with a `startTime`. |
| **2. `Sonification Handler`** | **Measure the real work.** | At the very end of the entire pipeline, it receives the final cues. It calculates `endTime - startTime` to get the **actual, measured duration** it took to process that specific frame. It then dispatches this measurement via `'logFrameBenchmark'`. |
| **3. `Diagnostics Handler`** | **Collect the data.** | It listens for `'logFrameBenchmark'` events and collects the real-world performance data into a rolling buffer (the `RingBuffer`). It knows exactly how "expensive" our pipeline is. |
| **4. The New `Scheduler`** | **Be the "manager" who checks in.** | This is a slow, low-priority loop. It runs infrequently (e.g., once or twice a second) and dispatches a `'diagnosticTick'`. Its only job is to ask the question, "Is it time to review our performance?" |
| **5. The `Diagnostics Handler` (Again)** | **Make an intelligent decision.** | When it receives the `'diagnosticTick'`, it analyzes the collected performance data. It asks: "Based on the last 30 frames, are we running efficiently, or are we struggling?" |
| **6. The `FrameProvider` (Again)** | **The "Throttle"** | This is the final piece. The `Diagnostics Handler` doesn't directly control the FPS. Instead, it can dispatch a command to tell the `FrameProvider` to change its behavior. For example, it could tell it to **start skipping frames** (e.g., "only process every other frame") or to **reduce the resolution** of the `ImageData` it sends back. This is how it adjusts the workload to meet the performance target. The `updateInterval` in the state becomes the *goal* that this system tries to achieve. |

**In summary:** The new system is an intelligent feedback loop. It **measures the real-world cost** of our pipeline and then **adjusts the workload** to ensure the application stays responsive and battery-efficient.

### Command Flow for Performance Management

- **Performance Measurement:** `logFrameBenchmark` → Diagnostics Handler
- **Performance Review:** `diagnosticTick` → Diagnostics Handler analysis
- **Workload Adjustment:** Diagnostics Handler → `setFrameInterval`, `setFpsMode` commands to FrameProvider

### Implementation Files

- `core/scheduler.js` — The lightweight diagnostic scheduler
- `core/commands/diagnostics-commands.js` — Performance measurement and adjustment handlers  
- `video/frame-provider-worker.js` — The adaptive frame processing worker
- `audio/hrtf-processor.js` — End-of-pipeline measurement point

## 11. Guardrails — What Not To Do
- Do not add business logic to `core/engine.js`.
- Do not import UI modules into `core/` — enforce via lint rule.
- Do not create manual frame processing loops — use the FrameProvider worker system.
- Do not implement custom FPS throttling — use the AutoFPS feedback loop via diagnostics commands.
- Avoid fragile DOM access by index; prefer data-action attributes and delegation.
- Avoid creating global IDs without module prefix.
- Avoid starting polling/intervals without exposing a dispose that stops them.

### Common LLM Refactoring Anti-Patterns (DO NOT DO THESE)

These are common mistakes that AI coding assistants make when refactoring code. **Do not make these changes:**

#### ❌ Anti-Pattern 1: "Simplifying" Context Destructuring
```javascript
// WRONG: LLMs often "simplify" by removing unused variables
const { audioContext, getOscillator } = ctx;
// But synths MUST extract ALL dependencies they use:
const { audioContext, getOscillator, masterGain, oscillatorPool } = ctx;
```

**Rule:** Synths must explicitly destructure ALL dependencies from `ctx`. JavaScript won't error until runtime access.

#### ❌ Anti-Pattern 2: "Cleaning Up" Oscillator Connections
```javascript
// WRONG: LLMs see "unused" masterGain and remove the connection
panner.connect(audioContext.destination);

// CORRECT: ALL synths MUST connect to masterGain for volume control
panner.connect(masterGain);
```

**Rule:** Audio graph MUST terminate at `masterGain`, never at `audioContext.destination` directly.

#### ❌ Anti-Pattern 3: "Optimizing" Karplus-Strong Feedback
```javascript
// WRONG: LLMs see 0.90 and "optimize" to 0.98 for "better sustain"
const decay = 0.98; // Causes exponential resonance!

// CORRECT: Feedback gain MUST be < 0.95 for stability
const decay = 0.90; // Safe range: 0.85-0.95
```

**Rule:** Karplus-Strong feedback gain > 0.95 causes runaway resonance. Keep it in the 0.85-0.95 range.

#### ❌ Anti-Pattern 4: "Consolidating" UI Imports
```javascript
// WRONG: LLMs try to "organize" imports by pulling in core modules
import { engine } from '../../core/engine.js';

// CORRECT: UI modules MUST receive engine via dependency injection
export function initializeMyUI(engine, DOM) { ... }
```

**Rule:** UI modules MUST NOT import from `core/`. They receive dependencies as parameters.

#### ❌ Anti-Pattern 5: "Simplifying" Worker Message Handling
```javascript
// WRONG: LLMs "simplify" by removing message type checks
worker.onmessage = (e) => {
  const data = e.data;
  handleFrame(data);
};

// CORRECT: ALWAYS check message type for robustness
worker.onmessage = (e) => {
  const { type, result } = e.data;
  if (type === 'result') handleFrame(result);
  else if (type === 'error') handleError(result);
};
```

**Rule:** Worker message handlers MUST check `type` field. Workers send multiple message types.

#### ❌ Anti-Pattern 6: "Removing Redundant" Dispose Functions
```javascript
// WRONG: LLMs see empty dispose and remove it
// (Then later code breaks when it tries to call dispose)

// CORRECT: ALL UI modules MUST return dispose, even if empty
export function initializeMyUI(engine, DOM) {
  // ... setup code ...
  return { dispose: () => {} }; // Will be filled in later
}
```

**Rule:** ALL UI modules MUST return a `dispose()` function. Empty is fine, but it must exist.

#### ❌ Anti-Pattern 7: "Fixing" Performance by Removing Sampling
```javascript
// WRONG: LLMs see conditional logging and "simplify" it
structuredLog('DEBUG', 'Frame processed', { frameId });

// CORRECT: High-frequency logs MUST use sampling
if (Math.random() < 0.01) {
  structuredLog('DEBUG', 'Frame processed', { frameId });
}
```

**Rule:** Per-frame logs MUST be sampled (1% or less) to prevent performance degradation.

## 12. CSS & Layout Rules
- UI modules must load CSS via a `<link>` element and do layout in `link.onload`.
- Use a consistent stylesheet path resolution strategy (absolute or `document.baseURI`-aware`).
- Controls should use responsive two-column grids where appropriate.

## 13. Error Reporting and Logging
- Core: structured logging (level, message, meta). Command handlers should use structured log helpers.
- UI: non-blocking user notifications for errors; log to debug console pane.
- Each UI module should log its module load with version badge: `console.log('module loaded', BUILD_VERSION)` when available.

### Performance Measurement
- Use `logFrameBenchmark` command to report frame processing times with `startTime` and `endTime`.
- Performance-critical code should participate in the AutoFPS feedback loop by dispatching timing measurements.
- Use the diagnostic scheduler (`diagnosticTick`) for infrequent performance analysis, not per-frame operations.
- Workers should tag frames with timing metadata to enable end-to-end measurement.

## 14. Testing & CI
- Unit tests required for core command handlers and audio processor logic.
- UI smoke tests (headless/browser) required for each UI module (e.g., Playwright or Puppeteer).
- Linting rules must enforce core/ui import boundaries.
- PRs must include tests for new command handlers or UI behaviors.

## 15. Recent Architectural Lessons (7 October 2025)

### Oscillator Pool Architecture
The audio subsystem uses a pre-allocated oscillator pool pattern for performance. Key learnings:

**Pool Contract:**
- The pool stores `{osc, gain, panner, active}` objects that are **unconnected and unstarted**
- Synths receive the pool via `ctx.oscillatorPool` and wire connections themselves
- Synths MUST extract `oscillatorPool` from `ctx` explicitly (no implicit access)
- Each oscillator can only call `.start()` once - must use fresh oscillators for new notes

**Common Bug:**
```javascript
// WRONG: Forgot to extract oscillatorPool from ctx
export function playCues(cues, ctx) {
  const { audioContext, getOscillator } = ctx;
  oscillatorPool.forEach(...); // ReferenceError at runtime!
}

// CORRECT: Extract all dependencies explicitly
export function playCues(cues, ctx) {
  const { audioContext, getOscillator, masterGain, oscillatorPool } = ctx;
  if (oscillatorPool && Array.isArray(oscillatorPool)) {
    oscillatorPool.forEach(...);
  }
}
```

### Karplus-Strong Synthesis Stability
Physical modeling synths (like plucked strings) require careful gain staging:

**Feedback Gain Rules:**
- Feedback gain MUST be in range 0.85-0.95 for stability
- Values > 0.95 cause exponential signal growth (runaway resonance)
- Values < 0.85 cause premature decay (unrealistic sound)
- Default safe value: **0.90**

**Amplitude Rules:**
- Noise excitation should be 0.2-0.4 (not 0.8+)
- Output amplitude should be scaled by intensity × 0.15 (not 0.3+)
- Always cap output amplitude to prevent clipping

### Worker Message Contracts
All workers MUST send structured messages with a `type` field:

```javascript
// Worker sends:
postMessage({ type: 'result', result: { data } });
postMessage({ type: 'error', error: 'description' });
postMessage({ type: 'ready', features: [] });

// Main thread handles:
worker.onmessage = (e) => {
  const { type, result, error } = e.data;
  if (type === 'result') handleResult(result);
  else if (type === 'error') handleError(error);
  else if (type === 'ready') handleReady();
};
```

### UI Disposal Requirements
ALL UI modules must provide disposal cleanup:

**Required in dispose():**
- Remove ALL event listeners (DOM, engine, workers)
- Clear ALL intervals and timeouts
- Stop ALL polling loops
- Remove ALL created DOM elements
- Terminate ALL workers
- Close ALL persistent connections

**Empty dispose is acceptable** during initial development, but must be filled in before PR.

## 16. Accessibility & Internationalization
- All interactive elements must provide keyboard access and ARIA attributes.
- Text must be extracted into `web/languages/` and UIs must support locale injection.

## 17. Versioning & Releases
- Expose BUILD_VERSION in `web/core/constants.js`. UIs should display the version badge.
- Keep changelog entries for architectural changes.

## 18. Onboarding & Maintenance
- Each UI folder must contain a README describing its public API and lifecycle (initialize + dispose).
- Keep a small architectural checklist in `docs/ARCHITECTURE_CHECKLIST.md` that PR reviewers use.

## 19. Enforcement
- Add a CI lint rule to fail builds on core -> ui imports.
- Add tests that assert UIs expose `dispose()` and that calling `initialize*UI` twice does not create duplicate IDs.

---
This file is authoritative. Follow it to prevent regressions and circular rework.

## Runtime basePath detection (hosting compatibility)

When AcoustSee is deployed under a repository subpath (for example on GitHub Pages
at `https://<org>.github.io/acoustsee/`), root-relative asset paths like
`/ui/dev-panel/dev-panel.css` will not include the deeper path segments such as
`/acoustsee/future/web/` and will therefore 404.

To handle this, the application computes a runtime `basePath` from the script
element that loaded the bootloader (usually `boot.js`) and passes this base
path into modules that dynamically load assets (workers, stylesheets, etc.).

Key points:
- `main.js` establishes `basePath` at startup by inspecting the `boot.js` script
  element. This is the most reliable anchor available at runtime.
- Dynamic loaders (for example `enableFrameWorker(...)` and UI initializers)
  should accept a `basePath` or a `workerBaseUrl` in their options and use
  it to construct full asset URLs (e.g., `new URL('./workers/frame-worker.js', workerBaseUrl).href`).
- Prefer using the injected basePath over hard-coded root-relative paths.

If you add new modules that load assets dynamically, document and accept a
`basePath` option in the initializer to maintain hosting compatibility.
