**photon to phonon code**

## [Introduction](#introduction)

The content in this repository builds a web app and provides a public working platform code that transform a visual environment into a soundscape, empowering the user to experience the visual world by synthetic audio cues in real time.

> **Why?** We believe in solving real problems with open-source software in a fast, accessible, and impactful way. You are invited to join us to improve and make a difference!

### Project Vision

- Synesthetic Translation: Converts visual data into stereo audio cues, mapping colors, motion to distinct sound signatures.
- Dynamic Soundscapes: Adjusts audio in real time based on object distance and motion, e.g., a swing’s sound shifts in volume and complexity as it moves.
- Location-Aware Audio: Enhances spatial awareness by producing sounds in the corresponding ear, such as a wall on the left sounding in the left ear.

### Tech stack needed

Platform to run the code: 

- Image processing: Mobile phone from year 2020 and up with a web browser and a camera, the algorithm is coded without need for internet access and weights only 72kB.
- Audio output: Stereo headphones.

### Hipothetic Use Case

Launch the app on a mobile device to translate live camera input into a dynamic stereo soundscape. For a visually impaired user in a park, the phone, worn as a necklace, captures visuals like a swing in motion. As the swing moves away, the app produces a softer, simpler sound; as it approaches, the sound grows louder and more complex. Similarly, a sidewalk might emit a steady, textured tone, a car in the distance a low hum, and a wall to the left a localized sound in the left ear. This enables users to perceive and interact with their surroundings through an innovative auditory interface, fostering greater independence and environmental awareness.
>>>>>>> v0.5-dinamicLoading

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

- Current version [RUN](https://mamware.github.io/acoustsee/present/)
- Previous versions [RUN](https://mamware.github.io/acoustsee/past/old_versions/preview)
- In development [RUN](https://mamware.github.io/acoustsee/future/web)

### Check [Usage](docs/USAGE.md) for further details

### [Status](#status) 

Working on **Milestone 5 (Current)**

- Haptic feedback via Vibration API **Developing in Progress**
- Console log on device screen and mail to feature for debuggin. **Developing in Progress**
- New languajes agnostic architecture ready to provide multilingual support for the speech sinthetizer and UI  **Developing in Progress**
- Audio imput from camera into the headphones among the synthetized sound from camera. **Developing in Progress**
- Further Modularity **Developing in Progress**
- Mermaid diagrams to reflect current Modular Single Responsability Principle **To do**

 
### [Changelog](docs/CHANGELOG.md)

- Current "stable" version is v0.4.7, follow link above for a the history change log, details and past milestones achieved.

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
