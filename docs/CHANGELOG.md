## Efforts achieved

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
