# AcoustSee
**Converting live video to spatial audio to help the blind "see" their surroundings.**

AcoustSee is an open-source project to transform visual environments into intuitive soundscapes, empowering visually impaired people to navigate the world. By processing live video with Hilbert curves, and Head-Related Transfer Function (HRTF) audio, we create spatial audio that maps objects to sounds. This project was co-developed with Grok at grok.com and x.com, we’re sharing the step-by-step journey to inspire others to contribute to accessibility tech.

> **Why?** We believe in solving real problems with open-source software—fast, accessible, and impactful. Join us to make a difference!

## Project Vision
Imagine a blind person sitting at a park, headphones on and the mobile phone being weared like a necklage by a case. Its camera is facing a quiet swing where children are playing, as the seat of the swing gets back/further the sound generator makes a tiny sound that fades in intesity and has less spectral contant (harmonics) and wen it swings closer its sound intensity raises and since its visual gets bigger it could also translate that has more spectral content in the audio on the same hey but with more harmonics so we know is the same object going back and forth. 

AcoustSee aims to make this a reality, we started a prof of concept with static images in the python version and currently we moved to live video in the web version. While expanding and optimizing to mobile OS in the near future is also desired.

## Status
**Work in Progress**  
- **Milestone 1 (Complete)**: Static image to basic stereo audio (left/right panning). Successfully generates WAV output.  
- **Milestone 2 (Current)**: Live video processing with Hilbert curve mapping via web. Testing.
- **Milestone 3 (Planned)**: Adding true HRTF, Android/iOS app developtment (draft in progress) and optimizations are meant to be added in order to achieve real-time performance.

## Project Structure

```
acoustsee/
├── src/                       # Contains the Python PoC code for still image processing and audio generation.
├── web/                       # Contains HTML, CSS, and JavaScript files for the web interface
│   ├── hrtf/
│   │   ├── hrtf_container.js  # HRTF loading and interpolation
│   │   ├── hrtf_panner.js     # HRTF panner implementation
│   ├── index.html
│   ├── main.js
│   ├── styles.css
├── examples/                  # Still image and output container for the Python PoC
├── tests/                     # Should contain unit tests (currently missing)
├── docs/                      # Contains technical documentation
└── README.md                  # This file, providing an overview of the project
```

## Current HRTF Implementation
Uses Web Audio API’s `PannerNode` with `panningModel = 'HRTF'`. A 200 Hz crossover separates low (non-spatialized) and high (spatialized) frequencies.
- **Crossover**: Modify in `web/hrtf/hrtf_panner.js`.
- **Calibration**: Set azimuth offset via settings (upper half tap).
