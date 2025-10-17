# Project Tasks

This document tracks active and future development tasks to provide a clear project roadmap. Each task has a unique ID for easy reference in commits, pull requests, and code comments.

## Current Focus: v0.9 (Performance & Stability) - Evolving to Multi-Paradigm

-   **[ ] `PERF-1`:** Replace `drawImage`/`getImageData` with a zero-copy frame processing method (e.g., using `requestVideoFrameCallback`).

-   **[ ] `ARCH-2`:** Standardize the export contract for all synth and grid modules, including OSC output contracts for video-to-synth communication.
-   **[ ] `UI-6`:** Refactor the settings logic in `touch-gesture-commands.js` to be data-driven.
-   **[ ] `ARCH-3`:** Define and implement a multi-paradigm architecture ("Flow", "Focus", and "Enhanced Perception" modes). See `docs/adr/0002-dual-paradigm-navigation-and-identification-modes.md`. (Updated to include depth melody, egomotion modulation, object detection, pointer mode, BPM inference.)
       - **[ ] `ARCH-3.1`:** Implement mode switching in engine (state.currentMode = 'flow'|'focus'|'hybrid').
       - **[~] `ARCH-3.2`:** Add dep-free object detection (person/tree/rough_ground/trash/box) in motion worker using thresholds and Gabor textures. _(Status: Abstract features (textureRich, fastMotion, edgeConcentration) implemented as primary signal path 2025-10-17; optional semantic detection layer available in feature-detector.js)_
       - **[ ] `ARCH-3.3`:** Integrate BPM inference (from motion mag: 100 normal, 115 brisk, 120 moderate) for rhythmic cues (4 cues/beat).
       - **[ ] `ARCH-3.4`:** Add haptic vibration in pointer mode for tactile feedback on detected objects.
       - **[~] `ARCH-3.5`:** Implement paradigm-aware adaptive gridSize (3×3 Flow, 8×8 Focus, 5×5 Hybrid) with dynamic configuration broadcast. _(Status: grid-config.js created with GRID_CONFIGS; workers (motion, depth, image) updated with configure message handlers and gridConfig parameters; frame-processor.js broadcasts gridConfig on mode change 2025-10-17)_
-   **[~] `ML-1`:** Implement monocular depth estimator worker with WebGPU GPU acceleration for CNN convolutions. (Updated: Using WebGPU compute shaders for conv2d operations with graceful CPU fallback. Hybrid approach: GPU for convolution, CPU for Sobel/Gabor pseudo-depth path. Integrated with dynamic gridConfig support. See `docs/adr/0005-webgpu-acceleration.md`.) _(Status: GPU implementation complete 2025-10-16; gridConfig integration complete 2025-10-17)_
-   **[ ] `ML-2`:** Add ML-based melody generator worker to create near real-time melodies from depth grids (4-6 notes per 45ms frame).
-   **[ ] `VIDEO-1`:** Enhance motion worker with Lucas-Kanade optical flow, hybrid metric (city-block luma + Euclidean chroma), and dep-free object detection (person/tree).
-   **[ ] `VIDEO-2`:** Implement pointer worker for hand/cane detection in Focus mode, dispatching pointed grid cells.

-   **[ ] `AUDIO-5`:** Add BPM inference from motion magnitude (90-130 BPM based on walking pace) for rhythmic cue synchronization.

## Completed Tasks


-   **[x] `ARCH-1`:** Consolidate `microphone-controller.js` into `media-controller.js` per ADR-0001. _(Completed 2025-10-13)_

## Future Goals (Backlog)

-   **[ ] `AUDIO-3`:** Implement a data-driven manifest for synth settings.
-   **[ ] `DOCS-1`:** Add data flow diagrams to `ARCHITECTURE.md`.
-   **[ ] `ARCH-4`:** Extract scheduler and finish engine modularization.
		 - Goal: make `createEngine()` a thin dispatcher. Move remaining inline handlers into `core/commands/*` (audio, media, mic) and extract the frame scheduler into `core/scheduler.js` so it can be unit-tested, swapped, and reused.
		 - Acceptance criteria:
			 - `audioPlayCues` moved to `future/web/core/commands/audio-commands.js` and registered from `engine.js`.
			 - Scheduler logic (single-run lock, pending flag, timers) implemented in `future/web/core/scheduler.js` with a small adapter in `engine.js`.
			 - Unit tests added for `audio-commands` and `scheduler` behavior, and a browser smoke test that verifies `/?debug=true` boots and audio dispatch works.
		 - Rationale: improves separation of concerns, testability, and reduces risk when changing timing policies.
-   **[ ] `TEST-1`:** Add smoke tests in `runtime-shims` for new workers (depth, melody, motion with objects, pointer) and OSC output.
-   **[ ] `UI-7`:** Update dev-panel to display new cues (depth, melody, objects, pointer) and allow paradigm switching.
-   **[ ] `AUDIO-4`:** Integrate OSC output for external synth control (melody notes, VCF modulation via egomotion). VERY LOW PRIORITY, WE MIGHT LEAVE THIS ATM