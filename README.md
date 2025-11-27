# AcoustSee

Is an open-source computer vision sound synthetizer framework designed to help blind and visually impaired user perceive their surroundings through sound. 
It uses a device's camera and translates visuals into real-time, informative soundscapes.

The project is built with a focus on performance and extensibility using vanilla JavaScript to run efficiently on a wide range of devices, especially on mobile phones.

## Core Features

- **Real-Time Motion Sonification:** Translates visual motion into musical, tonal and sound cues.
- **Multi Operating Modes:** Flow Mode for spatial awareness and Focus Mode for detailed object identification.
- **Pluggable UI Architecture:** Features distinct interfaces for different user needs.
- **Developer Panel:** A comprehensive tool for sighted developers and testers to iterate and debug quickly. 
- **High-Performance Engine:** Uses a Web Worker to offload heavy processing, ensuring a smooth and responsive UI.
- **Extensible:** Easily add new video grids, sound synths, or languages.

## Getting Started

### How to Use

**The "Developer Panel"** (For Developers & Testers)

This UI is a powerful dashboard for development and testing. 

**How to Activate:**

Link: `http://mamware.github.io/acoustsee/future/web/index.html`

**Special Features:**

- **State Inspector:** A live, pretty-printed view of the application's entire state object.
- **Live Log Viewer:** A real-time stream of application logs (powered by the `ui/log-viewer.js` utility).
- **Console & Error Ingest:** The dev-panel uses `ui/console-ingest.js` to capture console messages and uncaught errors into the log viewer; this is optionally installed by the panel.

## Contributing

Contributions are very much welcome! 

---

P.L.U.R.
