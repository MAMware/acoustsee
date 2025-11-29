# AcoustSee Architecture Guide

This document defines the architectural contracts, patterns, and guardrails for AcoustSee. Follow these rules for all contributions.
This file is authoritative. Follow it to prevent regressions and circular rework.

## 1. Core Philosophy
AcoustSee is modular, testable, and extensible. Keep concerns separated: core logic, UI, and platform integration must remain decoupled.

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


## 3. Development Process

To prevent rework and ensure clarity, this project follows a lightweight development process based on documented tasks and architectural decisions.

*   **Task Tracking (`TASKS.md`):** All significant work is tracked in the `TASKS.md` file at the project root. Before starting work, please consult this file. All commits and Pull Requests should reference a Task ID (e.g., `PERF-1`).
*   **Architectural Decisions (`docs/adr/`):** Major architectural decisions are documented as Architectural Decision Records (ADRs) in the `docs/adr/` directory. These serve as the rationale for the project's structure.
*   **Work-in-Progress (WIP):** Code that is experimental or incomplete **must** be wrapped in a `WIP` comment block that references its Task ID. This protects it from premature refactoring.

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

## 5.5 Audio Lifecycle & Unlock Ceremony
- `AudioManager` eagerly creates the `AudioContext` at startup. If unsupported, initialization fails fast.
- The `Power` button (user gesture) resumes the context and calls `initializeAudio()`.
- `initializeAudio()` returns the `audioApi` surface (`playCues`, `resizeOscillatorPool`, `setSelectedSynthEngine`). Only then is `engine.audioApi` assigned.
- Video-to-audio mapping is blocked until `engine.audioApi` exists and exposes `playCues`.
- If audio is not ready, commands must log ERROR and fail (no silent fallback). Language may degrade gracefully and never blocks audio init.

## 6. Pluggable UI Contract
Each UI module must:
- Live under `web/ui/<name>/`.
- Export `initialize<Name>UI(engine, DOM, options = {})`.
- Create its DOM under a provided root (use `DOM.uiPanelRoot` if supplied).
- Load its own stylesheet dynamically and run DOM measurement/wiring only in `link.onload`.
- Use scoped IDs/prefixes to avoid collisions (e.g., `acoustsee-devpanel-*`).
- Use event delegation where possible and avoid fragile index-based child access.
- Return a `dispose()` function that cleans up DOM and listeners.

## 7. UI Submodule Structure
A UI directory should contain:
- `<name>.js` (coordinator)
- `<name>.behavior.js` (layout/visual behavior)
- `<name>.actions.js` (event wiring)
- `<name>.controls.js` (factory helpers)
- `<name>.css` (styles)

### ui-registry
Use `web/ui/ui-registry.js` to register components:
```js
import { registerComponent } from '../ui/ui-registry.js';
export function initializeDevPanel(engine, DOM) { /* ... */ }
registerComponent('dev-panel', initializeDevPanel);
```

## 8. Video Subsystem: The Adaptive Frame Processing Pipeline

The video subsystem captures and analyzes camera input using an intelligent, performance-aware architecture.

### Core Architecture
*   **VideoSourceFactory:** Creates frame capture strategy based on device capabilities (ADR-0011)
*   **FrameConductor:** Manifest-driven worker lifecycle manager and orchestrator
*   **FrameProcessor (`frame-processor.js`):** Thin coordinator, delegates to mode strategies
*   **Specialist Workers:** `fast-motion-worker.js` (Flow), `depth-worker.js` (Focus)
*   **Grids:** "Sonic Sculptors" that translate spatial data to music

### 8.1 Video Source Selection (Nov 2025)
Users can select video frame capture source via Dev Panel:
- **Auto:** System selects best available (GPU preferred)
- **GPU (MediaStreamTrackProcessor):** Hardware-accelerated, Chrome/Edge/Brave
- **CPU (Canvas2D):** Universal fallback, works on all browsers

State field: `state.videoCapture.preferredSource`

### 8.2 Worker Chain Configuration NEED IMPROVEMENT
The Dev Panel exposes manifest-driven worker chain controls:
- **Chain Presets:** Full (all workers), Minimal (motion→pan), Zone-Only (motion→zone)
- **Custom:** Individual worker toggles for debugging
- **Latency Budget:** Real-time display showing total worker latency vs 16.6ms budget

State field: `state.orchestration.videoWorkerDebugConfig`

### 8.3 Depth Worker
Uses a hybrid architecture:
1. **CNN Path (GPU-Accelerated):** WebGPU compute shaders for 2D convolution (primary).
2. **Pseudo-Depth Path (CPU-Only):** Sobel edge detection (fallback).

### 8.4 Paradigm-Aware Grid Configuration
Grid sizing adapts to mode:
- Flow: 3×3 (Low latency)
- Focus: 8×8 (High detail)
- Hybrid: 5×5 (Balanced)

**Stateless Pattern:** Workers receive grid config with every frame; no stored state.

## 9. Audio Subsystem: The Adaptive Conductor
Orchestrated by `audio-processor.js`.
- **Flow Mode:** Continuous, textural soundscapes.
- **Focus Mode:** Discrete, specific "AcousticCues".

## 10. Performance Management: AutoFPS
A closed-loop feedback system:
1. **FrameProvider**: Tags frames with `startTime`.
2. **Sonification**: Measures end-to-end duration.
3. **Diagnostics**: Collects stats in `RingBuffer`.
4. **Scheduler**: Triggers checks.
5. **Adjustment**: Throttles FrameProvider if latency is high.

## 11. Guardrails — What Not To Do
- Do not add business logic to `core/engine.js`.
- Do not import UI modules into `core/` (enforced via lint).
- Do not create manual frame loops (use FrameProvider).
- Do not use `console.*` for logic (use `structuredLog`).
- UI modules must assume `audioContext` starts suspended.

## 12. CSS & Layout Rules
- UI modules must load CSS via `<link>` and layout in `onload`.
- Use scoped IDs and classes.

## 13. Error Reporting and Logging
- Use `structuredLog(level, message, meta)` for all logic.
- High-frequency logs (per-frame) must be sampled (1% or less).
- Critical systems (Audio) must fail loudly, not silently.

## 14. Testing & CI
- Unit tests required for core command handlers.
- UI smoke tests required for each module.
- Linting rules enforce core/ui boundaries.

## 15. Recent Architectural Lessons
- **Oscillator Pool:** Pool contains *unconnected* oscillators. Synths must connect and start them.
- **Karplus-Strong:** Feedback gain must be < 0.95 to prevent runaway resonance.
- **Worker Messages:** Must always include a `type` field.

## 16. Accessibility & Internationalization
- All interactive elements need ARIA attributes and keyboard access.
- Text must be extracted to `web/languages/`.

## 17. Versioning & Releases
- Expose `BUILD_VERSION` in `web/core/constants.js`.
- Maintain changelog.

## 18. Enforcement
- CI lint rules fail builds on core -> ui imports.
- Tests must assert UI `dispose()` cleanup.

## 19. Runtime basePath detection
- `main.js` establishes `basePath` at startup to support GitHub Pages subdirectories.
- Dynamic loaders must use `basePath` to constructing worker/asset URLs.

## 20. Logging Architecture
- **Ring Buffer:** Single source of truth for logs (`utils/core-logger.js`).
- **Levels:** ERROR, WARN, INFO, DEBUG (sampled).
- **Persistance:** WARN/ERROR saved to IndexedDB.
