## Efforts achieved

**Milestone 1**:

- Proof of Concept. A Python code that handles statics image from an example folder and successfully generates a WAV file with basic stereo audio, left/right, panning.

**Milestone 2**: 

- Minimun Viable Product. A javascript web version, to process privately the user live video feed, framing a "Hilbert curve" (it was a simplified zig zag) and synthetised sound from it trying to emulate a head related transfer function.

**Milestone 3**: 

- Tested different approachs and with fast, raw iterations. The subfolders fft, htrf, tonnetz sections each approach.  
- Current selected main soundscape generator comes from the Euler Tonnetz approach where the video frame split into left/right halves, mapped to the hexagonal Euler Tonnetz grid (32x32 per half, 2048 notes total).
- Has a day/night mode that inverts sound generation given the lighting conditions.
- Sounds synthesis engine aims to approach real-time 50ms updates (toggleable to 100ms, 250ms) and up to 16 notes per side (32 total).
- UI: Centered video, split the remaining screen into 3 sections, being the lower half for the start/top, to upper div has settings a the left for FPS and at next to it, at the right is the day/night toggle, (working on it).
- Moved from the Trunk Based Development to a Single Responsability Principle (modular) approach.
- Set up Github new branches for developing with CI/CD in place

**Notes on Versioning**
  
  Versioning Rationale: 
    - Versions are inferred based on significant milestones (e.g., initial release = v0.1.0, major fixes = v0.1.x, new features = v0.2.x). 
    - The exact dates are approximated from our chat timeline (May 15 to June 10, 2025).


//future/web **v.9.8.5 - June 7, 2025** 

Explicación de los cambios
Ajuste del tamaño del video y diseño (styles.css):
- Añadí max-height: 68vh a .main-container y max-width: 80% a .center-rectangle para limitar su expansión y balancear el diseño.
Mantuve el <video> en 200x150px (150x112px en < 600px), que parece adecuado según la captura.
overflow: hidden en body y .main-container previene el scroll, evitando conflictos con touchstart.
Corrección del audio (rectangle-handlers.js):
- Mejoré ensureAudioContext para asignar explícitamente audioContext y manejar errores de inicialización/resume.
Añadí una verificación en todos los eventos touchstart para asegurar que AudioContext esté listo antes de proceder.
Forcé video.play() para garantizar que el video y el audio se sincronicen tras iniciar el stream.
Corrección del botón Stop (rectangle-handlers.js):
- Añadí video.pause() y una verificación de errores en la lógica de parada para asegurar que el video y el audio se detengan.
Simplifiqué la lógica de suspensión de audioContext con un try/catch para capturar fallos.
Manejo de errores y depuración (rectangle-handlers.js, event-dispatcher.js):
- Condicioné tryVibrate para ejecutarse solo si isAudioInitialized es true, evitando el error de navigator.vibrate.
Actualicé event-dispatcher.js para usar settings.stream directamente en updateUI, asegurando que el estado del stream sea correcto en #debug.
Evitar conflictos con touchstart:
tryVibrate ahora verifica event.cancelable antes de llamar a preventDefault(), reduciendo el riesgo de ignorar el evento durante scroll.


**v0.3.0 - June 10, 2025** Developing with a Single Responsability Principly approach
Milestone: Audio Context Fix and Enhanced Stability
- Fixed AudioContext initialization error ("not allowed to start") reported in rectangle-handlers.js lines 25 and 27 by centralizing audioContext management in main.js and exposing it globally via window.audioContext.

- Ensured all audio operations (creation, resumption) are tied to user gestures (e.g., tapping Start/Stop button).

- Added rectangle-handlers.js to manage UI event listeners, integrating with the global audioContext to avoid conflicts.

- Improved error handling and logging in initializeAudio to debug audio initialization issues.

- Updated index.html to include rectangle-handlers.js script.

**v0.2.3 - June 03, 2025**
Milestone: Performance Optimization and UI Refinement
- Optimized main.js by commenting out unnecessary auto-mode suggestions and test tones to enhance performance, per MAMware’s feedback.

- Adjusted Tonnetz grid to use a hexagonal pattern for better harmonic relationships, addressing MAMware’s concern about the Circle of Fifths progression.

- Removed clustering in mapFrameToTonnetz to allow detailed note triggers reflecting object shapes, aligning with the Ableton Push grid vision.

- Increased motion threshold to delta > 50 to reduce noise and focused on up to 16 notes per side (32 total) with proximity checks to avoid overlap.

- Enlarged UI buttons to 90x40px in styles.css to fit "Start/Stop" text, positioning them around the video feed (FPS above, mode left, auto-mode right, start/stop below).

- Reintroduced autoMode toggle with manual day/night switch, inverting luma logic (day: bright = loud; night: dark = quiet).

- Simplified oscillator waveforms to sine for all notes to reduce CPU load, enhancing performance with 32 oscillators.

**v0.2.2 - May 17, 2025**
Milestone: Inherent Spectra and Day/Night Mode
- Implemented inherent audio spectra based on MAMware’s clarification, removing object inference (human/cat/car) and letting note clusters reflect object shapes (e.g., LCD monitor → vertical cluster).

- Added day/night mode toggle with manual and auto-mode options, inverting luma logic to highlight car lights at night and open spaces during day.

- Fixed audio engine not starting by correcting commented-out audioContext creation in initializeAudio.

- Resolved debug overlay visibility issue with improved CSS (z-index: 20, background: rgba(0,0,0,0.9)).

- Disabled repetitive day/night suggestions, limiting them to once every 30 seconds (later removed per feedback).

- Added placeholder for Mermaid diagrams in docs/code_flow.md, awaiting MAMware’s contribution.

- Updated README with privacy notice: "Camera feed processed locally, no data sent anywhere."

**v0.2.1 - May 16, 2025**
Milestone: Detailed Soundscape and UI Overhaul
- Increased Tonnetz grid to 32x32 per half (1024 notes each, 2048 total) to support 32-64 notes per channel, capturing fine details in complex scenes.

- Removed note mode toggle (major/minor/dissonant) per MAMware’s request, focusing on inherent spectra via motion patterns.

- Added black background in styles.css for battery saving on OLED screens.

- Positioned UI buttons in a top bar, fixing the “crumbling” issue when video starts, but noted buttons were too far apart (later adjusted).

- Introduced day/night mode toggle (replacing note mode) with pitch range adjustments (day: 200-1600 Hz, night: 100-800 Hz) and waveform changes.

- Implemented clustering to group nearby moving regions, allowing up to 16 notes per side (32 total).

//past/v0.2.0 **v0.2.0 - May 15, 2025**
Milestone: Initial Web Release
- Launched mobile-first web version with live camera feed at https://mamware.github.io/acoustsee/.

- Introduced air harp soundscape with a 16x16 Tonnetz grid per half (256 notes each, 512 total), using a chromatic scale (100-3200 Hz).

- Added vertical split of webcam feed, panning left (-1) and right (+1) for clear positional audio.

- Implemented motion-based triggers with up to 4 notes per side (8 total), using intensity delta > 30.

- Created UI with centered video (64x48), settings in corners (FPS, note mode, amplitude, start/stop), and debug overlay (double-tap top-left).

- Added real-time updates at 50ms (20 FPS), toggleable to 100ms or 250ms.

- Included Python version for static images (main_codespaces.py) and initial README with demo instructions.

//past/Pytyhon-Poc_Protype **v0.1.1 - May 11, 2025** (Initial Prototype)
Milestone: Proof of Concept
- Initial with basic air harp concept, mapping webcam feed to a 10x10 Tonnetz grid (100 notes total).

- Implemented pitch encoding based on y-axis and note selection based on x-axis, with left-right distinction via note choice.

- Added continuous oscillators with sine, triangle, and square waveforms, triggered by motion.

- Basic UI with video feed and minimal settings, no vertical split or panning yet.

- Focused on real-time audio generation, targeting 100ms updates.

../past/web/fft  **Changelog** Trunk Based Development

All notable changes to the AcoustSee TBD approach will be documented in this section.
Grok chat history: https://grok.com/chat/c8b7ddd3-f951-4d04-873f-392d720746fc

Planned: Implement 33ms updates for near real-time audio feedback.
Explore machine learning for spectral analysis to enhance object detection in web/fft.
Add haptic feedback to web/fft for touch-based interactions, aligning with main demo’s accessibility.
Merge web/fft features (brown noise, panning) into main demo if FFT approach proves superior.

../past/web/fft [v0.2.9.0] - 2025-06-11
Milestone: FFT-Based Brown Noise Soundscape for Accessibility
Added:

Implemented continuous brown noise baseline in web/fft/index.html, replacing sine/sawtooth oscillators, to create a subtle, comfortable soundscape for the visually impaired (inspired by MAMware’s vision of a dynamic noise altered by movement and intensity).
Added StereoPannerNode in web/fft for spatial audio, panning left/right based on bright object positions (azimuth: -1 to 1), enhancing spatial awareness.
Introduced low-pass filter (BiquadFilterNode) to modulate brown noise pitch (500–2000 Hz) based on FFT intensity, reflecting light intensity changes.
Added approach detection in web/fft, triggering speech feedback (“Object approaching”) when intensity increases significantly (>10), aiding navigation.
Enhanced accessibility in web/fft with Web Speech API feedback for actions (“Camera started”, “Audio started/stopped”, “Log shown/hidden”) and touch-based audio toggle (#toggleAudioTouch div).
Reduced fftSize to 32768 in web/fft for better mobile performance while retaining FFT energy analysis.

Changed:

Updated web/fft/index.html to prioritize brown noise over oscillators, addressing MAMware’s feedback on main demo’s “annoying 8-bit” pulsating audio.
Hid debug log by default in web/fft (display: none) to focus on audio feedback for visually impaired users.
Adjusted FFT intensity mapping to align with main.js’s inverse luma logic (brighter = quieter, higher pitch), ensuring consistency.
Renamed visualization label from “Energyto “Debug Data” for clarity inweb/fft/index.html`.

Fixed:

Ensured continuous audio in web/fft by using noise.loop = true, avoiding the pulsating effect in main.js caused by setTimeout oscillator stops.
Fixed potential AudioContext suspension issues in web/fft by resuming context on user interaction (touch/click).

Notes:

The brown noise approach in web/fft addresses MAMware’s discomfort with main.js’s harsh waveforms (sine, sawtooth, square) and pulsating audio, offering a smoother, more natural soundscape.
web/fft remains a parallel prototype to the main demo’s Tonnetz grid, focusing on FFT for energy-based modulation.

../past/web/fft  [0.2.8.6] - 2025-06-11
Added

Reintroduced two-oscillator setup (sine + sawtooth) in web/fft/index.html to test FFT-based modulation, per MAMware’s preference for FFT over main.js’s Hilbert curve approach.
Added initial speech feedback in web/fft for “Audio started/stopped” and “Camera started” using Web Speech API, inspired by main.js’s accessibility features.
Implemented touch-based audio toggle in web/fft with #toggleAudioTouch div, aligning with main.js’s touch zones.
Added keyboard support (spacebar) in web/fft for audio toggle, enhancing accessibility.
Included Google Fonts (‘Roboto’) in web/fft CSS for consistent styling with main demo.

Changed

Updated web/fft/index.html CSS to match main.js’s polished UI (rounded buttons, bordered canvas, debug overlay styling).
Adjusted FFT processing in web/fft to compute energy from low frequencies only, improving performance and audio responsiveness.
Modified visualization in web/fft to use HSL colors based on frequency, providing clearer debug feedback.

Fixed

Resolved aspect ratio issues in web/fft by dynamically adjusting canvas height based on video feed, ensuring undistorted visuals.
Fixed audio initialization errors in web/fft by ensuring AudioContext resumes on user interaction, similar to main.js’s initializeAudio.

Notes

This version began exploring FFT enhancements in web/fft as an alternative to main.js, addressing MAMware’s feedback on the main demo’s audio quality.
Incremental updates prepared for the brown noise milestone in v0.9.9.0.

../past/web/fft  [0.2.8.5] - 2025-06-07
Changed

Adjusted video size and layout in styles.css:
Added max-height: 68vh to .main-container and max-width: 80% to .center-rectangle to balance design and limit expansion.
Maintained centered layout for video feed.


Improved ensureAudioContext in main.js to explicitly assign audioContext and handle initialization/resume errors.
Added AudioContext readiness check in all touchstart events to prevent audio operation failures.
Forced video.play() in rectangle-handlers.js to synchronize video and audio after stream start.
Simplified audio suspension logic in rectangle-handlers.js with try/catch for robust error handling.
Updated event-dispatcher.js to use settings.stream directly in updateUI, ensuring correct stream state in #debug.

Fixed

Corrected Stop button logic in rectangle-handlers.js:
Added video.pause() and error checking to ensure video and audio stop correctly.


Fixed navigator.vibrate error by conditioning tryVibrate to run only if isAudioInitialized is true.
Prevented touchstart conflicts by checking event.cancelable in tryVibrate before calling preventDefault(), reducing scroll interference.

Notes

Focused on stabilizing the main demo (main.js, rectangle-handlers.js) before shifting to web/fft enhancements in v0.9.8.6.
Laid groundwork for accessibility improvements later adopted in web/fft.


Notes on Versioning

Versioning Rationale: Versions are inferred based on significant milestones (e.g., initial release = v0.1.0, major fixes = v0.1.x, new features = v0.2.x). From v0.9.8.5, we use v0.9.8.x for incremental fixes and v0.9.9.0 for the FFT brown noise milestone, reflecting its significance as a new soundscape approach.
Future Releases: Targeting v0.9.9.x for further web/fft refinements (e.g., haptic feedback, filter tweaks). v1.0.0 could include 33ms updates or machine learning for spectra, merging web/fft into the main demo if successful.








