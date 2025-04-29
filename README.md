# acoustsee
Converting live video to spatial audio to help the blind to "see" their surroundings.
This project was co-develepod with grok.com and ill try to project here a step by step of how it went thru. The goal is to promote the open source development of software that resolves real issues, promptly and without much hassle for the intended final user.

## Python Proof of concept
## Status
Work in progress. First milestone: static image to HRTF audio.
## Structure:

acoustsee/
├── src/              # Core code
├── tests/            # Unit tests
├── docs/             # Documentation
├── examples/         # Demo videos/audio
└── README.md         # Project overview

```bash

```

```bash
git clone https://github.com/MAMware/acoustsee.git
```

## First commit - MVP Code

A simple proof-of-concept: process a static image with Gabor filters and output basic HRTF-like audio (left/right panning)

## Setup
Install dependencies 

```bash
pip install opencv-python numpy scipy pyo
```

