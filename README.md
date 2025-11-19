# AcoustSee

An open-source computer vision sound synthetizer framework designed to help blind and visually impaired individuals perceive their surroundings through sound. It uses a device's camera and translates visuals into real-time, informative soundscapes.

The project is built with a focus on accessibility, performance, and extensibility, using vanilla JavaScript and modern browser APIs to run efficiently on a wide range of devices, especially mobile phones.

## Architecture Delta (v0.9.5)

- State Factory pattern adopted: all state created via `createInitialState()`, no direct state imports/exports.
- Audio lifecycle simplified: `AudioManager` creates `AudioContext` eagerly; power-on resumes + initializes synthesis; `engine.audioApi` assigned after init only.
- Strict audio requirement: commands fail loudly when audio is unavailable; language subsystem degrades gracefully (returns key).
- Explicit logging: no console hijacking; use `structuredLog` directly.

## Core Features

- **Real-Time Motion Sonification:** Translates visual motion into musical, tonal and sound cues.
- **Dual Operating Modes:** Flow Mode for spatial awareness and Focus Mode for detailed object identification.
- **Pluggable UI Architecture:** Features distinct interfaces for different user needs.
- **Gesture-Based Accessible UI:** A fully non-visual interface designed for blind users.
- **Developer Panel (Dev Panel):** A comprehensive tool for sighted developers and testers to iterate and debug quickly. (Historically called "Debug UI"; the codebase now exposes it under `ui/dev-panel/`.)
- **High-Performance Engine:** Uses a Web Worker to offload heavy processing, ensuring a smooth and responsive UI.
- **Extensible:** Easily add new musical grids, sound synths, or languages.

## Getting Started

- Serve the web app from `future/web/` (any static file server).
- Open the app and click the `Power` button to unlock audio (browser requirement). This resumes the AudioContext and initializes synthesis.
- Optional: add `?debug=true` to enable the Dev Panel.

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

- **`main.js`:** The entry point that initializes the system and loads the appropriate UI. It constructs `AudioManager` at startup and assigns `engine.audioApi` only after the power-on unlock + synthesis initialization completes.
- **`core/engine.js`:** A headless state machine using a command pattern and a factory-created state (`createInitialState()`). The engine is the single source of truth; no direct state imports/exports.
- **`video/frame-processor.js`:** The orchestrator that manages the video pipeline (FrameConductor + specialists) and emits audio cues only when `engine.audioApi` is ready.
- **`audio/audio-manager.js`:** Eagerly creates the `AudioContext` at startup (fail-fast). Power-on resumes the context.
- **`audio/audio-processor.js`:** Synthesis conductor. After initialization it returns the `audioApi` surface (`playCues`, `resizeOscillatorPool`, `setSelectedSynthEngine`).
- **`ui/` directory:** Pluggable UIs (e.g., `touch-gestures/` for accessible UI, `dev-panel/` for debugging).

## Educational Resources

### Semantic Detection Guide

Learn how AcoustSee performs lightweight, heuristic-based object detection without machine learning:

- **[Semantic Detection: Educational Guide to Computer Vision in AcoustSee](./docs/SEMANTIC_DETECTION_GUIDE.md)** — A comprehensive walkthrough of detection methods (person, tree, rough_ground, trash, box), the algorithms behind them (Gabor filters, optical flow, edge detection), and how to extend the system for student projects and research.

This is perfect for educators and students learning computer vision fundamentals without the complexity of neural networks.

## Contributing

This project is open-source and contributions are welcome. To add a new grid, synth, or language, add the corresponding file in the `video/grids/`, `audio/synths/`, or `utils/` directory and ensure it integrates with the command handlers and registries.

---

P.L.U.R.