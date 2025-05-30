## Efforts achieved

v0.9.8.5

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



**Milestone 1**: (Completed)

- Proof of Concept. A Python code that handles statics image from an example folder and successfully generates a WAV file with basic stereo audio, left/right, panning.

**Milestone 2**: (Completed) 

- Minimun Viable Product. A javascript web version, to process privately the user live video feed, framing a "Hilbert curve" (it was a simplified zig zag) and synthetised sound from it trying to emulate a head related transfer function.

**Milestone 3 (Completed)**: V0.9

- Tested different approachs and with fast, raw iterations. The subfolders fft, htrf, tonnetz sections each approach.  
- Current selected main soundscape generator comes from the Euler Tonnetz approach where the video frame split into left/right halves, mapped to the hexagonal Euler Tonnetz grid (32x32 per half, 2048 notes total).
- Has a day/night mode that inverts sound generation given the lighting conditions.
- Sounds synthesis engine aims to approach real-time 50ms updates (toggleable to 100ms, 250ms) and up to 16 notes per side (32 total).
- UI: Centered video, split the remaining screen into 3 sections, being the lower half for the start/top, to upper div has settings a the left for FPS and at next to it, at the right is the day/night toggle, (working on it).
- Moved from the Trunk Based Development to a Single Responsability Principle (modular) approach.
- Set up Github new branches for developing with CI/CD in place
