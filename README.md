# AcoustSee

**a photon to phonon code**


## [Introduction](#introduction)

AcoustSee is an open-source project kickstarted by MAMware and coded by xAI Grok with the aim to transform visual environments into intuitive soundscapes,  empowering the user to experience the visual world by audio cues.

First we tested the concept with a Python script and still image, once validated we moved to do the processing of a live video with Hilbert curves inspired by 3Blue1Brown (the great Grant Sanderson), among with te idea to take the advantaje of Head-Related Transfer Function (HRTF) to create spatial awarenes that maps objects positons into distinct sounds. 

This project was entirely coded by Grok at grok.com and x.com and we’re also sharing the step-by-step journey (conversation) to inspire others to contribute to accessibility tech.

> **Why?** We believe in solving real problems with open-source software in a fast, accessible, and impactful way. You are invited to join us to improve and make a difference!

### Project Vision

Imagine a person who is unable to see and is sitting at a park, with headphones on wich are paired to a mobile phone. This phone is being weared like a necklage with the camera facing a quiet swing, where children are playing, as the seat of the swing gets back/further the sound generator makes a sound spectra that has less harmonics content and wen it swings closer its spectra complexity raises. 

This kickstart aims to make a reality, we first started a prof of concept with static images in the python version and currently we moved to live video for a web version. Expanding and optimizing to mobile operating systems in the near future is also desired.

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

The current best performer can be run without installation from 
- https://mamware.github.io/acoustsee/web
to test other versions pelase refer to install docs at
- https:/www.github.com/MAMware/acoustsee/docs/INSTALL.md

### [Usage](#usage)

Dispite that al processing the is done in your device and not a single bit of data is sent outside your device, a permision to access the camera by the browser will be requested and only used by such browser in order to do the local processing of the webcam data generating the audio for the navigation.

Having the most up to date version of mobile web browsers is diserable. 

Minimum version list (most from 2021 should work):

| Browser             | Minimum Version for Full Support   | Notes                                                                          |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| Chrome for Android  | Chrome 47 (December 2015)          | Full support for getUserMedia, AudioContext, and createStereoPanner.           |
| Safari on iOS       | iOS 14.5 (Safari 14.1, April 2021) | Supports unprefixed AudioContext and createStereoPanner. No vibration support. |
| Firefox for Android | Firefox 50 (November 2016)         | Full support for all APIs, though SpeechSynthesis may be inconsistent.         |
| Samsung Internet    | Samsung Internet 5.0 (2017)        | Based on Chromium, full support for all APIs.                                  |
| Opera Mobile        | Opera 36 (2016)                    | Based on Chromium, full support for all APIs.                                  |
| Edge for Android    | Edge 79 (January 2020)             | Based on Chromium, full support for all APIs.                                  |


The User Interface of the webapp is split in four parts. 
The lower half is dedicated for the start and stop of the navigation at the left of the device (right hand of the user if it is being wear as intenteded) and the right is dedicated to the languaje selection for the speech sinthetizer, 
The top right is for the day/night toggle and the top left is the frames per seconds (FPS) toggle that is usefull if your device stutters or generates artifacts due to processing issues, likely by a cpu processor limitation. 
A log view and copy feature is being considered at the moment.

Most up to date and best performer is located at - 
 https://mamware.github.io/acustsee/web

Privacy Note: All of the video processing is done at your device, not a single frame or any kind of data is sent to anyone or anywhere.

### [Status](#status)

**Milestone 1**: (Completed)

- Proof of Concept. A Python code that handles statics image from an example folder and successfully generates a WAV file with basic stereo audio, left/right, panning.

**Milestone 2**: (Completed) 

- Minimun Viable Product. A javascript web version, to process privately the user live video feed, framing a "Hilbert curve" (it was a simplified zig zag) and synthetised sound from it trying to emulate a head related transfer function.

**Milestone 3 (Current)**:
**Work in Progress**  

- Testing different approachs and with fast, raw iterations. The subfolders fft, htrf, tonnetz sections each approach.  
- Current selected main soundscape generator comes from the Euler Tonnetz approach where the video frame split into left/right halves, mapped to the hexagonal Euler Tonnetz grid (32x32 per half, 2048 notes total).
- Has a day/night mode that inverts sound generation given the lighting conditions.
- Sounds synthesis engine aims to approach real-time 50ms updates (toggleable to 100ms, 250ms) and up to 16 notes per side (32 total).
- UI: Centered video, split the remaining screen into 3 sections, being the lower half for the start/top, to upper div has settings a the left for FPS and at next to it, at the right is the day/night toggle, (working on it).

**Milestone 4 (Planned)**:

- Detailed performance analisis and sectioned metrics.
- Optimizations aiming the use of less resources and better performance.

Consider:
- Performance optimization for the web such as Web Workers and WebAssembly.
- Testing true HRTF.
- Gabor filters for motion detection.
- Reintroducing Hilbert curves.
- Android/iOS app developtment if considerable performance gain can be achieved.


## [Project structure](#project_structure)

```
acoustsee/
├── src/                       # Contains the Python PoC code for still image processing and audio generation.
├── web/                       # Contains HTML, CSS, and JavaScript files for the web interface folder for different approaches at the core logic
│   ├── fft/                   # Experimenting with Fourier, fast. 
│   │    ├── index.html
│   │    ├── main.js
│   │    ├── styles.css
│   ├── hrft/                  # Experimenting the Head Related Transfer Function
│   │    ├── index.html
│   │    ├── main.js
│   │    ├── styles.css
│   ├── tonnetz/               # Experimenting with Euler, Tonnetz.
│   │    ├── index.html
│   │    ├── main.js
│   │    ├── styles.css
│   ├── index.html             # The current chosen version as a better performer (Tonnetz, 5/18/2025).
│   ├── main.js
│   ├── styles.css
├── examples/                  # Still image and output container for the Python PoC
├── tests/                     # Should contain unit tests (currently missing)
├── docs/                      # Contains technical documentation (working)
│    ├── DIAGRAMS.ms           # Wireframes the logic at main.js
└── README.md                  # This file, providing an overview of the project
```

### [Changelog](docs/CHANGELOG.md)

- Current version is v0.7, follow the changelog link for log history and details

### [Contributing](docs/CONTRIBUTING.md)

- Please follow the link for the detailed contributing guidelines, branching strategy and examples.

### [To-Do List](docs/TO_DO.md)

- At this document you will find the list for current to do wich is now from milestone 4.

### [Code flow diagrams](docs/DIAGRAMS.md)

- Process Frame Flow, Audio Generation Flow and Motion Detection such as oscillator logic.

https://github.com/MAMware/acoustsee/blob/main/docs/DIAGRAMS.md

### [License](docs/LICENSE.md)

- GPL-3.0 license details
  
### [FAQ](docs/FAQ.md)

- Follow the link for list of the Frecuently Asqued Questions.
  

