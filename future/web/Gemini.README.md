# AcoustSee

AcoustSee is an open-source web application designed to help blind and visually impaired individuals perceive their surroundings through sound. It uses a device's camera to detect motion and translates it into a real-time, informative soundscape.

The project is built with a focus on accessibility, performance, and extensibility, using vanilla JavaScript and modern browser APIs to run efficiently on a wide range of devices, especially mobile phones.

## Core Features

- **Real-Time Motion Sonification:** Translates visual motion into musical and tonal cues.
- **Pluggable UI Architecture:** Features two distinct interfaces for different user needs.
- **Gesture-Based Accessible UI:** A fully non-visual interface designed for blind users.
- **Powerful Debug UI:** A comprehensive tool for sighted developers and testers to iterate and debug quickly.
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

### 2. The Debug UI (For Developers & Testers)

This UI is a powerful dashboard for development and testing.

**How to Activate:**
Add `?debug=true` to the end of the URL.
Example: `http://mamware.github.io/acoustsee/future/web/index.html?debug=true`

**Features:**
- **Live Video Feed:** See what the camera sees.
- **State Inspector:** A live, pretty-printed view of the application's entire state object.
- **Live Log Viewer:** A real-time stream of application logs.
- **Interactive Controls:**
    - Dropdowns to select the musical grid and synth engine.
    - Sliders to adjust `Max Notes` and `Motion Threshold`.
    - Checkboxes to toggle `Auto FPS`, the `Web Worker`, and `Buffer Transfer` for performance testing.
    - Buttons to `Start/Stop Processing` and `Save/Load` settings to/from localStorage.

## Architecture Overview

The application is built on a decoupled, headless architecture.

- **`main.js`:** The entry point that initializes the system and loads the appropriate UI.
- **`core/engine.js`:** A "headless" state machine that manages all application logic via a command pattern. It has no knowledge of the DOM.
- **`video/frame-processor.js`:** Manages the high-performance Web Worker.
- **`workers/frame-worker.js`:** The off-thread powerhouse where all heavy pixel analysis (motion detection, adaptive thresholding) happens.
- **`audio/audio-processor.js`:** Manages the Web Audio API, oscillator pools, and sound generation.
- **`ui/` directory:** Contains the "pluggable" UI modules (`accessible-ui.js` and `debug-ui.js`).

## Contributing

This project is open-source and contributions are welcome. To add a new grid, synth, or language, simply add the corresponding file in the `grids/`, `synth/`, or `languages/` directory and run the `file-indexer.js` script to automatically integrate it into the application.

---

