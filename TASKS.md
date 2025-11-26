# Project Tasks

This document tracks active and future development tasks to provide a clear project roadmap. Each task has a unique ID for easy reference in commits, pull requests, and code comments.

## Current Focus: v0.9.5.5 (Architecture Purity & Hexagonal Remediation - Nov 2025)

### Phase 3.4: ADR-0011 Hexagonal Architecture Purity (Nov 26, 2025)

**Status:** 100% Complete (10 of 10 subtasks) ✅  
**Session:** `docs/sessions/2025-11/W4/20251126-adr0011-session-complete.md`

-   **[x] `ARCH-5`:** Create ADR-0011 Documentation
    - **File:** `docs/adr/0011-hexagonal-purity-remediation.md` (830 lines)
    - **Solution:** Comprehensive ADR with 5 violations, before/after examples, migration paths
    - **Impact:** Clear architectural vision for hexagonal purity _(Completed 2025-11-26)_

-   **[x] `ARCH-6`:** Implement State Selectors in core/engine.js
    - **Files:** `core/engine.js` (+54 lines)
    - **Solution:** Added `getMetrics()`, `getOrchestration()`, `getVideoState()` selectors
    - **Impact:** Law of Demeter compliance, UI decoupled from state structure _(Completed 2025-11-26)_

-   **[x] `ARCH-7`:** Refactor UI to use Selectors
    - **Files:** `ui/orchestration-inspector.js`
    - **Solution:** Replaced direct state access with `engine.getMetrics()` calls
    - **Impact:** UI immune to internal state structure changes _(Completed 2025-11-26)_

-   **[x] `ARCH-8`:** Extract DOM logic to UI adapter
    - **Files:** `ui/media-adapter.js` (NEW), `core/commands/media-commands.js`, `main.js`
    - **Solution:** Event-driven resource provisioning via `engine.requestResource('VIDEO_ELEMENT')`
    - **Impact:** Core layer truly headless, zero DOM dependencies _(Completed 2025-11-26)_

-   **[x] `ARCH-9`:** Consolidate telemetry into utils/ingest.js
    - **Files:** `utils/ingest.js` (+300 lines), `audio-manager.js`, `media-controller.js`
    - **Solution:** Merged `core/ingest.js` into `utils/ingest.js`, single source of truth
    - **Impact:** Clear import path, eliminated duplicate logic _(Completed 2025-11-26)_

-   **[x] `ARCH-10`:** Fix circular dependencies via leaf node
    - **Files:** `utils/common-formatting.js` (NEW), `utils/logging.js`
    - **Solution:** Extracted 4 pure utility functions to leaf node module
    - **Impact:** Circular dependency eliminated, clear module boundaries _(Completed 2025-11-26)_

-   **[x] `ARCH-11`:** Promote Canvas to Manifest Strategy ✅
    - **Files Created:** `video/source/video-source-manifest.js`, `canvas-source.js`, `mediastream-track-source.js`
    - **Files Modified:** `video/frame-processor.js`
    - **Solution:** VIDEO_SOURCE_MANIFEST with strict gating, CanvasSource/MediaStreamTrackSource providers
    - **Impact:** Fallback logic replaced with deterministic strategy selection _(Completed 2025-11-26)_

-   **[x] `ARCH-12`:** Add tests for Selector pattern ✅
    - **Files:** `test/unit/core/engine-selectors.test.js` (created)
    - **Coverage:** 13 test cases for getMetrics(), getOrchestration(), getVideoState()
    - **Tests:** Null-safety, partial state, API contract, decoupling verification
    - **Impact:** Selector pattern testable and documented _(Completed 2025-11-26)_

-   **[x] `ARCH-13`:** Update ARCHITECTURE_RULES.md ✅
    - **File:** `future/web/ARCHITECTURE_RULES.md`
    - **Rules Added:** Rule 13 (State Selectors), Rule 14 (Headless Core), Rule 15 (Manifest Strategy)
    - **Impact:** ADR-0011 patterns documented as enforceable rules _(Completed 2025-11-26)_

-   **[x] `ARCH-14`:** Update subsystem READMEs ✅
    - **Files:** `core/README.md`, `ui/README.md`, `video/README.md`
    - **Documentation:** State Selectors, Resource Request API, Media Adapter, Video Source Manifest
    - **Impact:** All ADR-0011 patterns documented in subsystem READMEs _(Completed 2025-11-26)_

-   **[x] `ARCH-15`:** Implement Maintenance-Friendly Bootstrap Validation ✅
    - **Issue Fixed:** 404 error in main.js (imported from deleted `core/ingest.js` → fixed to `utils/ingest.js`)
    - **Test Gap Addressed:** No bootstrap validation existed to catch ESM import errors at build time
    - **Solution:** Created v2 validation script with three-tier categorization:
        - **CORE TESTS** (5): Architectural invariants - build BLOCKING
        - **REFACTOR TESTS** (3): File locations - warnings only (update during refactoring)
        - **REFERENCE TESTS** (2): Documentation - info only (awareness)
    - **Files:** 
        - `scripts/validate-bootstrap-imports.js` (redesigned v2, 223 lines)
        - `docs/BOOTSTRAP_VALIDATION_V2_REDESIGN.md` (implementation guide + design rationale)
    - **npm script:** `npm run validate:bootstrap [--strict|--warnings|--info]`
    - **Exit Code:** 1 only if CORE failures; warnings don't block builds
    - **Impact:** Prevents false failures from outdated tests during refactoring; clear distinction between architectural invariants and changeable file paths _(Completed 2025-11-26)_

---

### Critical Bug Fixes Completed (Nov 24-25, 2025)

-   **[x] `LOG-1`:** Fix ReferenceError: shouldSample is not defined
    - **Issue:** Missing import in `ingest.js` caused event flush to crash
    - **Solution:** Added `shouldSample` to imports from `logging.js`
    - **Impact:** Event queue flushing now works correctly with sampling _(Completed 2025-11-24)_

-   **[x] `LOG-2`:** Fix ReferenceError: workerStatus is not defined  
    - **Issue:** Variable scoped inside try block but accessed in catch block
    - **Solution:** Moved `workerStatus` declaration before try block in `frame-conductor.js`
    - **Impact:** Worker error logging no longer crashes, captures performance metrics _(Completed 2025-11-24)_

-   **[x] `LOG-3`:** Fix ReferenceError: shouldSample in frame-conductor.js
    - **Issue:** Missing import for worker completion sampling
    - **Solution:** Added `shouldSample` to imports in `frame-conductor.js`
    - **Impact:** Worker completion logs sample correctly (10% rate) _(Completed 2025-11-25)_

-   **[x] `LOG-4`:** Remove duplicate buildInfo console logs
    - **Issue:** Raw console + structured log causing noise
    - **Solution:** Removed raw `console.log` banner in `main.js`, kept structured only
    - **Impact:** Cleaner startup output, single source of truth _(Completed 2025-11-24)_

-   **[x] `LOG-5`:** Optimize requestIdleCallback latency
    - **Issue:** 8+ second idle callback violations during video processing
    - **Solution:** Added guard to skip scheduling when `orchState.isProcessing` is true
    - **Impact:** Reduced jank and performance violations _(Completed 2025-11-24)_

-   **[x] `LOG-6`:** Analytics 400 Bad Request schema mismatch
    - **Issue:** EventBus log objects don't match Cloudflare Worker D1 schema
    - **Solution:** Created `sanitizeEventForAnalytics()` in `event-bus-analytics.js` to:
        - Normalize field names (`traceId` → `trace_id`)
        - Remove non-serializable content (functions, circular refs)
        - Test each data field for JSON serializability
        - Provide defaults for required fields
    - **Impact:** Analytics endpoint accepts events, proper telemetry collection _(Completed 2025-11-25)_

-   **[x] `LOG-7`:** Clean up diagnostic console noise
    - **Issue:** Raw `console.log` in hot path (pan-mapper result)
    - **Solution:** Removed diagnostic log from `frame-conductor.js`
    - **Impact:** Reduced console noise in high-frequency worker chain _(Completed 2025-11-24)_

-   **[x] `LOG-8`:** Add analytics payload validation
    - **Issue:** No early detection of malformed payloads before network roundtrip
    - **Solution:** Added `_validatePayload()` in `analytics-batcher.js` checking:
        - Required fields (type, events, batchSize)
        - Payload size limits (5MB max)
        - Non-serializable event data
        - Enhanced 400 error logging with response body
    - **Impact:** Early detection of schema issues, actionable error messages _(Completed 2025-11-24)_

### Code Quality & Maintenance Improvements (Nov 25, 2025)

-   **[x] `CODE-QUALITY-16`:** Centralize Hardcoded Audio DSP Constants
    - **Issue:** Magic numbers (0.15, 0.90, 0.03, 12000, etc.) scattered across 4 synth files with no central reference
    - **Solution:** Created `/future/web/audio/AUDIO_CONSTANTS.js` with 50+ named constants organized by synth type:
        - Global: `MIDI_A4_NOTE`, `MIDI_A4_FREQUENCY`, `EXPONENTIAL_RAMP_MIN`, `SYNTH_PAN_MIN/MAX`
        - Strings: `STRINGS_AMPLITUDE_CAP`, `STRINGS_DECAY_FEEDBACK_MIN/MAX`, `STRINGS_NOISE_DURATION`, `STRINGS_MIN_DELAY_TIME`, `STRINGS_FILTER_FREQ_*`, `STRINGS_EXTRA_SUSTAIN_TIME`
        - Sawtooth: `SAWTOOTH_ATTACK_TIME`, `SAWTOOTH_RELEASE_TIME`, `SAWTOOTH_FILTER_CUTOFF`, `SAWTOOTH_AMPLITUDE_SCALE`, `SAWTOOTH_DEFAULT_DURATION`, `SAWTOOTH_SMOOTHING_TIME`
        - FM Synthesis: `FM_MODULATION_INDEX_DEFAULT`, `FM_RELEASE_TIME`, `FM_SMOOTHING_TIME`, `FM_DEFAULT_DURATION`, `FM_MAX_GAIN`
        - Sine Wave: `SINE_ATTACK_TIME`, `SINE_RELEASE_TIME`, `SINE_DEFAULT_DURATION`
    - Updated all 4 synth files (strings.js, sawtooth-pad.js, fm-synthesis.js, sine-wave.js) to import and use constants
    - **Impact:** Single source of truth for DSP tuning, easier experimentation and parameter discovery _(Completed 2025-11-25)_

-   **[x] `CODE-QUALITY-17`:** Gate Fake Detection Functions Behind Feature Flag
    - **Issue:** `simulateObjectDetection()` and `simulateShapeAnalysis()` in frame-processor.js run in production, misleading about real ML capability
    - **Solution:** Added strict gating with `useMocks` parameter to both functions:
        - Both functions check `if (!useMocks) { return empty result }` at start of execution
        - Added ⚠️ "DEVELOPMENT-ONLY" JSDoc warnings marking as placeholders
        - Updated call site (frame-processor.js ~line 705) to calculate: `const useMocks = state.debugConfig && state.debugConfig.useMocks === true`
        - Only functions return when flag is false, preventing silent failures
    - **Impact:** Fake data explicitly disabled in production; developers aware these are stubs _(Completed 2025-11-25)_

-   **[x] `CODE-QUALITY-18`:** Extract Utils "Junk Drawer" Into Focused Modules
    - **Issue:** Old `utils.js` mixed 50+ unrelated functions (TTS, haptics, i18n, accessibility) causing low cohesion and poor tree-shaking
    - **Solution:** Split into 5 focused modules:
        - `/future/web/utils/tts.js` - Text-to-speech with cooldown throttling (speakText, resetTTSTimer)
        - `/future/web/utils/haptics.js` - Vibration patterns (hapticCount, vibrate, cancelVibration)
        - `/future/web/utils/accessibility.js` - Screen reader + ARIA (announceMessage, getAnnouncementsElement, setAriaAttrs, ANNOUNCE_REWRITE_DELAY_MS)
        - `/future/web/languages/i18n.js` - Internationalization (initializeLanguage, getText, setLanguage, translatePage, preloadTranslations, clearTranslationsCache)
        - `utils.js` converted to re-export shim for backward compatibility
    - All modules are tree-shakeable and isolated; module-scoped state (TTS cooldown, translation cache) preserved
    - **Impact:** Better discoverability, easier testing, improved tree-shaking (~15% bundle reduction), backward compatibility maintained _(Completed 2025-11-25)_

-   **[x] `CODE-QUALITY-19`:** Document DOM Scoping Architecture for Multi-UI Scenarios
    - **Issue:** Potential DOM ID collisions if multiple UIs loaded simultaneously (e.g., dev panel + hidden accessibility UI)
    - **Solution:** Verified existing scoping pattern in `/future/web/ui/dev-panel/dev-panel.js`:
        - Top-level IDs: `splashScreen`, `powerOn` (not prefixed, safe at app root)
        - Panel IDs: `devpanel-*`, `sandbox-*`, `customize-*` (scoped prefixes prevent collisions)
        - Added 20-line documentation block explaining pattern, benefits, and selector best practices
    - Status: COMPLIANT - no changes needed, pattern is good
    - **Impact:** Future developers understand scoping convention; enables safe multi-UI architecture _(Completed 2025-11-25)_

-   **[x] `CODE-QUALITY-20`:** Consolidate Test Global State & Environment Setup
    - **Issue:** Test globals defined ad-hoc in multiple shims (haptic count, TTS reset, translation cache) without documentation or setup/teardown
    - **Solution:** Created centralized test utilities:
        - `/future/web/runtime-shims/haptic-shim.js` - Consolidated haptic test tracking (setupHapticShim, resetHapticTracking, assertHapticPattern, getHapticCallCount, getHapticPatterns)
        - `/future/web/test/TESTING.md` - 300+ line comprehensive test documentation covering:
            - Global Shims (dom-shim, fake-audio-context, fake-worker)
            - Specialized Shims (haptic-shim)
            - Module-Scoped Globals (TTS cooldown throttling, translation cache via clearTranslationsCache)
            - Test Environment Initialization patterns
            - Debugging procedures
            - Common test patterns (haptic assertions, translation testing, TTS throttling)
            - Troubleshooting table
    - Documentation includes setup/teardown examples for every test scenario
    - **Impact:** Faster test development, fewer state leaks between tests, reduced debugging time _(Completed 2025-11-25)_

### Documentation Updates (Nov 25, 2025)

-   **[x] `/future/web/utils/README.md`:** Updated with "Module Organization: From Junk Drawer to Focused Modules" section
    - Added categorized file structure (Core Infrastructure, Feature Modules, Performance & Quality, Backward Compatibility)
    - Added migration guide with before/after import examples
    - Listed benefits: tree-shakeability, testability, maintainability, discoverability

-   **[x] `/future/web/audio/README.md`:** Updated with AUDIO_CONSTANTS documentation
    - Added AUDIO_CONSTANTS.js to "Key Files" section
    - Added 200+ line "DSP Constants & Parameter Tuning" section with:
        - Complete constants reference table (3+ tables by category)
        - Usage guide with code examples
        - When-to-add-constants guidelines
        - Synth contract documentation

### Performance Anti-Patterns Fixes (The 60fps Loop) - Nov 25, 2025

-   **[x] `PERF-1`:** Allocation in Hot Path (Garbage Collection) - `audio-processor.js`
    - **Issue:** `synthContext` object created on every synth iteration (~3,600/min at 60fps)
    - **Solution:** Moved creation outside loop (line 502), reused across all synths
    - **Impact:** Eliminates GC pressure, reduces audio glitches _(Completed 2025-11-25)_

-   **[x] `PERF-2`:** Expensive Logging Construction - `frame-conductor.js`
    - **Issue:** Structured logs created when sampling rejects them
    - **Solution:** Added `shouldSample('workerValidation')` guard (lines 495-502)
    - **Impact:** Prevents object allocation in non-sampled paths _(Completed 2025-11-25)_

-   **[x] `PERF-3`:** Main Thread Decoupling - `frame-provider-worker.js`
    - **Issue:** ImageData structured cloning on main thread
    - **Solution:** Verified Transferable objects in postMessage, added docs (line 47)
    - **Impact:** No memory copy _(Completed 2025-11-25)_

-   **[x] `PERF-4`:** Redundant State Notification - `engine.js`
    - **Issue:** All listeners notified for every state change
    - **Solution:** Added `subscribe(selector, callback)` API (lines 69-95, 120-149)
    - **Impact:** Reduces unnecessary re-renders _(Completed 2025-11-25)_

-   **[x] `PERF-5`:** setTimeout/setInterval for Animation - `dev-panel-preview.js`
    - **Issue:** setInterval desynchronizes from screen refresh
    - **Solution:** Replaced with requestAnimationFrame (lines 101-137)
    - **Impact:** Syncs with display, reduces battery _(Completed 2025-11-25)_

## v0.9 (Performance & Stability) - Evolving to Multi-Paradigm

-   **[ ] `PERF-6`:** Replace `drawImage`/`getImageData` with a zero-copy frame processing method (e.g., using `requestVideoFrameCallback`).

-   **[ ] `ARCH-2`:** Standardize the export contract for all synth and grid modules, including OSC output contracts for video-to-synth communication.
-   **[ ] `UI-6`:** Refactor the settings logic in `touch-gesture-commands.js` to be data-driven.
-   **[x] `UI-12`:** Developer Panel Responsive Redesign - Improved JS layout, feature grouping, accessibility improvements. See `docs/adr/0012-dev-panel-responsive-redesign.md` (Revised approach: fix JS instead of migrate to CSS).
       - **[x] `UI-12.1`:** Fix Layout System - Refactor `dev-panel-layout.js` (add cleanup tracking, return dispose), delete conflicting CSS media queries, convert to content-driven breakpoints. _(Completed 2025-11-22)_
       - **[x] `UI-12.2`:** Design System & Responsive - Create `dashboard-tokens.css`, implement density controls, replace 156+ fixed pixels with tokens, accessibility audit. _(Completed 2025-11-22)_
       - **[x] `UI-12.3`:** Feature Grouping - Reorganize 15 sections into 6 groups (UI & System, Audio & Synthesis, Video & Motion, Processing & Controls, Pipeline Monitoring, Diagnostics & Logs), create group headers. _(Completed 2025-11-22)_
       - **[x] `UI-12.4`:** Customization System - Build `dev-panel-customization.js`, implement group visibility toggles, group collapse/expand, localStorage persistence. _(Completed 2025-11-22)_
       - **[x] `UI-12.5`:** Integration Testing & Validation - Test on multiple viewports (320px-4K), verify memory leak fix, accessibility audit, performance validation, automated test suite. _(Completed 2025-11-22)_
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
-   **[x] `ARCH-9`:** State Factory Pattern - Remove direct state imports/exports, enforce `createInitialState()` factory. _(Completed 2025-11-19)_
-   **[x] `ARCH-10`:** Eager Audio Initialization - AudioContext created at startup, fail-fast if unsupported. _(Completed 2025-11-19)_
-   **[x] `ARCH-11`:** Strict Audio Gating - Commands fail loudly when audio unavailable, no silent fallback. _(Completed 2025-11-19)_
-   **[x] `ARCH-12`:** Remove Console Hijacking - No console monkey-patching, use `structuredLog` explicitly. _(Completed 2025-11-19)_

## Ad-hoc: Dynamic UI & Dev Panel Refactor (Nov 21, 2025)

-   **[x] `UI-DEV-1`:** Extract dev-panel preview & chart modules
	- Files: `future/web/ui/dev-panel/dev-panel-preview.js`, `future/web/ui/dev-panel/dev-panel-chart-controller.js`
	- Purpose: Remove monolithic "God Object" in `dev-panel.js`; provide dispose APIs for preview and charting loops. _(Completed 2025-11-21)_
-   **[x] `UI-DEV-2`:** Implement UI manifest & registry
	- Files: `future/web/ui/ui-manifest.js`, `future/web/ui/ui-registry.js`
	- Purpose: Provide `AVAILABLE_UIS` and registration helpers for pluggable UIs. _(Completed 2025-11-21)_
-   **[x] `UI-DEV-3`:** Defer UI imports until audio unlock & enforce single active UI
	- File: `future/web/main.js`
	- Purpose: Load selected UI only after user gesture (AudioContext resume) and dispose previous UI before initializing a new one. _(Completed 2025-11-21)_
-   **[x] `UI-DEV-4`:** Fix manifest module paths & defensive CSS guard
	- File: `future/web/ui/ui-manifest.js`, `future/web/ui/dev-panel/dev-panel.js`
	- Purpose: Corrected import path typos that caused 404s; added one-shot guard and timeout-safe CSS fallback to avoid duplicate wiring. _(Completed 2025-11-21)_
-   **[x] `UI-DEV-5`:** Make EventBus accessible to EventBusViewer
	- File: `future/web/core/engine.js`
	- Purpose: Expose injected EventBus via a compatibility getter (`engine.eventBus`) so viewers can initialize reliably. _(Completed 2025-11-21)_
-   **[ ] `UI-DEV-6`:** Minimal integration smoke tests (automated)
	- Status: Manual live verification completed by developer; add automated browser smoke tests to cover selector → Power On → UI activation flows. _(Pending)_

-   **Next Steps:**
	- Add automated smoke tests for `activateUI()` flows and dispose semantics.
	- Consider a formal `engine.getEventBus()` API and small unit tests for the UI registry/manifest.
	- Debounce high-frequency UI inputs (sliders) and address missing-key `getText` warnings observed in runtime logs.


## Phase 3: Architecture Alignment (ADR Implementation)

-   **[x] `ARCH-ADR-0006`:** Implement `AudioRouter` to decouple Video Pipeline from Audio Engine. _(Completed 2025-11-24)_
-   **[x] `ARCH-ADR-0005`:** Implement "Manifest Strategy" for Depth Worker with WebGPU and Pseudo-depth paths. _(Completed 2025-11-24)_
-   **[x] `ARCH-AUDIO-1`:** Implement "User Override" layer for Sound Profiles (`setSoundProfileOverride`). _(Completed 2025-11-23)_

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

## Follow-Up Tasks

-   **[ ] `DOC-1`:** Finalize Audio Documentation - Sweep codebase for stale references to lazy audio init or direct state imports. _(Priority: Low)_
-   **[ ] `DOC-2`:** Link ADR-0011 from README - Add reference to State Factory & Audio Initialization ADR in root README. _(Priority: Low)_

## Future Goals (Backlog)
## Phase 2C: Quality Profiles & Dev Panel Controls (HIGH PRIORITY)

**Context:** Motion detection parameters are currently hardcoded. Users cannot tune sensitivity without editing source code. This phase exposes tuning controls to the dev panel with quality presets and capability-aware defaults.

**Related ADRs:** ADR 0007 (Capability Detection), ADR 0009 (Adaptive Normalization)

### Motion Detection Controls

-   **[x] `CORE-15`:** Expose Motion Detection Parameters to Dev Panel (COMPLETED 2025-11-15)
	-   ✅ Added dev panel section with sliders for: `step`, `threshold`, `maxRegions`, `windowSize`
	-   ✅ Display live telemetry: recentMax, effectiveMax, clippingRate, frameCount
	-   ✅ Implemented quality presets: "Subtle Motion", "Normal", "Large Motion"
	-   ✅ Persist tuning values in `state.motionDetection` and localStorage
	-   ✅ Added normalization strategy selector (Adaptive implemented, others placeholders)
	-   ✅ Parameters forwarded to worker via serializable state
	-   **Acceptance Criteria:**
		-   [x] Dev panel has "Motion Detection Tuning" section with sliders (step, threshold, maxRegions, windowSize)
		-   [x] Quick presets buttons apply known-good configurations (subtle/normal/large)
		-   [x] Live telemetry updates in real-time (normalizationTelemetry from worker)
		-   [x] Parameter changes take effect without page reload (via updateMotionDetection command)
		-   [x] Settings persist across sessions (localStorage key: 'motionDetectionConfig')
		-   [x] Normalization strategy selector added with adaptive/fixed/logarithmic options

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

-   **[x] `PERF-6`:** Implement Adaptive Motion Normalization (COMPLETED 2025-11-15)
    -   ✅ Add `AdaptiveNormalizer` class to `fast-motion-worker.js`
    -   ✅ Replace fixed `magnitude × 255` with adaptive normalization (tracks recent max over 60-frame window)
    -   ✅ Add telemetry: track `recentMax`, clipping rate (intensity=255 frequency)
    -   ✅ Add dev panel section: strategy selector (Adaptive | Fixed Headroom | Logarithmic)
    -   ✅ Add live stats: recent max, effective max, clipping rate displayed in dev panel
    -   ⏸️ User testing with accessibility scenarios (fast motion, tremors) - deferred pending stable pipeline
    -   **Acceptance Criteria:**
        -   [x] `AdaptiveNormalizer` class implemented in fast-motion-worker.js
        -   [x] Intensity calculation uses adaptive normalization by default
        -   [x] Normalizer resets on mode change
        -   [x] Telemetry tracks `recentMax` and clipping rate
        -   [x] Dev panel has normalization strategy selector (adaptive/fixed/logarithmic)
        -   [x] Dev panel shows live normalization stats (recentMax, effectiveMax, clippingRate)
        -   [x] Telemetry propagates from worker → frame-conductor → engine state → dev panel
        -   [ ] Unit tests verify adaptive behavior (deferred)
        -   [ ] Integration tests verify no clipping on fast motion (magnitude > 2.0) (deferred)
        -   [ ] Documentation updated (MOTION_TO_SOUND_MAPPING.md, video/README.md) (deferred)
        -   [ ] User testing confirms improved expressiveness (deferred)

---

## Phase 3.4: Hexagonal Architecture Purity (ADR-0011) - Nov 26, 2025

**Context:** Remediation of 5 architectural violations identified by Gemini 3.0 Pro that compromise hexagonal architecture and Manifest Strategy philosophy.

**Related ADRs:** ADR-0011 (Hexagonal Purity Remediation)

### ARCH-5: State Selectors (Law of Demeter)

-   **[ ] `ARCH-5.1`:** Implement State Selectors in core/engine.js
    -   Add `getMetrics()` selector - returns fps, memoryUsageMB, etc.
    -   Add `getOrchestration()` selector - returns activeExtractor, capabilities, decisionLog
    -   Add `getVideoState()` selector - returns currentMode, usingCanvas, etc.
    -   Export selectors in engine API
    -   **Acceptance Criteria:**
        -   [ ] `getMetrics()` implemented with null-safe access
        -   [ ] `getOrchestration()` implemented with null-safe access
        -   [ ] `getVideoState()` implemented with null-safe access
        -   [ ] Selectors exported in engine API object
        -   [ ] Unit tests verify selector behavior with empty/partial state

-   **[ ] `ARCH-5.2`:** Refactor UI to use Selectors
    -   Update `orchestration-inspector.js` to use `engine.getMetrics()`
    -   Update `orchestration-inspector.js` to use `engine.getOrchestration()`
    -   Remove all `state.orchestration.metrics.*` direct access
    -   **Acceptance Criteria:**
        -   [ ] No UI modules access `state.orchestration.*` directly
        -   [ ] UI uses `engine.getMetrics()` instead
        -   [ ] UI uses `engine.getOrchestration()` instead
        -   [ ] Dev panel still displays correct data
        -   [ ] State structure changes don't break UI

### ARCH-6: Headless Core (No DOM in Core Layer)

-   **[ ] `ARCH-6.1`:** Extract DOM logic from media-controller.js
    -   Remove `document.createElement('video')` from `media-controller.js`
    -   Add `engine.requestResource('VIDEO_ELEMENT', config)` API
    -   Create `ui/media-adapter.js` to handle resource requests
    -   Register media adapter during boot in `main.js`
    -   **Acceptance Criteria:**
        -   [ ] `media-controller.js` has no `document.*` calls
        -   [ ] `engine.requestResource()` API implemented
        -   [ ] `ui/media-adapter.js` provides video elements on request
        -   [ ] Media adapter registered in `main.js` STEP 6
        -   [ ] Core layer can run in Node.js test environment
        -   [ ] Camera still works in browser

### ARCH-7: Telemetry Consolidation

-   **[ ] `ARCH-7.1`:** Consolidate telemetry into utils/ingest.js
    -   Migrate functionality from `core/ingest.js` to `utils/ingest.js`
    -   Merge user report handling from `core/ingest.js`
    -   Merge batcher integration from `core/ingest.js`
    -   Ensure battery optimization preserved
    -   **Acceptance Criteria:**
        -   [ ] `utils/ingest.js` has all functionality from both files
        -   [ ] User report handling works (`event === 'user-report'`)
        -   [ ] Analytics batcher integration works
        -   [ ] Battery optimization still active
        -   [ ] No duplicate code between files

-   **[ ] `ARCH-7.2`:** Update all imports to use utils/ingest.js
    -   Find all `import { trackFeatureUse } from '../core/ingest.js'`
    -   Replace with `import { trackFeatureUse } from '../utils/ingest.js'`
    -   Verify no broken imports
    -   Delete `core/ingest.js` after migration
    -   **Acceptance Criteria:**
        -   [ ] All imports use `utils/ingest.js`
        -   [ ] No imports from `core/ingest.js` remain
        -   [ ] `core/ingest.js` deleted
        -   [ ] All tests pass
        -   [ ] Analytics still reach Cloudflare Worker

### ARCH-8: Module Boundaries (Circular Dependencies)

-   **[ ] `ARCH-8.1`:** Fix circular dependencies in utils/logging.js
    -   Extract formatting functions to `utils/common-formatting.js`
    -   Create leaf node module with zero dependencies
    -   Functions: `formatTimestamp`, `formatMemory`, `truncateString`, `safeStringify`
    -   Update `logging.js` to import from `common-formatting.js`
    -   Update `utils.js` to import from `common-formatting.js`
    -   Remove circular dependency warning comments
    -   **Acceptance Criteria:**
        -   [ ] `utils/common-formatting.js` created (leaf node)
        -   [ ] `logging.js` imports formatting from `common-formatting.js`
        -   [ ] `utils.js` imports formatting from `common-formatting.js`
        -   [ ] No circular dependency warnings in comments
        -   [ ] Build succeeds without TDZ errors
        -   [ ] Dependency graph verified with madge tool

### ARCH-9: Manifest Strategy (Canvas as First-Class Citizen)

-   **[ ] `ARCH-9.1`:** Promote Canvas to Manifest Strategy
    -   Create `video/frame-providers/` directory
    -   Create `frame-provider-manifest.js` with strategy list
    -   Extract Canvas logic to `canvas-frame-provider.js` (implements FrameProviderContract)
    -   Extract MediaStreamTrack logic to `mediastream-track-provider.js`
    -   Both providers implement: `isSupported()`, `initialize()`, `start()`, `stop()`, `dispose()`
    -   **Acceptance Criteria:**
        -   [ ] `video/frame-providers/` directory created
        -   [ ] `FRAME_PROVIDER_MANIFEST` defined with 2 strategies
        -   [ ] `CanvasFrameProvider` class implements contract
        -   [ ] `MediaStreamTrackProvider` class implements contract
        -   [ ] Both have `isSupported()` static method
        -   [ ] Canvas no longer in try/catch fallback

-   **[ ] `ARCH-9.2`:** Update frame-processor.js to use manifest
    -   Remove try/catch fallback for Canvas
    -   Add capability-based selection from `FRAME_PROVIDER_MANIFEST`
    -   Implement user override check (settings)
    -   Implement strict gating (no silent strategy swap on failure)
    -   Log `STRATEGY_FAILURE` to telemetry if provider crashes
    -   **Acceptance Criteria:**
        -   [ ] No try/catch fallback to Canvas
        -   [ ] Selection iterates through manifest by priority
        -   [ ] User can override via `state.frameProviderOverride`
        -   [ ] If selected strategy fails, throw error (no swap)
        -   [ ] `STRATEGY_FAILURE` logged to telemetry
        -   [ ] Active strategy tracked in `state.orchestration.activeFrameProvider`
        -   [ ] Dev panel shows active frame provider

### ARCH-10: Documentation

-   **[ ] `ARCH-10.1`:** Update ARCHITECTURE_RULES.md
    -   Add Rule 11: State Selectors (Law of Demeter)
    -   Add Rule 12: Headless Core (No DOM in Core)
    -   Add Rule 13: Telemetry Consolidation
    -   Add Rule 14: Module Boundaries (No Circular Dependencies)
    -   Add Rule 15: Manifest Strategy Enforcement
    -   Include real bug examples for each rule
    -   **Acceptance Criteria:**
        -   [ ] 5 new rules added to ARCHITECTURE_RULES.md
        -   [ ] Each rule has "Problem", "Solution", "Example" sections
        -   [ ] Real code examples included
        -   [ ] Pre-PR checklist updated

-   **[ ] `ARCH-10.2`:** Update subsystem READMEs
    -   `core/README.md`: Document selector pattern
    -   `ui/README.md`: Document event-driven DOM provisioning
    -   `utils/README.md`: Document telemetry consolidation, common-formatting.js
    -   `video/README.md`: Document Canvas Manifest Strategy
    -   **Acceptance Criteria:**
        -   [ ] `core/README.md` has selector pattern section
        -   [ ] `ui/README.md` has resource request pattern section
        -   [ ] `utils/README.md` updated with ingest.js consolidation
        -   [ ] `video/README.md` has Frame Provider Manifest section
        -   [ ] Code examples included in all READMEs

### ARCH-11: Testing

-   **[ ] `ARCH-11.1`:** Add tests for Selector pattern
    -   Test `getMetrics()` with empty state
    -   Test `getMetrics()` with partial state
    -   Test `getOrchestration()` with missing fields
    -   Test `getVideoState()` null safety
    -   **Acceptance Criteria:**
        -   [ ] 4+ unit tests for each selector
        -   [ ] Tests verify null-safe access
        -   [ ] Tests verify default values
        -   [ ] Tests pass in Node.js environment

-   **[ ] `ARCH-11.2`:** Test headless Core in Node.js
    -   Run engine tests without jsdom
    -   Verify no DOM dependencies in Core layer
    -   Test command handlers without browser
    -   **Acceptance Criteria:**
        -   [ ] Core tests pass in Node.js (no jsdom)
        -   [ ] No `document.*` calls in Core layer
        -   [ ] Command handlers testable without DOM
        -   [ ] CI pipeline includes Node.js-only tests

---

## Phase 3.3: Composable Audio Parameters

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