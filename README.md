# AcoustSee
**A photon to phonon tool**

AcoustSee is an open-source project kickstarted by MAMware and coded by xAI Grok with the aim to transform visual environments into intuitive soundscapes,  empowering the user to experience the visual world bye audio cues. First we aimed to do the processing of live video with Hilbert curves inspired by 3Blue1Brown, with te ideea to take the advantaje of Head-Related Transfer Function (HRTF) to create spatial awaresness that maps objects positons into sounds. This project was entirely coded by Grok at grok.com and x.com and we’re sharing the step-by-step journey to inspire others to contribute to accessibility tech.

> **Why?** We believe in solving real problems with open-source software—fast, accessible, and impactful. Join us to make a difference!

## Project Vision
Imagine a person whos unable to see but is sitting at a park with headphones on and paired to the mobile phone wich is being weared like a necklage withs its camera facing a quiet swing, where children are playing, as the seat of the swing gets back/further the sound generator makes a sound spectra that has less harmonics content and wen it swings closer its spectra complexity raises. 

This kickstart aims to make a reality, we first started a prof of concept with static images in the python version and currently we moved to live video for a web version. Expanding and optimizing to mobile operating systems in the near future is also desired.

## Status
**Work in Progress**  
- **Milestone 1 (Complete)**: Static image to basic stereo audio (left/right panning). Successfully generates WAV output.  
- **Milestone 2 (Complete)**: Live video processing with Hilbert curve mapping via web. Tested.
- **Milestone 3 (Current)**:
- Mobile-first web version with live camera feed (`web/index.html`).
- Soundscape: video frame split into left/right halves, mapped to a hexagonal Tonnetz grid (32x32 per half, 2048 notes total).
- Day/Night mode: Inverts sound generation given lighting conditions.
- Real-time: 50ms updates (toggleable to 100ms, 250ms), up to 16 notes per side (32 total).
- UI: Centered video, settings in top bar (FPS, day/night, start/stop).
- **Milestone 4 (Planned)**:
- Consider testing true HRTF, Android/iOS app developtment and optimizations are meant to be added in order to achieve real-time performance, optimizations.
- Gabor filters for motion detection.
- Performance optimization (Web Workers, WebAssembly).
  

## Project Structure

```
acoustsee/
├── src/                       # Contains the Python PoC code for still image processing and audio generation.
├── web/                       # Contains HTML, CSS, and JavaScript files for the web interface
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
│   ├── index.html             # The current chosen version as better performer wich is Tonnetz, ATM.
│   ├── main.js
│   ├── styles.css
├── examples/                  # Still image and output container for the Python PoC
├── tests/                     # Should contain unit tests (currently missing)
├── docs/                      # Contains technical documentation (working)
│    ├── diagrams.ms           # Wireframin the logic for better understaind
└── README.md                  # This file, providing an overview of the project
```

# Code Flow Diagrams

## Process Frame Flow

## Audio Generation Flow

## Motion Detection 

