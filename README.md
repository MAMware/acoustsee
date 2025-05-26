# AcoustSee

**a photon to phonon code**


## [Introduction](#introduction)

AcoustSee is an open-source project kickstarted by MAMware and coded entirely by xAI Grok with the aim to transform visual environments into intuitive soundscapes,  empowering the user to experience the visual world by audio cues.

First we (Grok and I) tested the concept with a Python script and still image, once validated we moved to do the processing of a live video with Hilbert curves inspired by 3Blue1Brown (the great Grant Sanderson), among with te idea to take the advantaje of Head-Related Transfer Function (HRTF) to create spatial awarenes that maps objects positons into distinct sounds. 

This project was entirely coded by Grok at both grok.com and x.com and we’re also sharing the step-by-step journey (conversation) to inspire others to contribute to accessibility tech.

> **Why?** We believe in solving real problems with open-source software in a fast, accessible, and impactful way. You are invited to join us to improve and make a difference!

### Project Vision

Imagine a person who is unable to see and it is sitting at a park, with headphones on, wich are paired to a mobile phone. This phone is being weared like a necklage with the camera facing a quiet swing, where children are playing, as the seat of the swing gets back/further the sound generator makes a sound spectra that has less harmonics content and wen it swings closer its spectra complexity raises. 

This kickstart aims to make this imagination a reality and we first started a prof of concept using static images to a tone that identified right or left location. The python version is deprecated and was only a proof of concept. We are currently working on live video webapp. Expanding and optimizing to mobile operating systems in the near future will be considered too.

## Table of Contents

- [Introduction](#introduction)
- [Installation](docs/INSTALL.md)
- [Usage](#usage)
- [Status](#status)
- [Project structure](#project_structure)
- [Changelog](docs/CHANGELOG.md)
- [Contributing](docs/CONTRIBUTING.md)
- [To-Do List](docs/TO_DO.md)
- [Diagrams](docs/DIAGRAMS.md)
- [License](docs/LICENSE.md)
- [FAQ](docs/FAQ.md)

### [Installation](docs/INSTALL.md)

The latest best performer can be run without installation directly from 

- https://mamware.github.io/acoustsee/web

For a mobile browser compability follow the #install link (docs/INSTALL.md) there you also find instruccion to run the first prof of concept made with Python

### [Usage](#usage)

- Enter https://mamware.github.io/acoustsee/web

- The webapp is designed with a mobile phone as main tech stake use case where its front camera (and screen) are facing the desired objetive to be transformed in to sound.

- The User Interface of the webapp is split into five regions, a top border rectangle where a settings button is and a bottom border rectangle where the start and stop navigation toggle is.

- Also there are big rectangular buttons at the left and right border of the device where the left (right if device is being weared for navigation) swichets betten day (or high light ambience) and night (or low light ambience). The right buttom switches between languajes.

- The settings button toggles the funcion of the left and right button into advances options, like grid selector and synthesis method. 
  
- The processing of the camera is done privately on your device and not a single frame has to be sent outside your device, still a permision to access the camera by the browser will be requested by the browser to do the local processing of the webcam data into generating the audio for the navigation.

Having the most up to date version of mobile web browsers is diserable, yet most mobile internet browsers from 2021 should work, for a detailed list see
(docs/INSTALL.md) 


### [Status](#status)

**Milestone 4 (Current)**: **Work in Progress**  

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
├── .github/workflows/         
│   └── deploy.yml             # GitHub Actions for deployment (deprecated)
├── web/                       # Modular webapp
│   ├── index.html
│   ├── styles.css
│   ├── main.js
│   ├── state.js
│   ├── audio-processor.js
│   ├── grid-selector.js
│   ├── ui/
│   │   ├── rectangle-handlers.js # Handles settingsToggle, modeBtn, languageBtn, startStopBtn
│   │   ├── trapezoid-handlers.js # Handles settingsToggle, modeBtn, languageBtn, startStopBtn (deprecated)
│   │   ├── settings-handlers.js  # Manages gridSelect, synthesisSelect, languageSelect, fpsSelect
│   │   ├── frame-processor.js    # Processes video frames (processFrame)
│   │   ├── templates.js          # Generates UI elements (e.g., select dropdowns) DEPRECATED
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
│   ├── INSTALL.md
│   ├── CHANGELOG.md
│   ├── CONTRIBUTING.md
│   ├── TO_DO.md
│   ├── DIAGRAMS.md
│   ├── LICENSE.md
│   └── FAQ.md
├── history/               # Deprecated files
├── garbage/               # Temporal files to be deleted
└── README.md

```

### [Contributing](docs/CONTRIBUTING.md)

- Please follow the link above for the detailed contributing guidelines, branching strategy and examples.

### [To-Do List](docs/TO_DO.md)

- At this document linked above, you will find the list for current TO TO list, we are now at milestone 4 (v0.9)

Resume of TO_DO:

- Mermaid diagrams to reflect current Modular Single Responsability Principle
- Further Modularity: e.g., modularize audio-processor.js
- New languajes for the speech sinthetizer
- Haptic feedback via Vibration API
- Console log on device screen for debuggin.
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

### [Code flow diagrams](docs/DIAGRAMS.md) 

- Diagramas covered the Turnk Based Development approach wich as been now deprecated. Still, you will find there the past Process Frame Flow, Audio Generation Flow and Motion Detection such as oscillator logic at:

https://github.com/MAMware/acoustsee/blob/main/docs/DIAGRAMS.md

### [License](docs/LICENSE.md)

- GPL-3.0 license details
  
### [FAQ](docs/FAQ.md)

- Follow the link for list of the Frecuently Asqued Questions.
