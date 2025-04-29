# AcoustSee
**Converting live video to spatial audio to help the blind "see" their surroundings.**

AcoustSee is an open-source project to transform visual environments into intuitive soundscapes, empowering visually impaired people to navigate the world. By processing live video with Gabor filters, Hilbert curves, and Head-Related Transfer Function (HRTF) audio, we create spatial audio that maps objects to sounds. This project was co-developed with Grok at grok.com, and we’re sharing its step-by-step journey to inspire others to contribute to accessibility tech.

> **Why?** We believe in solving real problems with open-source software—fast, accessible, and impactful. Join us to make a difference!

## Project Vision
Imagine a blind person walking through a park, hearing a tree on their left as a low hum, a path ahead as a clear tone, and a bench on their right as a sharp ping. AcoustSee aims to make this a reality, starting with static images, moving to live video, and now expanding to mobile apps.
## Status
**Work in Progress**  
- **Milestone 1 (Complete)**: Static image to basic HRTF-like audio (left/right panning).  
- **Milestone 2 (Current)**: Adding true HRTF, Hilbert curve mapping, and video processing.  
- **Milestone 3 (Planned)**: Android app integration (draft in progress) and real-time optimization.

## Project Structure
acoustsee/
├── src/              # Core code (video processing, audio generation)
├── tests/            # Unit tests
├── docs/             # Technical docs (math, algorithms)
├── examples/         # Demo images, videos, and audio outputs
└── README.md         # Project overview


## Getting started with our first commit wich is a MVP Python Code

A simple proof-of-concept: process a static image with Gabor filters and output basic HRTF-like audio (left/right panning)

## Setup

**Clone the Repo**:
   ```bash
   git clone https://github.com/MAMware/acoustsee.git
   cd acoustsee
   ```
**Install Dependencies**:
	```bash
	pip install opencv-python numpy scipy pyo
	```
**Run the MVP**:
	```bash
	python src/main.py
	```
Try it with examples/wall_left.jpg to hear a basic left/right audio split!

## Troubleshooting 

- **Windows `pyo` Installation**:
```bash
ERROR: Failed building wheel for pyo
Failed to build pyo
```
  - Use Python 3.11 or 3.12 for best compatibility.
  - Install Microsoft Visual C++ Build Tools: [Download](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
  - Ensure PortAudio is installed and in your PATH.

Why the Error?
The pyo library relies on C extensions, which require a proper build environment (e.g., compilers) to compile on Windows. The error likely stems from one of these issues:
Missing C Compiler: pyo needs a C compiler (like Microsoft Visual C++ Build Tools) to build its extensions.

Python 3.13 Compatibility: pyo might not yet fully support Python 3.13, as it’s a new release (October 2024).

Missing Dependencies: pyo requires libraries like PortAudio or liblo, which might not be installed.

Windows-Specific Build Issue: The mapleleafrag.mid file copy error could indicate a misconfigured build path or missing MIDI-related dependencies.

(Note: too many errors on windows got me bored, ill move to linux via codespaces)

