## [Introduction](#introduction)

### Project Vision

The content at this repository builds a web app that aims to transform visual environments into intuitive soundscapes to experience the visual world by synthetic audio cues. Converting the visual data into stereo audio cues by adjusting the audio in real time generating dynamic soundscapes such as mapping motion into distinct sound signatures.
 

> We believe that software should be built with the aim of improving the quality of life. Enhancing humanity with open-source software in an accessible and impactful way seems the right thing to do. You are welcomed to join us to improve this mission!


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

- Current version [RUN](https://mamware.github.io/acoustsee/present/)
- Previous versions [RUN](https://mamware.github.io/acoustsee/past/old_versions/preview)
- Test version in development [RUN](https://mamware.github.io/acoustsee/future/web)

### System requirements

The software is designed to run from most mobile web browsers, doing a processing of the video camera privately on the device, it generates spatial audio effects to stereo headphones.

### Hypothetical Use Case

Launch the app from a web browser to translate live its camera input into a dynamic stereo soundscape.
As the camera captures its surrounding visuals. i.e. a swing in motion as it swings away the app could produce a softer, simpler sound; as it approaches, the sound could grow louder in a more complex way. Similarly, a sidewalk might emit a steady, textured tone, a car in the distance a low hum, a wall to the left a localized sound for the left ear. This should enable the users to perceive their surroundings through an innovative auditory interface, fostering greater independence and environmental awareness.

### [Current Status](#status) 

### Development

````
Milestone 0 to 4, vibecoded xAI Grok 3 
Milestone 5,  vibecoded with SuperGrok 4 with assistance from Gemini 2.5 pro, OpenAI ChatGPT 4.1 & 04-mini and Anthropic Claude 4.
Milestone 6,  vibecoding with Gemini 2.5 pro  and ChatGPT 
````

Working at **Milestone 6**

- UI Detached from the core logic to enable customization of skins
- Adding support for new video and audio techniques
- Strict architectural paradigm to no hardcoding and no fallbacks
- Tweaks and bugfixing here and there


>We welcome contributors! 

 
### [Changelog](docs/CHANGELOG.md)

- Current "stable" version from "present" is v0.4.7, the link above logs the history and details past milestones achieved.
- Current "future" version in development starts from v0.6 

### [v0.6 Project structure, work in progress](#project_structure)

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
- The delopment mantra is: No fallbacks, No magic numbers, Clean up the left overs


### [To-Do List](docs/TO_DO.md)

- Refactoring Plan 

- Starting from v0.6 (milestone 6) we are adhering the `//core/dispatcher.js` to a single responsability principle, the folder `core` should keep hyphenated names and we should clean leftovers `//core/dispatcher.js` and export objects (e.g., `videoHandlers`) with handler functions

```
web/
├── core/                 # Orchestration hub, including handlers
│   ├── handlers/
│   │   ├── video-handlers.js
│   │   ├── audio-handlers.js
│   │   ├── ui-handlers.js
│   │   ├── settings-handlers.js
│   │   ├── grid-handlers.js
│   │   └── debug-handlers.js
│   ├── dispatcher.js
│   ├── state.js
│   └── context.js
├── index.html
└── ... (audio/, video/, etc.)
```

'../cleanup-manager.js'; 

The idea behind pulling out a “cleanup manager” into its own module is simply separation of concerns. Till milestone 5 the dispatcher and UI‐handler code are doing three things at once:

• Routing events (e.g. “teardownUI”)
• Manipulating DOM elements (adding/removing listeners, cleaning up nodes)
• Keeping track of which listeners have been registered

By moving all of the actual listener‐teardown logic into a cleanup-manager.js we:

Keep our handlers focused purely on “which event do I fire” instead of “how do we undo that wiring.”
Give ourselves a single place to track, batch, and test tear-down routines (so we don’t accidentally leave stray listeners around).
Make it far easier to extend or change our UI teardown process in one spot (for example if we swap from native event handlers to a virtual-DOM framework).
In short the dispatcher and handlers decide what needs to happen, and cleanup‐manager.js encapsulates how you actually detach everything.

````
// web/core/handlers/audio-handlers.js
    // TODO: wire up note synthesis logic (e.g., playAudio)
    // TODO: apply HRTF using PannerNode or hrtf-processor
````
````
// web/core/handlers/settings-handlers.js
    // TODO: read settings from state/localStorage
    // TODO: write newSettings to state/localStorage
````
````
// web/core/handlers/grid-handlers.js
    // TODO: set gridType in settings and trigger grid rendering
````    
````
// web/core/handlers/ui-handlers.js
    // TODO: wire up button UI updates
    // TODO: remove UI event listeners, cleanup DOM
    // cleanupAllListeners(context);

````

````
// web/core/handlers/debug-handlers.js` 
  // TODO: 

Separation of concerns
• Good: You’ve pulled out “logEvent” and “inspectState” so that your dispatcher doesn’t need to know the details of how debugging works.
• Could improve: Rather than calling getLogs().then(console.log), consider returning a promise or emitting a structured debug event—this makes it easier to build UIs or remote‐ship logs instead of only dumping to the console.

Consistency with your logging/telemetry layer
• Right now you mix structuredLog('DEBUG', …) with a raw console.log. If you already have a telemetry/IndexedDB pipeline in telemetry.js or state.js, lean on that so your debug output goes through the same filters/formatters and obeys your debugLogging flag.

Naming and API shape
• logEvent({ event }) overlaps conceptually with your existing structuredLog; it may be redundant unless you’re transforming or storing the event somewhere different.
• inspectState({ context }) never uses context—either remove the unused parameter or allow callers to pass a callback/context for more flexible introspection (e.g. UI dialog vs console).

Extensibility
• If you ever want live debugging tools (hot toggles, wire up a REPL in the page, remote debug), you’ll want a richer API than just two methods. Think about returning structured objects or exposing hooks for subscribers rather than only side-effects.

The next step is to align them more closely with your existing telemetry/logging infrastructure, tighten up their API (parameters, return values), and ensure they’re genuinely adding value beyond what structuredLog already gives us.
````




### [Code flow diagrams](docs/DIAGRAMS.md) 

- Current work in progress at `//core/dispatcher.js`

```
graph TD
    A[dispatcher.js] -->|routes| B[core/handlers/]
    B --> C[video-handlers.js]
    B --> D[audio-handlers.js]
    B --> E[ui-handlers.js]
    B --> F[settings-handlers.js]
    B --> G[grid-handlers.js]
    B --> H[debug-handlers.js]
    C -->|calls| I[video/frame-processor.js]
    D -->|calls| J[audio/audio-processor.js]
    E -->|updates| K[ui/ui-settings.js]
    F -->|uses| L[utils/utils.js]
    A -->|state| M[state.js]
    A -->|logs| N[utils/logging.js]
    B -->|future| O[ml-handlers.js]
````

- Early stage diagrams covering the Trunk Based Development approach (v0.2) can be found at the link from above, reflecting:  
  - Process Frame Flow
  - Audio Generation Flow
  - Motion Detection such as oscillator logic.


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

To build the best possible version of AcoustSee, we need to understand how it's being used in the real world. For this purpose, the application collects a small amount of completely anonymous usage data. This data is vital for helping us prioritize new features, fix bugs, and ensure compatibility.

**What This Means for You**
When the app loads, it sends anonymous data packets to our secure cloudfare analytics endpoint. This is a one-time event per session and is designed to have zero impact on performance or your experience.

**Our Data Promise:**
We are only interested in statistical trends, not individuals.
*   **Data We Collect:** A random session ID (which is deleted when you close your tab), your browser's language, your device type (mobile/desktop), and the app version.
*   **Data We Never Collect:** Your IP address, location, browser history, or any other personally identifiable information. We do not use cookies or any form of persistent tracking.

**Your Control**
We believe you should have the final say over your data. While this anonymous data is incredibly helpful to the project, we provide an option to disable it in the application's settings.

The entire process is open and transparent. The code that sends this data can be reviewed in `core/telemetry.js`. We are committed to ethical analytics and protecting your privacy.

### [FAQ](docs/FAQ.md)

- Follow the link for list of the Frecuently Asqued Questions.

 
## Plugin contract & audio lifecycle

This project supports pluggable synth and grid modules. Add the following short guidelines for plugin authors and integrators:

- PLUGIN-META: place a JSON metadata block at the top of the plugin file inside a comment so the indexer can extract it without executing the module. Example:

    ```js
    /* PLUGIN-META
    {
        "id": "sine-wave",
        "name": "Sine Wave",
        "author": "You",
        "description": "Simple sine-wave engine",
        "version": "0.1.0"
    }
    */
    ```

- Synth engines: export a play function with the signature `export function play(notes, ctx = {})`.
    - `notes` is an array of note objects (engine-specific).
    - `ctx` is an audio runtime object provided by the app. Engines should read audio resources from `ctx` and must NOT create their own `AudioContext` or global oscillator pools.
    - Minimum fields to expect on `ctx` (check for presence): `audioContext`, `getOscillator`, `oscillatorPool`, and `modulators`.

- Grids: export a mapping function that converts frame data into engine inputs. Use the same `ctx` pattern when audio resources are needed.

- Lifecycle: the shared `AudioManager` owns the `AudioContext` and user-gesture unlock/resume. The app exposes it via `DOM.audioManager`. Bind to it using `bindAudioManager()` from `audio-processor` or reference `DOM.audioManager` directly in early initialization code.

- Best practices: be defensive (check for missing `ctx.audioContext`), avoid long-running initialization in top-level module execution, and keep plugins dependency-free at runtime.

*Peace.*
**Love.**
*Union.*
**Respect.**