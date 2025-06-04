# AcoustSee

**a photon to phonon code**


## [Introduction](#introduction)

AcoustSee is an open-source project kickstarted with its first milestones coded entirely by xAI Grok with the aim to transform a visual environments into a intuitive soundscape thus  mpowering the user to experience the visual world just by audio cues.

> **Why?** We believe in solving real problems with open-source software in a fast, accessible, and impactful way. You are invited to join us to improve and make a difference!

### Project Vision

Synesthesia is the translation from a visual to a sound, with this concept in mind my approach was to aid a user in real time by taking a camera imput into a just a soundscape, where a sidewalk could have a distintive soundscape being heard at both hear, a wall at the left being hear with another distintive sound at the left ear, a car, a hole... a light... and so on... you catch where im going? No?, lets try further.

Imagine a person that is unable to see, sitting at a park with headphones on and paired to a mobile phone. This phone is being weared like a necklage with the camera facing a quiet swing, as the seat of the swing gets back/further the sound generator makes a sound spectra that has less harmonics content, lower volume and wen it swings closer its spectra complexity raises. 

This project aims to make this imagination into a reality. 
First started a prof of concept using static images to a tone that identified right or left location and now we are currently working on live videofeed web app. 


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

The latest stable version can be run from 

- https://mamware.github.io/acoustsee/present

Previous versions can be found at

- https://mamware.github.io/acoustsee/past

Unstable versions currently being developed can be found at

- https://mamware.github.io/acoustsee/future

Having the most up to date version of mobile web browsers is diserable, yet most mobile internet browsers from 2021 should work.

For a mobile browser compability follow [Usage](docs/USAGE.md) there you also find instruccion to run the first prof of concept made with Python

### Harware needed:


A mobile phone/cellphone with a front camera

### Steps to initialize

- The webapp is designed to be used with a mobile phone where its front camera (and screen) are facing the desired objetive to be transformed in to sound.

- Enter https://mamware.github.io/acoustsee/present  (or your version of preference)

- The User Interface of the webapp is split into five regions, a top border rectangle where the settings button is and a bottom rectangle where the start and stop navigation toggle is.

- There are big rectangular buttons at the side too, the left is the sensivity inverter and right cicles between languajes.

- The settings button toggles the funcion of the left and right button into advances options, like grid selector for the left and synthesis method for the right. 
  
IMPORTANT: The processing of the camera is done privately on your device and not a single frame has or is sent outside your device. A permision to access the camera by the browser will be requested in order to do the local processing and thus generate the audio for the navigation.

### [Status](#status) at developing branch

**Milestone 4 (Current)**: **Work in Progress**  /future

- New user interface with selectable grid and synth engine
- Adding Spanish to the speech sinthetizer 
- Modular V3, educational purpose ready (JSDoc)
- Splited the UI Logic, breaking ui-handlers.js into smaller modules to isolate trapezoid button handlers, settings dropdowns, and frame processing.
- WCAG Contrast UI.
- Dynamic memplates, creating templates.js module to generate UI elements  programmatically, reducing HTML duplication.
- Centralized event management, introduced an event-dispatcher.js to route UI events to specific handlers, improving scalability.

### [Changelog](docs/CHANGELOG.md)

- Current version is v0.9.7, follow link above for a log history, details and past milestones

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
├── past/                     # Historic repository, older versions.
├── future/                   # Meant to be used for fast, live testing of new features and improvements
└── README.md

```

### [Contributing](docs/CONTRIBUTING.md)

- Please follow the link above for the detailed contributing guidelines, branching strategy and examples.

### [To-Do List](docs/TO_DO.md)

- At this document linked above, you will find the list for current TO TO list, we are now at milestone 4 (v0.9)

Resume of TO_DO:

- Haptic feedback via Vibration API (in progress at v0.9.8.8)
- Console log on device screen and mail to feature for debuggin. (in progress at v0.9.8.8)
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

### [FAQ](docs/FAQ.md)

- Follow the link for list of the Frecuently Asqued Questions.
