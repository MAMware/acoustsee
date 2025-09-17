# Project Tasks

This document tracks active and future development tasks to provide a clear project roadmap. Each task has a unique ID for easy reference in commits, pull requests, and code comments.

## Current Focus: v0.9 (Performance & Stability)

-   **[ ] `PERF-1`:** Replace `drawImage`/`getImageData` with a zero-copy frame processing method (e.g., using `requestVideoFrameCallback`).
-   **[ ] `ARCH-1`:** Consolidate `microphone-controller.js` into `media-controller.js` per ADR-0001.
-   **[ ] `ARCH-2`:** Standardize the export contract for all synth and grid modules.
-   **[ ] `UI-6`:** Refactor the settings logic in `touch-gesture-commands.js` to be data-driven.

## Completed Tasks

-   **[x] `UI-5`:** Refactor the `powerOn` button handler in `main.js`. _(Completed 2025-09-13)_

## Future Goals (Backlog)

-   **[ ] `AUDIO-3`:** Implement a data-driven manifest for synth settings.
-   **[ ] `DOCS-1`:** Add data flow diagrams to `ARCHITECTURE.md`.
