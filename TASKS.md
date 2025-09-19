# Project Tasks

This document tracks active and future development tasks to provide a clear project roadmap. Each task has a unique ID for easy reference in commits, pull requests, and code comments.

## Current Focus: v0.9 (Performance & Stability)

-   **[ ] `PERF-1`:** Replace `drawImage`/`getImageData` with a zero-copy frame processing method (e.g., using `requestVideoFrameCallback`).
-   **[ ] `ARCH-1`:** Consolidate `microphone-controller.js` into `media-controller.js` per ADR-0001.
-   **[ ] `ARCH-2`:** Standardize the export contract for all synth and grid modules.
-   **[ ] `UI-6`:** Refactor the settings logic in `touch-gesture-commands.js` to be data-driven.
 -   **[ ] `ARCH-3`:** Define and implement a dual-paradigm architecture ("Flow" and "Focus" modes). See `docs/adr/0002-dual-paradigm-navigation-and-identification-modes.md`.

## Completed Tasks

-   **[x] `UI-5`:** Refactor the `powerOn` button handler in `main.js`. _(Completed 2025-09-13)_

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
