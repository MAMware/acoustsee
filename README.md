**a photon to phonon code**

## [Introduction](#introduction)

The content in this repository builds a web app that aims to transform visual environments into soundscapes, by doin this the users to experience the visual world by synthetic audio cues in real time.

> **Why?** We believe in building open-source software that aims to improve quality of life in a accessible and impactful way. You are invited to join us to improve its mission and make a difference!

### Project Vision

- Synesthetic Translation: Converting visual data into stereo audio cues, mapping motion to distinct sound signatures.
- Dynamic Soundscapes: Adjusts audio in real time based on object distance and motion, e.g., a swing’s sound shifts in volume and complexity as it moves.
- Location-Aware Audio: Enhances spatial awareness by producing sounds in the corresponding ear, such as a wall on the left sounding in the left ear.

### System requeriments

The software is designed to run in a web browser from year 2021 and up.
This design is tested with a mobile phone front camera as input and outputs stereo audio to headphones for the spatial audio effects.

### Hipothetic Use Case

Launch the app on a mobile device to translate live camera input into a dynamic stereo soundscape. For a visually impaired user in a park, a mobile phone camera captures surrounding visuals. i.e. a swing in motion, as the swing moves away the app produces a softer, simpler sound; as it approaches, the sound grows louder and more complex. Similarly, a sidewalk might emit a steady, textured tone, a car in the distance a low hum, and a wall to the left a localized sound in the left ear. This enables users to perceive and interact with their surroundings through an innovative auditory interface, fostering greater independence and environmental awareness.

### Development

````
Milestone 4 from 0 was exclusively coded by xAI Grok 3 as per @MAMware instructions.
Milestone 5 Grok and MAMware found themself into a debbugin rabbit hole that looked like dog chasing its own tail so we seeled for help from Gemini 2.5 pro, OpenAI ChatGPT 4.1 & 04-mini and Anthropic Claude 4.
Milestone 6 is being developed at github.dev, Grok.com is acting as the project manager in charge of the restructuring from v0.6. Gemini 2.5 pro is used for a tiny amount of reviews and ChatGPT is acting as agent at VS Codespaces.
````

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

Ths webapp is built to run from a internet browser, its developed mobile hardware contraints in care and should run with operating systems ranging from 2021 and up.

- Current version [RUN](https://mamware.github.io/acoustsee/present/)
- Previous versions [RUN](https://mamware.github.io/acoustsee/past/old_versions/preview)
- Test version in development [RUN](https://mamware.github.io/acoustsee/future/web)

### Check [Usage](docs/USAGE.md) for further details

### [Current Status](#status) 

Working at **Milestone 6**

- UI Detached from the core logic to enable customization of skins
- Adding support for new video and audio techniques
- Strict architectural paradigm to no hardcoding and no fallbacks
- Adhering the dispatcher to single resonsability principle
- Tweaks and bugfixing here and there
 
### [Changelog](docs/CHANGELOG.md)

- Current "stable" version from "present" is v0.4.7, the link above logs the history and details past milestones achieved.
- Current "future" version in development starts from v0.6 

### [v0.5 Project structure](#project_structure)

```

web/
├── audio/                    # Audio synthesis/processing (notes-to-sound, HRTF, mic)
│   ├── audio-controls.js     # PowerOn/AudioContext init
│   ├── audio-manager.js      # AudioContext management
│   ├── audio-processor.js    # Core audio (oscillators, playAudio, cleanup; integrates HRTF/ML depth)
│   ├── hrtf-processor.js     # HRTF logic (PannerNode, positional filtering)
│   └── synths/               # Synth methods (extend with HRTF)
│       ├── sine-wave.js
│       ├── fm-synthesis.js
│       └── available-engines.json
├── video/                    # Video capture/mapping (camera-to-notes/positions; includes ML depth)
│   ├── video-capture.js      # Stream setup/cleanup
│   ├── frame-processor.js    # Frame analysis (emits notes/positions; calls ML if enabled)
│   ├── ml-depth-processor.js # New: Monocular depth estimation 
│   └── grids/                # Visual mappings 
│       ├── hex-tonnetz.js
│       ├── circle-of-fifths.js
│       └── available-grids.json
├── core/                     # Orchestration (events, state)
│   ├── dispatcher.js         # Event handling 
│   ├── state.js              # Settings/configs 
│   └── context.js            # Shared refs
├── ui/                       # Presentation (buttons, DOM; optional ML/HRTF toggles)
│   ├── ui-controller.js      # UI setup
│   ├── ui-settings.js        # Button bindings 
│   ├── cleanup-manager.js    # Teardown listeners
│   └── dom.js                # DOM init
├── utils/                    # Cross-cutting tools (TTS, haptics, logs)
│   ├── async.js              # Error wrappers
│   ├── idb-logger.js         # Persistent logs
│   ├── logging.js            # Structured logs
│   └── utils.js              # Helpers (getText, ...)
├── languages/                # Localization (add ML/HRTF strings)
│   ├── es-ES.json
│   ├── en-US.json
│   └── available-languages.json
├── test/                     # Tests (grouped by category)
│   ├── audio/                # Audio/HRTF tests
│   │   ├── audio-processor.test.js
│   │   └── hrtf-processor.test.js
│   ├── video/                # Video/grid/ML tests
│   │   ├── frame-processor.test.js
│   │   └── ml-depth-processor.test.js  # New: Test depth estimation
│   ├── core/                 # Dispatcher/state tests (if added)
│   ├── ui/                   # UI tests
│   │   ├── ui-settings.test.js
│   │   └── video-capture.test.js
│   └── utils/                # Utils tests (if added)
├── .eslintrc.json            # Linting
├── index.html                # HTML entry
├── main.js                   # Bootstrap (update imports for moves/ML init)
├── README.md                 # Docs (update structure/ML/HRTF)
└── styles.css                # Styles

```

### [Contributing](docs/CONTRIBUTING.md)

- Please follow the link above for the detailed contributing guidelines, branching strategy and examples.

### [To-Do List](docs/TO_DO.md)

- (outdated) At this document linked above, you will find the list for our current TO TO list, now from milestone 5 (v0.5.2)

### [Code flow diagrams](docs/DIAGRAMS.md) 


- (outdated) Diagrams covering the Turnk Based Development approach (v0.2). 

Reflecting:  
  - Process Frame Flow
  - Audio Generation Flow
  - Motion Detection such as oscillator logic.

### [FAQ](docs/FAQ.md)

- Follow the link for list of the Frecuently Asqued Questions.

### [License](docs/LICENSE.md)

## Licensing

AcoustSee is available under two distinct licenses, allowing you to choose the one that best suits your needs.

**1. Open Source License (GPL-3.0)**

This project is licensed under the **GNU General Public License v3.0**.

This means that while you are free to use, share, and modify this software for open-source projects, academic research, and personal use. Any derivative work must also be licensed under the GPL-3.0 and you must provide the complete corresponding source code. 


**2. Commercial License**

The terms of the GPL-3.0 are not suitable if you want to integrate AcoustSee into a proprietary, closed-source commercial product, for that use a commercial license is available from us.

A commercial license exempts you from the "share-alike" requirements of the GPL and allows for private, commercial use.

**To inquire about purchasing a commercial license, contact us**.

For full details, see the [LICENSE.md](LICENSE.md) file.


## Usage analytics

**Privacy, Analytics, and Your Control**

To build the best possible version of AcoustSee, we need to understand how it's being used in the real world. For this purpose, the application collects a small amount of completely anonymous usage data when it starts. This data is vital for helping us prioritize new features, fix bugs, and ensure compatibility.

**What This Means for You**
When the app loads, it sends a single, anonymous data packet to our secure analytics endpoint. This is a one-time event per session and is designed to have zero impact on performance or your experience.

**Our Data Promise:**
We are only interested in statistical trends, not individuals.
*   **Data We Collect:** A random session ID (which is deleted when you close your tab), your browser's language, your device type (mobile/desktop), and the app version.
*   **Data We Never Collect:** Your IP address, location, browser history, or any other personally identifiable information. We do not use cookies or any form of persistent tracking.

**Your Control**
We believe you should have the final say over your data. While this anonymous data is incredibly helpful to the project, we provide an option to disable it in the application's settings.

The entire process is open and transparent. The code that sends this data can be reviewed in `web/main.js`. We are committed to ethical analytics and protecting your privacy.

  
*Peace.*
**Love.**
*Union.*
**Respect.**


