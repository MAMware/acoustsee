## Efforts achieved

**v0.9.8.5 - June 7, 2025**

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


**v0.2.0 - June 10, 2025**
Milestone: Audio Context Fix and Enhanced Stability
- Fixed AudioContext initialization error ("not allowed to start") reported in rectangle-handlers.js lines 25 and 27 by centralizing audioContext management in main.js and exposing it globally via window.audioContext.

- Ensured all audio operations (creation, resumption) are tied to user gestures (e.g., tapping Start/Stop button).

- Added rectangle-handlers.js to manage UI event listeners, integrating with the global audioContext to avoid conflicts.

- Improved error handling and logging in initializeAudio to debug audio initialization issues.

- Updated index.html to include rectangle-handlers.js script.

**v0.1.3 - June 03, 2025**
Milestone: Performance Optimization and UI Refinement
- Optimized main.js by commenting out unnecessary auto-mode suggestions and test tones to enhance performance, per MAMware’s feedback.

- Adjusted Tonnetz grid to use a hexagonal pattern for better harmonic relationships, addressing MAMware’s concern about the Circle of Fifths progression.

- Removed clustering in mapFrameToTonnetz to allow detailed note triggers reflecting object shapes, aligning with the Ableton Push grid vision.

- Increased motion threshold to delta > 50 to reduce noise and focused on up to 16 notes per side (32 total) with proximity checks to avoid overlap.

- Enlarged UI buttons to 90x40px in styles.css to fit "Start/Stop" text, positioning them around the video feed (FPS above, mode left, auto-mode right, start/stop below).

- Reintroduced autoMode toggle with manual day/night switch, inverting luma logic (day: bright = loud; night: dark = quiet).

- Simplified oscillator waveforms to sine for all notes to reduce CPU load, enhancing performance with 32 oscillators.

**v0.1.2 - May 17, 2025**
Milestone: Inherent Spectra and Day/Night Mode
- Implemented inherent audio spectra based on MAMware’s clarification, removing object inference (human/cat/car) and letting note clusters reflect object shapes (e.g., LCD monitor → vertical cluster).

- Added day/night mode toggle with manual and auto-mode options, inverting luma logic to highlight car lights at night and open spaces during day.

- Fixed audio engine not starting by correcting commented-out audioContext creation in initializeAudio.

- Resolved debug overlay visibility issue with improved CSS (z-index: 20, background: rgba(0,0,0,0.9)).

- Disabled repetitive day/night suggestions, limiting them to once every 30 seconds (later removed per feedback).

- Added placeholder for Mermaid diagrams in docs/code_flow.md, awaiting MAMware’s contribution.

- Updated README with privacy notice: "Camera feed processed locally, no data sent anywhere."

**v0.1.1 - May 16, 2025**
Milestone: Detailed Soundscape and UI Overhaul
- Increased Tonnetz grid to 32x32 per half (1024 notes each, 2048 total) to support 32-64 notes per channel, capturing fine details in complex scenes.

- Removed note mode toggle (major/minor/dissonant) per MAMware’s request, focusing on inherent spectra via motion patterns.

- Added black background in styles.css for battery saving on OLED screens.

- Positioned UI buttons in a top bar, fixing the “crumbling” issue when video starts, but noted buttons were too far apart (later adjusted).

- Introduced day/night mode toggle (replacing note mode) with pitch range adjustments (day: 200-1600 Hz, night: 100-800 Hz) and waveform changes.

- Implemented clustering to group nearby moving regions, allowing up to 16 notes per side (32 total).

**v0.1.0 - May 15, 2025**
Milestone: Initial Web Release
- Launched mobile-first web version with live camera feed at https://mamware.github.io/acoustsee/.

- Introduced air harp soundscape with a 16x16 Tonnetz grid per half (256 notes each, 512 total), using a chromatic scale (100-3200 Hz).

- Added vertical split of webcam feed, panning left (-1) and right (+1) for clear positional audio.

- Implemented motion-based triggers with up to 4 notes per side (8 total), using intensity delta > 30.

- Created UI with centered video (64x48), settings in corners (FPS, note mode, amplitude, start/stop), and debug overlay (double-tap top-left).

- Added real-time updates at 50ms (20 FPS), toggleable to 100ms or 250ms.

- Included Python version for static images (main_codespaces.py) and initial README with demo instructions.

**v0.0.1 - May 11, 2025** (Initial Prototype)
Milestone: Proof of Concept
- Initial with basic air harp concept, mapping webcam feed to a 10x10 Tonnetz grid (100 notes total).

- Implemented pitch encoding based on y-axis and note selection based on x-axis, with left-right distinction via note choice.

- Added continuous oscillators with sine, triangle, and square waveforms, triggered by motion.

- Basic UI with video feed and minimal settings, no vertical split or panning yet.

- Focused on real-time audio generation, targeting 100ms updates.

**Notes on Versioning**
  
  Versioning Rationale: Versions are inferred based on significant milestones (e.g., initial release = v0.1.0, major fixes = v0.1.x, new features = v0.2.x). The exact dates are approximated from our chat timeline (May 15 to June 10, 2025).

  Future Releases: We’re approaching v0.2.0 with the AudioContext fix. The next milestone (e.g., v0.3.0) could include 33ms updates or machine learning for spectra, as planned.

**Milestone 1**:

- Proof of Concept. A Python code that handles statics image from an example folder and successfully generates a WAV file with basic stereo audio, left/right, panning.

**Milestone 2**: 

- Minimun Viable Product. A javascript web version, to process privately the user live video feed, framing a "Hilbert curve" (it was a simplified zig zag) and synthetised sound from it trying to emulate a head related transfer function.

**Milestone 3 **: 

- Tested different approachs and with fast, raw iterations. The subfolders fft, htrf, tonnetz sections each approach.  
- Current selected main soundscape generator comes from the Euler Tonnetz approach where the video frame split into left/right halves, mapped to the hexagonal Euler Tonnetz grid (32x32 per half, 2048 notes total).
- Has a day/night mode that inverts sound generation given the lighting conditions.
- Sounds synthesis engine aims to approach real-time 50ms updates (toggleable to 100ms, 250ms) and up to 16 notes per side (32 total).
- UI: Centered video, split the remaining screen into 3 sections, being the lower half for the start/top, to upper div has settings a the left for FPS and at next to it, at the right is the day/night toggle, (working on it).
- Moved from the Trunk Based Development to a Single Responsability Principle (modular) approach.
- Set up Github new branches for developing with CI/CD in place

