**a photon to phonon code**

## [Introduction](#introduction)

The content in this repository builds a web app and provides the code for a public working platform that transform visual environments into a soundscapes, thus empowering the user to experience a visual world by synthetic audio cues in real time.

> **Why?** We believe in enhancing humanity with open-source software in a fast, accessible and impactful way. You are invited to join us to improve its mission and make a difference!

### Project Vision

- Synesthetic Translation: Converting visual data into stereo audio cues, mapping colors, motion to distinct sound signatures.
- Dynamic Soundscapes: Adjusts audio in real time based on object distance and motion, e.g., a swing’s sound shifts in volume and complexity as it moves.
- Location-Aware Audio: Enhances spatial awareness by producing sounds in the corresponding ear, such as a wall on the left sounding in the left ear.

### Tech stack needed

Run the version of your choice in any internet browser from year 2020 and up.
The design is tested with a mobile phone anda its front camera
Input: Mobile camera for real-time visual data capture.
Audio Output: Stereo headphones for spatial audio effects.

### Hipothetic Use Case

Launch the app on a mobile device to translate live camera input into a dynamic stereo soundscape. For a visually impaired user in a park, the phone, worn as a necklace, captures visuals like a swing in motion. As the swing moves away, the app produces a softer, simpler sound; as it approaches, the sound grows louder and more complex. Similarly, a sidewalk might emit a steady, textured tone, a car in the distance a low hum, and a wall to the left a localized sound in the left ear. This enables users to perceive and interact with their surroundings through an innovative auditory interface, fostering greater independence and environmental awareness.

### Development

Entirely coded by xAI Grok 3 to Milestone 4 as per @MAMware prompts 
Milestone 5 wich is a work in progress got a little help from OpenAI ChatGPT 4.1 via @github copilot at codespaces
Research drafts are going to be feed into Grok 4 for a surprise next step ;)

>We welcome contributors! 

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

The webapp runs from a Internet browsers and mobile hardware from 2021.

- Current version [RUN](https://mamware.github.io/acoustsee/present/)
- Previous versions [RUN](https://mamware.github.io/acoustsee/past/old_versions/preview)
- Testing developments [RUN](https://mamware.github.io/acoustsee/future/web)

### Check [Usage](docs/USAGE.md) for further details

### [Current Status](#status) 

Working at **Milestone 5 (Current)**

- Haptic feedback via Vibration API **Developing in Progress** 
- Console log on device screen and mail to feature for debuggin. **Developing in Progress**
- New languajes agnostic architecture ready to provide multilingual support for the speech sinthetizer and UI  **Developing in Progress**
- Audio imput from camera into the headphones among the synthetized sound from camera. **Developing in Progress**
- Further Modularity **Developing in Progress**
- Mermaid diagrams to reflect current Modular Single Responsability Principle **To do**
 
### [Changelog](docs/CHANGELOG.md)

- Current "stable" version from "present" is v0.4.7, link above logs the history and details past milestones achieved.

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

- At this document linked above, you will find the list for our current TO TO list, now from milestone 5 (v0.5.2)

### [Code flow diagrams](docs/DIAGRAMS.md) 

Diagrams covering the Turnk Based Development approach (v0.2). 

Reflecting:  
  - Process Frame Flow
  - Audio Generation Flow
  - Motion Detection such as oscillator logic.

### [FAQ](docs/FAQ.md)

- Follow the link for list of the Frecuently Asqued Questions.

### [License](docs/LICENSE.md)

- GPL-3.0 license details
  
MAKE LOVE NOT WAR
