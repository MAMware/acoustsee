# AcoustSee Architecture Guide

This document defines the architectural contracts, patterns, and guardrails for AcoustSee. Follow these rules for all contributions.

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

## 5. Directory Responsibilities
- `web/core/` — state machine, command registration, headless business logic.
- `web/core/commands/` — grouped command implementations (media, settings, debug, performance).
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

## 8. Video Subsystem: The Dynamic Frame Processing Pipeline

The video subsystem captures and analyzes camera input. Its behavior adapts based on the current operating mode.

*   **Entry Point:** `video/frame-processor.js` (`processFrameWithState`) remains the entry point.
*   **In Flow Mode:** The pipeline uses lightweight, high-performance algorithms (e.g., motion detection, coarse luma-based analysis) to generate abstract data for the audio engine.
*   **In Focus Mode:** The pipeline engages advanced ML models to perform tasks like object segmentation and depth estimation, producing rich, semantic `cues`.
*   **Output Contract:** The subsystem's output is always an array of `cues`, but the content and richness of these cues will differ significantly between modes.

## 9. Audio Subsystem: The Adaptive Conductor

The audio subsystem, orchestrated by the `playCues` "Conductor," translates `cues` into sound. Its output also adapts to the current operating mode.

*   **The Conductor Pattern:** The core pattern remains the same: `playCues` maps `cues` to synthesizers via the `sound-profiles.js` manifest.
*   **In Flow Mode:** It generates continuous, textural, and abstract soundscapes designed for spatial awareness. Synthesizers used in this mode are optimized for responsiveness and clarity.
*   **In Focus Mode:** It generates discrete, specific, and recognizable sounds ("AcousticCues") that correspond to identified objects. The sound profiles for this mode are semantically rich (e.g., a glass synth for a `glass` objectType).

## 10. Guardrails — What Not To Do
- Do not add business logic to `core/engine.js`.
- Do not import UI modules into `core/` — enforce via lint rule.
- Avoid fragile DOM access by index; prefer data-action attributes and delegation.
- Avoid creating global IDs without module prefix.
- Avoid starting polling/intervals without exposing a dispose that stops them.

## 11. CSS & Layout Rules
- UI modules must load CSS via a `<link>` element and do layout in `link.onload`.
- Use a consistent stylesheet path resolution strategy (absolute or `document.baseURI`-aware`).
- Controls should use responsive two-column grids where appropriate.

## 12. Error Reporting and Logging
- Core: structured logging (level, message, meta). Command handlers should use structured log helpers.
- UI: non-blocking user notifications for errors; log to debug console pane.
- Each UI module should log its module load with version badge: `console.log('module loaded', BUILD_VERSION)` when available.

## 13. Testing & CI
- Unit tests required for core command handlers and audio processor logic.
- UI smoke tests (headless/browser) required for each UI module (e.g., Playwright or Puppeteer).
- Linting rules must enforce core/ui import boundaries.
- PRs must include tests for new command handlers or UI behaviors.

## 14. Accessibility & Internationalization
- All interactive elements must provide keyboard access and ARIA attributes.
- Text must be extracted into `web/languages/` and UIs must support locale injection.

## 15. Versioning & Releases
- Expose BUILD_VERSION in `web/core/constants.js`. UIs should display the version badge.
- Keep changelog entries for architectural changes.

## 16. Onboarding & Maintenance
- Each UI folder must contain a README describing its public API and lifecycle (initialize + dispose).
- Keep a small architectural checklist in `docs/ARCHITECTURE_CHECKLIST.md` that PR reviewers use.

## 17. Enforcement
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
