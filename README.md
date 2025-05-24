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

The current best performer can be run without installation from 

- https://mamware.github.io/acoustsee/web

### [Usage](#usage)

Dispite that al processing the is done in your device and not a single bit of data is sent outside your device, a permision to access the camera by the browser will be requested and only used by such browser in order to do the local processing of the webcam data generating the audio for the navigation.

Having the most up to date version of mobile web browsers is diserable. 

Most internet browsers from 2021 should work, following is a detailed list:

| Browser             | Minimum Version for Full Support   | Notes                                                                          |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| Chrome for Android  | Chrome 47 (December 2015)          | Full support for getUserMedia, AudioContext, and createStereoPanner.           |
| Safari on iOS       | iOS 14.5 (Safari 14.1, April 2021) | Supports unprefixed AudioContext and createStereoPanner. No vibration support. |
| Firefox for Android | Firefox 50 (November 2016)         | Full support for all APIs, though SpeechSynthesis may be inconsistent.         |
| Samsung Internet    | Samsung Internet 5.0 (2017)        | Based on Chromium, full support for all APIs.                                  |
| Opera Mobile        | Opera 36 (2016)                    | Based on Chromium, full support for all APIs.                                  |
| Edge for Android    | Edge 79 (January 2020)             | Based on Chromium, full support for all APIs.                                  |


The webapp is designed (meant) to be used with a mobile phone where its front camera and screen should be facing to desired objetive to be transformed in to sound.

The User Interface of the webapp (should be) is split into for isoceles trapezoids and center vertical rectangle. 

The top trapezoid is (should be) where the setting toggle is, this toggle shifts the function of the lateral trapezoid a the left (dayNight toggle without shift) and right (languaje selectror for speech synthesis) for a cursor for options navigation such as grid and synth engine both versioned selector.

The confirmation is done by pressing the center vertical rectagunlar square, that also works as webcam feed preview/canvas

The start and stop of the navigation is donde by pressing the buttom trapezoid.

A reintroduction of a frames per seconds (FPS) toggle that is usefull if your device stutters or generates artifacts due to processing issues, likely by a cpu processor limitation will be reconsidered as a configuration option, among the grid and synth engine selector.

A console log live view and a copy feature is being considered too.

Most up to date and best performer is located at - 

https://mamware.github.io/acustsee/web

Privacy Note: All of the video processing is done at your device, not a single frame is sent to anyone or anywhere than that the ones that takes places at your own device processing logic.

### [Status](#status)

**Milestone 1**: (Completed)

- Proof of Concept. A Python code that handles statics image from an example folder and successfully generates a WAV file with basic stereo audio, left/right, panning.

**Milestone 2**: (Completed) 

- Minimun Viable Product. A javascript web version, to process privately the user live video feed, framing a "Hilbert curve" (it was a simplified zig zag) and synthetised sound from it trying to emulate a head related transfer function.

**Milestone 3 (Completed)**:

- Tested different approachs and with fast, raw iterations. The subfolders fft, htrf, tonnetz sections each approach.  
- Current selected main soundscape generator comes from the Euler Tonnetz approach where the video frame split into left/right halves, mapped to the hexagonal Euler Tonnetz grid (32x32 per half, 2048 notes total).
- Has a day/night mode that inverts sound generation given the lighting conditions.
- Sounds synthesis engine aims to approach real-time 50ms updates (toggleable to 100ms, 250ms) and up to 16 notes per side (32 total).
- UI: Centered video, split the remaining screen into 3 sections, being the lower half for the start/top, to upper div has settings a the left for FPS and at next to it, at the right is the day/night toggle, (working on it).
- Moved from the Trunk Based Development to a Single Responsability Principle (modular) approach.
- Set up Github new branches for developing with CI/CD in place

**Milestone 4 (Current)**: **Work in Progress**  

- New user interface with selectable grid, selectable synth engine, took out auto day and night mode. **Work in Progress** 
- New languajes for the speech sinthetizer **Work in Progress** 
- Detailed performance analisis and sectioned metrics. **Work in Progress** 

Consider TO_DO:

- Optimizations aiming the use of less resources and better performance, such as Web Workers and WebAssembly.
- Reintroducing Hilbert curves.
- Gabor filters for motion detection.
- New grid types and synth engines
- Voting system for grid and synth engines.
- Testing true HRTF.
- Android/iOS app developtment if considerable performance gain can be achieved.


## [Project structure](#project_structure) (WIP)

```
acoustsee/
├── .github/workflows/         # GitHub Actions for deployment
│   ├── deploy.yml
├── web/                       # Modular webapp
│   ├── index.html
│   ├── main.js
│   ├── audio-processor.js
│   ├── grid-selector.js
│   ├── ui-handlers.js
│   ├── state.js
│   ├── synthesis-methods/
│   │   ├── grids/
│   │   │   ├── hex-tonnetz.js
│   │   │   ├── circle-of-fifths.js
│   │   ├── engines/
│   │   │   ├── sine-wave.js
│   │   │   ├── fm-synthesis.js
│   ├── garbage/               # Deprecated files 
├── tests/                     # Unit tests (TO_DO)
├── docs/                      # Documentation
│   ├── INSTALL.md
│   ├── CHANGELOG.md
│   ├── CONTRIBUTING.md
│   ├── TO_DO.md
│   ├── DIAGRAMS.md
│   ├── LICENSE.md
│   ├── FAQ.md
├── README.md

```

### [Changelog](docs/CHANGELOG.md)

- Current version is v0.8, follow the changelog link for log history and details

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
  

