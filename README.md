# AcoustSee
**Converting live video to spatial audio to help the blind "see" their surroundings.**

AcoustSee is an open-source project to transform visual environments into intuitive soundscapes, empowering visually impaired people to navigate the world. By processing live video with Gabor filters, Hilbert curves, and Head-Related Transfer Function (HRTF) audio, we create spatial audio that maps objects to sounds. This project was co-developed with Grok at grok.com, and we’re sharing its step-by-step journey to inspire others to contribute to accessibility tech.

> **Why?** We believe in solving real problems with open-source software—fast, accessible, and impactful. Join us to make a difference!

## Project Vision
Imagine a blind person walking through a park, hearing a tree on their left as a low hum, a path ahead as a clear tone, and a bench on their right as a sharp ping. AcoustSee aims to make this a reality, starting with static images, moving to live video, and now expanding to mobile apps.
## Status
**Work in Progress**  
- **Milestone 1 (Complete)**: Static image to basic HRTF-like audio (left/right panning). Successfully generates WAV output in GitHub Codespaces using `main_codespaces.py`.  
- **Milestone 2 (Current)**: Adding true HRTF, Hilbert curve mapping, and video processing.  
- **Milestone 3 (Planned)**: Android app integration (draft in progress) and real-time optimization.

## Project Structure
acoustsee/
├── src/ # Core code (video processing, audio generation)
├── tests/ # Unit tests
├── docs/ # Technical docs (math, algorithms)
├── examples/ # Demo images, videos, and audio outputs
└── README.md # Project overview

## Getting started with our first commit wich is a MVP Python Code

A simple proof-of-concept: process a static image with Gabor filters and output basic HRTF-like audio (left/right panning)

## Setup

**Clone the Repo**:
   ```bash
   git clone https://github.com/MAMware/acoustsee.git
   cd acoustsee
   ```
**Set Up Virtual Environment**:
  ```bash
  python3 -m venv acoustsee_env
  source acoustsee_env/bin/activate
  ```
**Install Dependencies**:
	```bash
	pip install opencv-python-headless numpy scipy pyo
	```
**Run the MVP**:
For local machines
	```bash
	python src/main.py
	```
For headless environments (e.g., Codespaces):
  ```bash
  python src/main_codespaces.py
  ```

Try it with examples/wall_left.jpg to hear a basic left/right audio split!

## Troubleshooting
- **Windows `pyo` Installation**:
  - Use Python 3.11 or 3.12 for best compatibility.
  - Install Microsoft Visual C++ Build Tools: [Download](https://visualstudio.microsoft.com/visual-cpp-build-tools/).
  - Ensure PortAudio is installed and in your PATH.
  - Example:
    ```bash
    python3.11 -m venv acoustsee_env
    .\acoustsee_env\Scripts\activate
    pip install opencv-python numpy scipy pyo
    ```
- **Linux `pyo` Installation (e.g., GitHub Codespaces)**:
  - Use a virtual environment:
    ```bash
    python3 -m venv acoustsee_env
    source acoustsee_env/bin/activate
    ```
  - Install development libraries:
    ```bash
    sudo apt update
    sudo apt install -y libportaudio2 portaudio19-dev libportmidi-dev liblo-dev libsndfile1-dev libasound-dev libjack-dev build-essential libgl1-mesa-glx
    ```
  - Install Python dependencies:
    ```bash
    pip install opencv-python-headless numpy scipy pyo
    ```
  - If `opencv-python` fails with `libGL.so.1` errors, use `opencv-python-headless`:
    ```bash
    pip uninstall -y opencv-python
    pip install opencv-python-headless
    ```
  - If Python 3.12 fails, try Python 3.11:
    ```bash
    sudo apt install -y python3.11 python3.11-venv
    python3.11 -m venv acoustsee_env
    source acoustsee_env/bin/activate
    pip install opencv-python-headless numpy scipy pyo
    ```
- **Headless Environments (e.g., Codespaces)**:
  - Codespaces lacks audio output. Use `main_codespaces.py` to generate WAV files:
    ```bash
    python src/main_codespaces.py
    ```
  - Download `examples/output.wav` via the Codespaces file explorer and play locally.
  - Example WAV test:
    ```python
    from pyo import *
    s = Server(audio="offline").boot()
    s.recordOptions(dur=2, filename="test.wav")
    sine = Sine(freq=440, mul=0.5).out()
    s.start()
    s.stop()
    ```
- **WxPython/Tkinter Warning**:
  - `pyo` may warn about missing WxPython, falling back to Tkinter. This is harmless for WAV generation.
- **SetuptoolsDeprecationWarning**:
  - A warning about `License :: OSI Approved :: GNU General Public License` is harmless (it’s a `pyo` packaging issue).
- **Still stuck?** Open an issue on GitHub or ping us on [X](https://x.com/MAMware).

