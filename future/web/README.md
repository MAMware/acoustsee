# AcoustSee

AcoustSee is an open-source framework that runs as a web application designed to help blind and visually impaired individuals perceive their surroundings through sound. It uses a device's camera and translates visuals into real-time, informative soundscapes.

The project is built with a focus on accessibility, performance, and extensibility, using vanilla JavaScript and modern browser APIs to run efficiently on a wide range of devices, especially mobile phones.

## Core Features

- **Real-Time Motion Sonification:** Translates visual motion into musical, tonal and sound cues.
- **Multiple Operating Modes:** Flow Mode for spatial awareness and Focus Mode for detailed object identification and hybrid for automatic mode change (WIP).
- **Pluggable UI Architecture:** Features distinct interfaces for different user needs.
- **Gesture-Based Accessible UI:** A fully non-visual interface designed for blind users.
- **Developer Panel (Dev Panel):** A comprehensive tool for sighted developers and testers to iterate and debug quickly. (Historically called "Debug UI"; the codebase now exposes it under `ui/dev-panel/`.)
- **High-Performance Engine:** Uses a Web Worker to offload heavy processing, ensuring a smooth and responsive UI.
- **Extensible:** Easily add new musical grids, sound synths, or languages.

## Getting Started

## How to Use

AcoustSee has two primary user interfaces.

### 1. The Accessible UI (Default)

`http://mamware.github.io/acoustsee/future/web/index.html`

This is the core experience for the end-user. The screen is an input surface, not a display. All interaction is through gestures and audio feedback.

#### Gestures (Live Mode)

- **Single Tap:** Start or stop the motion detection and sound generation.
- **Double Tap:** Announce a summary of the current status (e.g., "Status is Live. Grid is Circle of Fifths...").
- **Triple Tap:** Send a diagnostic report. This feature helps developers fix bugs by sending the application's internal logs and state.
- **Long Press (1 second):** Enter or exit Settings Mode.

#### Gestures (Settings Mode)

- **Swipe Left / Right:** Cycle through the available settings categories (e.g., Grid, Sound, Language, Motion Sensitivity).
- **Swipe Up / Down:** Change the value for the currently selected category.
- **Long Press (1 second):** Exit Settings Mode and automatically save your changes.

### 2. The Dev Panel (For Developers & Testers)

This UI is a powerful dashboard for development and testing. It is enabled by the `?debug=true` query param.

**How to Activate:**
Add `?debug=true` to the end of the URL.
Example: `http://mamware.github.io/acoustsee/future/web/index.html?debug=true`

**Features:**
- **Live Video Feed:** See what the camera sees.
- **State Inspector:** A live, pretty-printed view of the application's entire state object.
- **Live Log Viewer:** A real-time stream of application logs (powered by the `ui/log-viewer.js` utility).
- **Console & Error Ingest:** The dev-panel uses `ui/console-ingest.js` to capture console messages and uncaught errors into the log viewer; this is optionally installed by the panel.
- **Interactive Controls:**
    - Dropdowns to select the musical grid and synth engine.
    - Sliders to adjust `Max Notes` and `Motion Threshold`.
    - Checkboxes to toggle `Auto FPS`, the `Web Worker`, and `Buffer Transfer` for performance testing.
    - Buttons to `Start/Stop Processing` and `Save/Load` settings to/from localStorage.

**Developer notes:**
- The dev-panel module registers its initializer with the `ui-registry` at `ui/ui-registry.js` so the bootloader and other modules can find and open the panel without relying on global functions.
- If you need to access the dev-panel initializer programmatically, import `getComponent('dev-panel')` from the registry.

## Architecture Overview

The application is built on a decoupled, headless architecture.

- **`main.js`:** The entry point that initializes the system and loads the appropriate UI. Startup sequence: Engine creation → Config loading → **Language initialization (`await initializeLanguage(state)`)** → UI rendering.
- **`core/engine.js`:** A "headless" state machine that manages all application logic via a command pattern. It has no knowledge of the DOM.
- **`video/frame-processor.js`:** The Orchestrator that manages the video pipeline and delegates to Specialist Workers.
- **`workers/frame-provider-worker.js`:** The entry point for camera data, running its own `requestAnimationFrame` loop.
- **`workers/motion-worker.js` (and others):** Specialist Workers for analysis tasks like motion detection.
- **`audio/audio-processor.js`:** Manages the Web Audio API, sound profiles, and synths.
- **`ui/` directory:** Contains pluggable UI modules (e.g., `touch-gestures/` for accessible UI, `dev-panel/` for debugging).
- **`languages/`:** Internationalization (i18n) system with pre-bundled `en-US` fallback. Language initialization is awaited during startup to prevent race conditions.

## Critical Integration Rules

**These rules prevent bugs. Read ARCHITECTURE_RULES.md for detailed explanations.**

### Module Import Rules (Dependency Flow)

| Module |  Can Import From |  Cannot Import From |
|--------|------------------|----------------------|
| `main.js` | core/, audio/, video/, ui/, utils/ | (entry point) |
| `core/` | utils/, state.js | audio/, video/, ui/ |
| `audio/` | utils/, core/state.js | video/, ui/, core/* (except state.js) |
| `video/` | utils/, core/state.js | audio/, ui/, core/* (except state.js) |
| `ui/` | utils/ (injected), engine (injected) | core/, audio/, video/ |

**Why?** Prevents circular dependencies and maintains clean separation of concerns.

### Object Identity (CRITICAL)

Never use spread operator (`...`) on state objects. State mutations must preserve object identity:

```javascript
//  WRONG:
return { ...existingState, newField };  // Creates new object

//  CORRECT:
existingState.newField = value;
return existingState;  // Same object
```

**Recent Bug:** Grid Type dropdown was empty because `mergeOrchestrationState()` created a new object with spread operator. When `main.js` set `settings.availableGrids`, the engine didn't see it (different object).

### State Factory Pattern (Nov 18: Fixed)

State is no longer exported as a live object. Instead, `state.js` exports a factory function:

```javascript
//  OLD (BYPASSED):
import { settings } from './core/state.js';
settings.gridType = 'hex';  // Direct mutation - bypasses engine!

//  NEW (ENFORCED):
// state.js exports:
export function createInitialState() { return { gridType: 'hex', ... } }

// Access state only through engine:
const state = engine.getState();           // Read
engine.setState({ gridType: 'square' });   // Mutate through engine
engine.dispatch('setGridType', { gridType: 'square' });  // Via commands
```

**Why?** Prevents state bypass anti-pattern. All mutations now go through the engine's command system, ensuring proper logging, telemetry, and Single Source of Truth.

### Initialization Order (CRITICAL)

In `main.js`, follow this sequence exactly:

1. Create engine
2. Merge orchestration state
3. Load async resources (grids, capabilities)
4. **Register ALL command handlers**
5. Initialize subsystems (audio, video)
6. Initialize UI modules
7. Setup event listeners

**Why?** Resources must be in state before UI init. Handlers must be registered before dispatch calls.

### Dependency Injection (REQUIRED for UI Modules)

UI modules must receive dependencies as parameters, not import them:

```javascript
//  WRONG:
import { engine } from '../core/engine.js';

//  CORRECT:
export function initializeMyUI(engine, DOM) {
  // Use injected engine
}
```

For detailed information, see **`ARCHITECTURE_RULES.md`** in this directory.

## Contributing

This project is open-source and contributions are welcome. To add a new grid, synth, or language, add the corresponding file in the `video/grids/`, `audio/synths/`, or `utils/` directory and ensure it integrates with the command handlers and registries.

---

