# AcoustSee

An open-source computer vision sound synthetizer framework designed to help blind and visually impaired individuals perceive their surroundings through sound. It uses a device's camera and translates visuals into real-time, informative soundscapes.

The project is built with a focus on accessibility, performance, and extensibility, using vanilla JavaScript and modern browser APIs to run efficiently on a wide range of devices, especially mobile phones.

## Core Features

- **Real-Time Motion Sonification:** Translates visual motion into musical, tonal and sound cues.
- **Dual Operating Modes:** Flow Mode for spatial awareness and Focus Mode for detailed object identification.
- **Pluggable UI Architecture:** Features distinct interfaces for different user needs.
- **Gesture-Based Accessible UI:** A fully non-visual interface designed for blind users.
- **Developer Panel (Dev Panel):** A comprehensive tool for sighted developers and testers to iterate and debug quickly. (Historically called "Debug UI"; the codebase now exposes it under `ui/dev-panel/`.)
- **High-Performance Engine:** Uses a Web Worker to offload heavy processing, ensuring a smooth and responsive UI.
- **Extensible:** Easily add new musical grids, sound synths, or languages.

## Getting Started

## How to Use

AcoustSee primary developer interface.

### 2. The "Developer Panel" (For Developers & Testers)

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

- **`main.js`:** The entry point that initializes the system and loads the appropriate UI.
- **`core/engine.js`:** A "headless" state machine that manages all application logic via a command pattern. It has no knowledge of the DOM.
- **`video/frame-processor.js`:** The Orchestrator that manages the video pipeline and delegates to Specialist Workers.
- **`workers/frame-provider-worker.js`:** The entry point for camera data, running its own `requestAnimationFrame` loop.
- **`workers/motion-worker.js` (and others):** Specialist Workers for analysis tasks like motion detection.
- **`audio/audio-processor.js`:** Manages the Web Audio API, sound profiles, and synths.
- **`ui/` directory:** Contains pluggable UI modules (e.g., `touch-gestures/` for accessible UI, `dev-panel/` for debugging).

## Contributing

This project is open-source and contributions are welcome. To add a new grid, synth, or language, add the corresponding file in the `video/grids/`, `audio/synths/`, or `utils/` directory and ensure it integrates with the command handlers and registries.

---

P.L.U.R.