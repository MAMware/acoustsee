## Installation

Please note that the current best performer can be run without installation directly from a internet browser, the latest best performer is hosted at: 

Browser compability list:


| Browser             | Minimum Version for Full Support   | Notes                                                                          |
| ------------------- | ---------------------------------- | ------------------------------------------------------------------------------ |
| Chrome for Android  | Chrome 47 (December 2015)          | Full support for getUserMedia, AudioContext, and createStereoPanner.           |
| Safari on iOS       | iOS 14.5 (Safari 14.1, April 2021) | Supports unprefixed AudioContext and createStereoPanner. No vibration support. |
| Firefox for Android | Firefox 50 (November 2016)         | Full support for all APIs, though SpeechSynthesis may be inconsistent.         |
| Samsung Internet    | Samsung Internet 5.0 (2017)        | Based on Chromium, full support for all APIs.                                  |
| Opera Mobile        | Opera 36 (2016)                    | Based on Chromium, full support for all APIs.                                  |
| Edge for Android    | Edge 79 (January 2020)             | Based on Chromium, full support for all APIs.                                  |

Privacy Note: All of the video processing is done at your device, not a single frame is sent to anyone or anywhere than that the ones that takes places at your own device processing logic.



### Project structure

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

## To test our first commit wich is a Python script, either out of curiosit or educational purposes, follow the instrucctions below

Our first iteration, a simple proof-of-concept: process a static image file and output basic left/right panned audio file.

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

## Troubleshooting the python version installation
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
