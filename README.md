**a photon to phonon code**

## [Introduction](#introduction)

The content in this repository builds a web app and provides a public working platform about code that aims to transform a visual environment into a soundscape, empowering the user to experience the visual world by synthetic audio cues in real time.

> **Why?** We believe in solving real problems with open-source software in a fast, accessible, and impactful way. You are invited to join us to improve and make a difference!

### Project Vision

- Synesthetic Translation: Converts visual data into stereo audio cues, mapping colors, motion to distinct sound signatures.
- Dynamic Soundscapes: Adjusts audio in real time based on object distance and motion, e.g., a swing’s sound shifts in volume and complexity as it moves.
- Location-Aware Audio: Enhances spatial awareness by producing sounds in the corresponding ear, such as a wall on the left sounding in the left ear.

- Tech stack: Mobile phone and headphones
- Use: Run the app to translate images into a stereo soundscape, where i.e.: a sidewalk that the user is waling on could have a distintive spectral signature with location awaresness modeling, a wall at the left with its charecteristical different spectra should make its  distintive sound signature in your left ear. A car, a bag on the floor and so on with its own char sound.

>Launch the app on a mobile device to translate live camera input into a dynamic stereo soundscape. The phone camera captures visuals changes to motion a sound synthetizer. As dinamics settle get quieter as the app produces a softer, simpler sound; as it approaches, the sound grows louder and more complex. Similarly, a work in progress is to make ie: a sidewalk that might emit a steady, textured tone, a car in the distance a low hum, and a wall to the left a localized sound in the left ear. This enables users to perceive and interact with their surroundings through an innovative auditory interface, fostering greater independence and environmental awareness.

So far, the first four milestones are coded entirely coded by xAI Grok 

We are ready to welcome contributors from open source community to enhace perception. 

## Table of Contents

- [Introduction](#introduction)
- [Usage](docs/USAGE.md)
- [Status](#status)
- [Project structure](#project_structure)
- [Changelog](docs/CHANGELOG.md)
- [Contributing](docs/CONTRIBUTING.md)
- [To-Do List](docs/TO_DO.md)
- [Diagrams](docs/DIAGRAMS.md)
- [License](docs/LICENSE.md)
- [FAQ](docs/FAQ.md)

### [Usage](docs/USAGE.md)

To use it, having the most up to date version of mobile web browsers is diserable yet most mobile internet browsers from 2021 should work.

The latest stable proof of concept can be run from 

- https://mamware.github.io/acoustsee/present

Previous versions and other approachs can be found at

- https://mamware.github.io/acoustsee/past

Unstable versions currently being developed and about to be tested can be found at

- https://mamware.github.io/acoustsee/future



For a complete mobile browser compability list check the doc [Usage](docs/USAGE.md) where also you can find instruccions to run the command line Python version.

### Hardware needed:

A mobile phone/cellphone from 2021 and up, with a front facing camera and stereo headphones with mic.

### Steps to initialize

- The webapp is designed to be used with a mobile phone where its front camera (and screen) are facing the desired objetive to be transformed in to sound, wearing the mobile phone like a necklage is its first use case in mind.

- Enter https://mamware.github.io/acoustsee/present  (or your version of preference from [Usage](docs/USAGE.md))

- The User Interface of the webapp is split into five regions,
  - Center rectangle: Audio enabler, a touchplace holder that enables the webpage to produce sound. 
  - Top border rectangle: Settings SHIFTer button 
  - Bottom rectangle: Start and Stop button 
  - Left rectangle: Day and night switch for light logic inversion
  - Right rectangle: Languaje switcher
  - SHIFTed left rectangle (settings enabled): Grid selector, changes how the camera frames or "grids" the environment
  - SHIFTed right rectangle (settings enabled): Audio engine selector, changes how the sound synthetizer reacts to the selected grid.   

IMPORTANT: The processing of the camera is done privately on your device and not a single frame is sent outside your device processor. A permision to access the camera by the browser will be requested in order to do this local processing and thus generate the audio for the navigation.

### [Status](#status) 

**Milestone 4 (Current)**: **Developing in Progress**  at /future folder from developing branch

- Current effort is at setting the repository with the most confortable structure for developers, with niche experts in mind, to have a fast way to understand how we do what we do and be able to contribute in a fast and simple way.
- We should refactor dependencies, isolate the audio pipeline and decouple UI and logic.
- Make WCAG contrast UI.
- Code should be educational purpose ready (JSDoc)
  
### [Changelog](docs/CHANGELOG.md)

- Current version is v0.4.7, follow link above for a the history change log, details and past milestones achieved.

### [Project structure](#project_structure)

```

acoustsee/

├── present/                      # Current Stable Modular Webapp
│   ├── index.html
│   ├── styles.css
│   ├── main.js
│   ├── state.js
│   ├── audio-processor.js
│   ├── grid-selector.js
│   ├── ui/
│   │   ├── rectangle-handlers.js # Handles settingsToggle, modeBtn, languageBtn, startStopBtn
│   │   ├── settings-handlers.js  # Manages gridSelect, synthesisSelect, languageSelect, fpsSelect
│   │   ├── frame-processor.js    # Processes video frames (processFrame)
│   │   └── event-dispatcher.js   # Routes events to handlers
│   └── synthesis-methods/
│       ├── grids/
│       │   ├── hex-tonnetz.js
│       │   └── circle-of-fifths.js
│       └── engines/
│           ├── sine-wave.js
│           └── fm-synthesis.js
│   
├── tests/                     # Unit tests (TO_DO)
│   ├── ui-handlers.test.js
│   ├── trapezoid-handlers.test.js
│   ├── settings-handlers.test.js
│   └── frame-processor.test.js
├── docs/                      # Documentation
│   ├── USAGE.md
│   ├── CHANGELOG.md
│   ├── CONTRIBUTING.md
│   ├── TO_DO.md
│   ├── DIAGRAMS.md
│   ├── LICENSE.md
│   └── FAQ.md
├── past/                     # Historic folder for older versions.
├── future/                   # Meant to be used for fast, live testing of new features and improvements
└── README.md

```

### [Contributing](docs/CONTRIBUTING.md)

- Please follow the link above for the detailed contributing guidelines, branching strategy and examples.

### [To-Do List](docs/TO_DO.md)

- At this document linked above, you will find the list for current TO TO list, we are now at milestone 4 (v0.4.X)

Resume of TO_DO:

- Haptic feedback via Vibration API 
- Console log on device screen and mail to feature for debuggin. 
- New languajes for the speech sinthetizer
- Audio imput from camera into the headphones among the synthetized sound from camera.
- Further Modularity: e.g., modularize audio-processor.js
- Optimizations aiming the use less resources and achieve better performance, ie: implementing Web Workers and using WebAssembly.
- Reintroducing Hilbert curves.
- Gabor filters for motion detection.
- New grid types and synth engines
- Voting system for grid and synth engines.
- Consider making User selectable synth engine version.
- Consider adding support for VST like plugins.
- Testing true HRTF, loading CIPIC HRIR data.
- New capabilities like screen/video capture to sound engine.
- Android/iOS app developtment if considerable performance gain can be achieved.
- Mermaid diagrams to reflect current Modular Single Responsability Principle

### [Code flow diagrams](docs/DIAGRAMS.md) 

Diagrams covering the Turnk Based Development approach. 

Reflecting:  
  - Process Frame Flow
  - Audio Generation Flow
  - Motion Detection such as oscillator logic.

### [License](docs/LICENSE.md)

- GPL-3.0 license details
  
### [FAQ](docs/FAQ.md)

- Follow the link for list of the Frecuently Asqued Questions.
