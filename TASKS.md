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

## Phase 2A: Orchestration Visibility (Week 1-2)

### Week 1: Foundation (✅ APPROVED)

-   **[x] `ORCH-1.1`:** Orchestration State Structure - `orchestration-state.js` (180 lines). State schema with extractor types, capabilities, metrics. _(Completed 2025-10-21)_

-   **[x] `ORCH-1.2`:** Capability Detection - `capability-detector.js` (165 lines). Detects 6 device capabilities (MSTP, Canvas2D, WebGL, WebGPU, Offscreen Canvas, WASM). _(Completed 2025-10-21)_

-   **[x] `ORCH-1.3`:** Metrics Collection - `metrics-collector.js` (290 lines). Real-time metrics with circular buffer, <5% CPU overhead, phase timing. _(Completed 2025-10-21)_

### Week 2: UI Component

-   **[x] `ORCH-2.1`:** OrchestrationInspector UI Component - `orchestration-inspector.js` (350+ lines) + `orchestration-inspector.css` (200+ lines). Visual display in dev panel with 7 sections: header, extractor, capabilities grid, metrics, utilization bars, decision log, mode footer. Event handlers (refresh/export/toggle). Integration into dev-panel.js complete. _(Completed 2025-10-21)_

-   **[ ] `ORCH-2.2`:** Integration Verification - Load app with `?debug=true`, verify component renders, test all buttons, validate state updates, smoke test in runtime-shims. _(Pending)_

-   **[ ] `ORCH-2.3`:** Styling & Accessibility Polish - WCAG AA compliance review, keyboard navigation testing, responsive design validation on mobile/tablet. _(Pending)_

-   **[ ] `ORCH-2.4`:** Documentation & Testing - Update ARCHITECTURE.md, add runtime smoke test, document state schema. _(Pending)_

## Future Goals (Backlog)
## Phase 2C: Quality Profiles & Dev Panel Controls (HIGH PRIORITY)

**Context:** Motion detection parameters are currently hardcoded. Users cannot tune sensitivity without editing source code. This phase exposes tuning controls to the dev panel with quality presets and capability-aware defaults.

**Related ADRs:** ADR 0007 (Capability Detection), ADR 0009 (Adaptive Normalization)

### Motion Detection Controls

-   **[ ] `CORE-15`:** Expose Motion Detection Parameters to Dev Panel
	-   Add dev panel section with sliders for: `step`, `threshold`, `maxRegions`, `windowSize`
	-   Display live stats: detected regions, average intensity, frame time
	-   Implement quality presets: "Subtle Motion", "Normal", "Large Motion"
	-   Persist tuning values in `state.motionDetection` and localStorage
	-   Add telemetry to track parameter usage patterns
	-   **Acceptance Criteria:**
		-   [ ] Dev panel has "Motion Detection Tuning" section with 4 sliders
		-   [ ] Quick presets buttons apply known-good configurations
		-   [ ] Live stats update in real-time (regions detected, avg intensity)
		-   [ ] Parameter changes take effect without page reload
		-   [ ] Settings persist across sessions (localStorage)
		-   [ ] Documentation updated with tuning guidelines

### Capability-Based Adaptation

-   **[ ] `ARCH-8`:** Implement Capability Detection (Replace Mobile/Desktop Checks)
	-   Create `future/web/utils/capability-detector.js`
	-   Detect: CPU cores, RAM, GPU (WebGPU/WebGL2/WebGL/none), battery status
	-   Create `future/web/video/quality-strategy-manifest.js` with 4 strategies:
		-   `highPerformance`: 8+ cores, 8GB+, WebGPU → maxRegions=128, step=4
		-   `balanced`: 4+ cores, 4GB+, WebGL2 → maxRegions=64, step=6
		-   `lowPower`: 2+ cores, 2GB+, WebGL → maxRegions=32, step=8
		-   `minimal`: 1+ cores, 1GB+, none → maxRegions=16, step=12
	-   Integrate with boot sequence in `boot.js`
	-   Add dev panel display: detected capabilities + selected strategy
	-   Search codebase for `isMobile()` / `isDesktop()` and replace with capability checks
	-   **Acceptance Criteria:**
		-   [ ] `capability-detector.js` implemented with device capability detection
		-   [ ] `quality-strategy-manifest.js` defines 4 quality strategies
		-   [ ] Boot sequence selects strategy based on capabilities
		-   [ ] State contains `orchestration.capabilities` and `orchestration.qualityStrategy`
		-   [ ] Dev panel shows detected capabilities (cores, RAM, GPU)
		-   [ ] Dev panel allows manual strategy override
		-   [ ] All `isMobile()` checks removed from codebase
		-   [ ] Tests verify strategy selection logic
		-   [ ] Documentation updated (ADR 0007, video/README.md)

## Phase 3.2: AudioRouter & Adaptive Normalization

**Context:** Audio routing is currently hardcoded. Motion intensity clips on fast gestures, losing expressiveness. This phase adds capability-aware routing and adaptive normalization.

**Related ADRs:** ADR 0006 (Video-to-Audio Restructure), ADR 0009 (Adaptive Normalization)

### Performance & Expressiveness

-   **[~] `PERF-6`:** Implement Adaptive Motion Normalization _(Status: Core implementation complete 2025-11-15; dev panel controls pending Phase 2C)_
    -   Add `AdaptiveNormalizer` class to `fast-motion-worker.js`
    -   Replace fixed `magnitude × 255` with adaptive normalization (tracks recent max over 60-frame window)
    -   Add telemetry: track `recentMax`, clipping rate (intensity=255 frequency)
    -   Add dev panel section: strategy selector (Adaptive | Fixed Headroom | Logarithmic)
    -   Add live stats: recent max, effective max, current magnitude → intensity
    -   User testing with accessibility scenarios (fast motion, tremors)
    -   **Acceptance Criteria:**
        -   [x] `AdaptiveNormalizer` class implemented in fast-motion-worker.js
        -   [x] Intensity calculation uses adaptive normalization by default
        -   [x] Normalizer resets on mode change
        -   [x] Telemetry tracks `recentMax` and clipping rate
        -   [ ] Dev panel has normalization strategy selector (Phase 2C)
        -   [ ] Dev panel shows live normalization stats (Phase 2C)
        -   [ ] Unit tests verify adaptive behavior (Phase 2C)
        -   [ ] Integration tests verify no clipping on fast motion (magnitude > 2.0)
        -   [ ] Documentation updated (MOTION_TO_SOUND_MAPPING.md, video/README.md)
        -   [ ] User testing confirms improved expressiveness## Phase 3.3: Composable Audio Parameters

**Context:** Audio parameters (ADSR, filters) are synth-specific and not mappable to video data. This phase makes parameters composable and exposes video→audio mappings to the dev panel.

**Related ADRs:** ADR 0008 (Composable Audio Parameters), ADR 0006 (Phase 3 context)

### Audio Architecture Improvements

-   **[ ] `AUDIO-12`:** Implement Composable Audio Parameters & Video→Audio Mappings
	-   Add full ADSR support to all synths (attack, decay, sustain, release)
	-   Create `future/web/audio/filter-processor.js` for global filter system
	-   Add `filters` array to all sound profiles (not synth-specific)
	-   Implement mapping system in `AudioRouter`:
		-   `depth → filters[0].frequency` (closer = brighter)
		-   `uFlow → envelope.attack` (faster = sharper attack)
		-   `vFlow → pitch` (Doppler effect)
		-   `intensity → filters[0].Q` (louder = more resonance)
	-   Add dev panel section: ADSR sliders, filter controls, mapping editor
	-   Implement preset system: save/load mapping configurations
	-   **Acceptance Criteria:**
		-   [ ] All synths support full ADSR (attack, decay, sustain, release)
		-   [ ] `filter-processor.js` implemented with global filter application
		-   [ ] All sound profiles have `filters` array
		-   [ ] Mapping system implemented in AudioRouter
		-   [ ] At least 3 example mappings per object type
		-   [ ] Dev panel has ADSR controls (4 sliders per sound profile)
		-   [ ] Dev panel has filter controls (type, frequency, Q)
		-   [ ] Dev panel has mapping editor (source → target dropdowns)
		-   [ ] Preset system implemented (save/load/delete mappings)
		-   [ ] Unit tests for mapping functions
		-   [ ] Documentation updated (audio/README.md, ADR 0008)
		-   [ ] Smoke tests verify mappings work (depth affects brightness, etc.)

---


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