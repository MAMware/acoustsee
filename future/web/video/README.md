# Video Subsystem

This directory contains all logic for video capture, processing, and analysis. The system is built on a modern, multi-worker "FrameProvider -> Orchestrator -> Specialists" architecture designed for performance, modularity, and real-time adaptation.

## Core Architecture

1.  **`workers/frame-provider-worker.js` (The Frame Provider):**
    *   The sole entry point for camera data.
    *   Runs its own `requestAnimationFrame` loop in a dedicated worker.
    *   Uses `OffscreenCanvas` and `MediaStreamTrackProcessor` to efficiently capture frames without blocking the main thread.
    *   Produces a clean, steady stream of `ImageData` and dispatches it to the main thread.

2.  **`frame-processor.js` (The Orchestrator):**
    *   The central "brain" of the video pipeline, initialized via `initializeVideo()`.
    *   Receives clean frames from the `FrameProvider`.
    *   Based on the application's mode (`flow` vs. `focus`), it delegates analysis tasks to the appropriate Specialist Workers.

3.  **Specialist Workers (`workers/motion-worker.js`, etc.):**
    *   Experts in a single, computationally expensive task (e.g., motion detection, depth estimation).
    *   They receive frame data from the Orchestrator and return structured analysis results (e.g., `movingRegions`).

4.  **Grids (`grids/`):**
    *   Pluggable "sonic sculptor" modules that translate the analysis data from Specialists into a musical concept.
    *   **In `Flow` mode:** They map raw spatial data (like motion) into a soundscape.
    *   **In `Focus` mode:** They map semantic data (like an object's detected shape) into a sonic signature or melody.

## Data Flow

1.  **Input:** The `FrameProvider` captures a video frame.
2.  **Orchestration:** The `Orchestrator` receives the frame and dispatches it to active `Specialist(s)`.
3.  **Analysis:** The `Specialist(s)` return structured results (e.g., `movingRegions`).
4.  **Grid Mapping:** The `Orchestrator` passes these results to the active `Grid`'s `mapFunction`.
5.  **Output:** The `Grid`'s `mapFunction` returns an object containing an array of `cues`. The Orchestrator then dispatches these cues in an `'audioCuesReady'` event for the audio subsystem to consume.
