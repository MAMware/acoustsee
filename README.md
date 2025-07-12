# AcoustSee

**a photon to phonon code**


## [Introduction](#introduction)

This repository contains a web application that transforms visual environments into intuitive soundscapes through a synesthetic process. By converting visual data into real-time synthetic audio cues, the platform empowers users to experience and interact with the visual world in an innovative auditory format.

### Project Vision

Synesthetic Translation: Transforms visual data into real-time stereo audio cues, mapping by sound signatures.

> **Why?** We believe in solving real problems with open-source software in a fast, accessible, and impactful way. You are invited to join us to improve and make a difference!

### Tech stack needed

Platform to run the code: Mobile phone since it is web-based application accessible via browser and algorythm is coded without need for internet access and lightweight (only 72kB)
Input: Mobile camera for real-time visual data capture.
Audio Output: Stereo headphones for spatial audio effects.

### Hipothetic Use Case

Launch the app on a mobile device to translate live camera input into a dynamic stereo soundscape. For a visually impaired user in a park, the phone, worn as a necklace, captures visuals like a swing in motion. As the swing moves away, the app produces a softer, simpler sound; as it approaches, the sound grows louder and more complex. Similarly, a sidewalk might emit a steady, textured tone, a car in the distance a low hum, and a wall to the left a localized sound in the left ear. This enables users to perceive and interact with their surroundings through an innovative auditory interface, fostering greater independence and environmental awareness.

### Development

Entirely coded by xAI Grok 3 to Milestone 4 as per @MAMware prompts 
Milestone 5 wich is a work in progress got a little help from OpenAI ChatGPT 4.1 via @github copilot at codespaces
Research drafts are going to be feed into Grok 4 for a surprise next step ;)

We are ready to welcome contributors from open source community to enhace perception!. 

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

- https://mamware.github.io/acoustsee/past/web

Unstable versions currently being developed and about to be tested can be found at

- https://mamware.github.io/acoustsee/future/web


### Check [Usage](docs/USAGE.md) for further details

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
