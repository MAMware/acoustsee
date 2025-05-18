# AcoustSee
**A photon to phonon tool**

AcoustSee is an open-source project kickstarted by MAMware and coded by xAI Grok with the aim to transform visual environments into intuitive soundscapes,  empowering the user to experience the visual world by audio cues.

First we tested the concept with a Python script and still image, once validated we moved to do the processing of a live video with Hilbert curves inspired by 3Blue1Brown (the great Grant), among with te idea to take the advantaje of Head-Related Transfer Function (HRTF) to create spatial awarenes that maps objects positons into distinct sounds. 

This project was entirely coded by Grok at grok.com and x.com and we’re also sharing the step-by-step journey (conversation) to inspire others to contribute to accessibility tech.

> **Why?** We believe in solving real problems with open-source software in a fast, accessible, and impactful way. You are invited to join us to improve and make a difference!

## Project Vision
Imagine a person who is unable to see and is sitting at a park, with headphones on wich are paired to a mobile phone. This phone is being weared like a necklage with the camera facing a quiet swing, where children are playing, as the seat of the swing gets back/further the sound generator makes a sound spectra that has less harmonics content and wen it swings closer its spectra complexity raises. 

This kickstart aims to make a reality, we first started a prof of concept with static images in the python version and currently we moved to live video for a web version. Expanding and optimizing to mobile operating systems in the near future is also desired.

## Status
**Work in Progress**  

**Milestone 1**: (Completed)

- Proof of Concept. A Python code that handles statics image from an example folder and successfully generates a WAV file with basic stereo audio, left/right, panning.

**Milestone 2**: (Completed) 

- Minimun Viable Product. A javascript web version, to process privately the user live video feed, framing a "Hilbert curve" (it was a simplified zig zag) and synthetised sound from it trying to emulate a head related transfer function.

**Milestone 3 (Current)**:

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


## Project Structure

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

# Code Flow Diagrams

- Process Frame Flow, Audio Generation Flow and Motion Detection (oscillator logic)

https://github.com/MAMware/acoustsee/blob/main/docs/DIAGRAMS.md

