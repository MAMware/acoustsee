# AcoustSee
**Converting live video to spatial audio to help the blind "see" their surroundings.**

AcoustSee is an open-source project to transform visual environments into intuitive soundscapes, empowering visually impaired people to navigate the world. By processing live video with Hilbert curves, and Head-Related Transfer Function (HRTF) audio, we create spatial audio that maps objects to sounds. This project was co-developed with Grok at grok.com, and we’re sharing its step-by-step journey to inspire others to contribute to accessibility tech.

> **Why?** We believe in solving real problems with open-source software—fast, accessible, and impactful. Join us to make a difference!

## Project Vision
Imagine a blind person walking through a park, hearing a pole on their left as a low hum, a path ahead as a dimished brown noise, and a bench on their right as a sharp tone. AcoustSee aims to make this a reality, we started with static images in the python version and currently we moved to live video for the web version. Expanding and optimizing to mobile OS in the near future is also planned.

## Status
**Work in Progress**  
- **Milestone 1 (Complete)**: Static image to basic HRTF-like audio (left/right panning). Successfully generates WAV output in GitHub Codespaces using `main_codespaces.py`.  
- **Milestone 2 (Current)**: Adding true HRTF, Hilbert curve mapping, and live video processing.  
- **Milestone 3 (Planned)**: Android/iOS app developtment (draft in progress) and real-time optimizations.

## Project Structure
acoustsee/
├── src/ # Python core code (video processing, audio generation)
├── web/ # html,css and javascript for web
├── tests/ # Unit tests (missing)
├── docs/ # Technical docs (math, algorithms)
├── examples/ # Demo images, videos, and audio outputs
└── README.md # Project overview
