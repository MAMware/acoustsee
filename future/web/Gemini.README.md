# AcoustSee

AcoustSee is an open-source framker that runs a into a web application designed to help blind and visually impaired individuals perceive their surroundings through sound. It uses a device's camera and translates visuals into a real-time, informative soundscapes.

The project is built with a focus on accessibility, performance, and extensibility, using vanilla JavaScript and modern browser APIs to run efficiently on a wide range of devices, especially mobile phones.

## Core Features

- **Real-Time Motion Sonification:** Translates visual motion into musical, tonal and sound cues.
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
- **Live Log Viewer:** A real-time stream of application logs (powered by the `web/ui/log-viewer.js` utility).
- **Console & Error Ingest:** The dev-panel uses `web/ui/console-ingest.js` to capture console messages and uncaught errors into the log viewer; this is optionally installed by the panel.
- **Interactive Controls:**
    - Dropdowns to select the musical grid and synth engine.
    - Sliders to adjust `Max Notes` and `Motion Threshold`.
    - Checkboxes to toggle `Auto FPS`, the `Web Worker`, and `Buffer Transfer` for performance testing.
    - Buttons to `Start/Stop Processing` and `Save/Load` settings to/from localStorage.

**Developer notes:**
- The dev-panel module registers its initializer with the `ui-registry` at `web/ui/ui-registry.js` so the bootloader and other modules can find and open the panel without relying on global functions.
- If you need to access the dev-panel initializer programmatically, import `getComponent('dev-panel')` from the registry.

## Architecture Overview

The application is built on a decoupled, headless architecture.

- **`main.js`:** The entry point that initializes the system and loads the appropriate UI.
- **`core/engine.js`:** A "headless" state machine that manages all application logic via a command pattern. It has no knowledge of the DOM.
- **`video/frame-processor.js`:** Manages the high-performance Web Worker.
- **`workers/frame-worker.js`:** The off-thread powerhouse where all heavy pixel analysis (motion detection, adaptive thresholding) happens.
- **`audio/audio-processor.js`:** Manages the Web Audio API, oscillator pools, and sound generation.
- **`ui/` directory:** Contains the "pluggable" UI modules (`accessible-ui.js` and `dev-panel/`).

## Contributing

This project is open-source and contributions are welcome. To add a new grid, synth, or language, simply add the corresponding file in the `grids/`, `synth/`, or `languages/` directory and run the `file-indexer.js` script to automatically integrate it into the application.

---

