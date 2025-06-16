# Future Features

Sorted by priority

- Mermaid diagrams to reflect current Modular Single Responsability Principle
- Further Modularity: e.g., modularize audio-processor.js
- New languajes for the speech sinthetizer
- Haptic feedback via Vibration API
- Console log on device screen for debuggin.
- Optimizations aiming the use less resources and achieve better performance, ie: implementing Web Workers and using WebAssembly.
- Reintroducing Hilbert curves.
- Gabor filters for motion detection.
- New grid types and synth engines
- Voting system for grid and synth engines.
- Consider making User selectable synth engine version.
- Consider adding support for VST like plugins.
- Testing true HRTF, loading CIPIC HRIR data.
- New capabilities like screen/video capture to sound engine.
- Android/iOS app development if considerable performance gain can be achieved.

**6/16/2025**
## Considering adding OpenCV support
 Adapting OpenCV for AcoustSee
To meet the 66ms constraint and aid a blind user via audio cues, here’s how OpenCV can be tailored for AcoustSee:
Pipeline Design
Camera Input:
Capture frames at 15–30 FPS (66–33.3 ms) at 480p or 720p to reduce processing load.

Use browser-based APIs (e.g., getUserMedia) for WebAssembly compatibility.

Object Detection:
Use a lightweight model like MobileNet-SSD or YOLO-Tiny (pre-trained for common objects: sidewalk, wall, car, swing).

Processing time: ~15–30 ms on mid-range devices for 720p.

Output: Bounding boxes and labels for objects (e.g., “sidewalk: center, wall: left”).

Feature Extraction:
Analyze color and texture within bounding boxes using OpenCV’s image processing (e.g., HSV color histograms, edge detection).

Example: Sidewalk = smooth, gray (low-frequency hum); wall = flat, textured (mid-frequency tone).

Processing time: ~5–10 ms.

Depth Estimation:
Use a lightweight monocular depth model (e.g., MiDaS Small, optimized for TFLite) to estimate object distances.

Example: Swing at 2m = loud, broad sound; at 5m = quiet, narrow sound.

Processing time: ~20–30 ms on flagships, ~30–50 ms on mid-range.

Alternative: Use motion cues (e.g., optical flow) for faster processing (~10–20 ms).

Audio Mapping:
Map visual features to audio cues using Web Audio API:
Position: Stereo panning (left-right based on bounding box x-coordinate).

Depth: Volume (louder for closer) and spectral complexity (broader for closer).

Object type: Unique spectral signatures (e.g., hum for sidewalk, tone for wall, broadband for swing).

Generate 3–6 cues per 66ms frame, each ~5–10 ms, to align with auditory resolution.

Total Latency:
Example: MobileNet-SSD (20 ms) + feature extraction (10 ms) + depth estimation (~30 ms) = ~60 ms on a flagship device for 720p.

Optimizations (e.g., 480p, quantized models, GPU) can reduce this to ~40–50 ms, fitting within 66ms.

Optimizations for Real-Time
Lower resolution: Use 480p (640×480) instead of 720p/1080p to cut processing time by ~30–50%.

Lightweight models: Use quantized TFLite models (e.g., MobileNet-SSD, MiDaS Small) for 2–3x speedup.

Frame skipping: Process every other frame (effective 15 FPS) if needed, while interpolating audio cues.

GPU/Neural acceleration: Leverage OpenCV’s DNN module with OpenCL or mobile neural engines.

Asynchronous processing: Run image processing in parallel with audio synthesis to reduce perceived latency.

Audio Cue Design
Number of cues: Limit to 3–6 per 66ms frame (e.g., sidewalk, wall, swing) to ensure auditory clarity, based on the 5–10 ms per cue limit from our previous discussion.

Spectral signatures:
Sidewalk: Low-pass noise (100–200 Hz), center-panned, steady.

Wall: Sine wave (500–1000 Hz), left-panned, constant.

Swing: Sawtooth wave (200–2000 Hz), center-panned, dynamic volume/filter.

Car: Bandpass noise (500–5000 Hz), panned based on position.

Dynamic updates: Adjust volume and filter cutoff every 66ms based on depth/motion (e.g., swing closer = louder, broader spectrum).





Example of UI Templates:

- Bezel type template: The top trapezoid is (should be) where the setting toggle is, this toggle shifts the function of the lateral trapezoid a the left (dayNight toggle without shift) and right (languaje selectror for speech synthesis) for a cursor for options navigation such as grid and synth engine both versioned selector.

The confirmation is done by pressing the center vertical rectangular square, that also works as webcam feed preview/canvas

The start and stop of the navigation is done by pressing the buttom trapezoid.

- A reintroduction of a frames per seconds (FPS) toggle that is usefull if your device stutters or generates artifacts due to processing issues, likely by a cpu processor limitation will be reconsidered as a configuration option, among the grid and synth engine selector.

A console log live view and a copy feature is being considered too.
