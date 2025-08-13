# AcoustSee
Converts live video into spatial audio using a Tonnetz grid.

## Status
**Milestone 1 (Complete)**  
- Mobile-first web version with live camera feed (`web/tonnetz/index.html`).
- Soundscape: video frame mapped to a hexagonal Tonnetz grid, with notes triggered by motion.
- Vertical split: left/right halves analyzed independently, panned fully left/right for clear positional audio.
- Harmonic profiles: major, minor, dissonant chords for different objects (e.g., humans, cats, cars).
- Real-time: 50ms updates (toggleable to 100ms, 250ms), 16x16 Tonnetz grid per half (512 notes total).
- UI: Centered video, corner settings (FPS, note mode, amplitude, start/stop).


**Milestone 2 (Planned)**  
- Gabor filters for motion detection.
- Performance optimization (Web Workers, WebAssembly).
- Android/iOS apps.
- Custom harmonic profiles via machine learning?.

  
