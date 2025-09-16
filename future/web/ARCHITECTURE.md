# AcoustSee Architecture Guide

This document defines the architectural contracts, patterns, and guardrails for AcoustSee. Follow these rules for all contributions.

## 1. Core Philosophy
AcoustSee is modular, testable, and extensible. Keep concerns separated: core logic, UI, and platform integration must remain decoupled.

## 2. Headless Engine Pattern
- `web/core/` contains the headless Engine and command handlers.
- Core modules must not access `window`, `document`, or import anything from `web/ui/`.
- The Engine exposes `engine.dispatch(command, payload)` and registers command handlers in `web/core/commands/`.
- Command handlers return structured results (objects) and should not throw uncaught errors.

## 3. Directory Responsibilities
- `web/core/` — state machine, command registration, headless business logic.
- `web/core/commands/` — grouped command implementations (media, settings, debug, performance).
- `web/ui/` — pluggable UI modules; each UI lives in its own subdirectory (e.g., `ui/debug/`, `ui/touch-gestures/`).
- `web/audio/`, `web/video/`, `web/utils/`, `web/debug/` — well-scoped helpers and workers.

## 4. Pluggable UI Contract
Each UI module must:
- Live under `web/ui/<name>/`.
- Export `initialize<Name>UI(engine, DOM, options = {})` (exact export name documented in the module README).
- Create its DOM under a provided root (use `DOM.uiPanelRoot` if supplied).
- Load its own stylesheet dynamically and run DOM measurement/wiring only in `link.onload`.
- Use scoped IDs/prefixes to avoid collisions (e.g., `acoustsee-debug-*`).
- Use event delegation where possible and avoid fragile index-based child access.
- Return a `dispose()` function (or attach it to the panel) that removes event listeners, clears intervals, stops polling, and removes created DOM.

Example signature:
```js
export function initializeDebugUI(engine, DOM, options = {}) {
  // returns { dispose() { ... } }
}
```

## 5. UI Submodule Structure
A UI directory should contain:
- `debug-ui.js` (coordinator)
- `debug-ui.behavior.js` (layout/visual behavior)
- `debug-ui.actions.js` (event wiring)
- `debug-ui.controls.js` (factory helpers)
- `debug-ui.css` (styles)
- `worker-charts.js` or other contained subcomponents
All files must be copy-paste-ready and complete.

## 6. Synth / Audio Contract
- `web/audio/audio-processor.js` is the Conductor; `playCues(cues)` is the entry point.
- Synths in `web/audio/synths/` are pure: they accept (notes, context) and must not mutate global state.
- The audio subsystem may throw internal errors, but command handlers should catch and return structured failure results.

## 7. Guardrails — What Not To Do
- Do not add business logic to `core/engine.js`.
- Do not import UI modules into `core/` — enforce via lint rule.
- Avoid fragile DOM access by index; prefer data-action attributes and delegation.
- Avoid creating global IDs without module prefix.
- Avoid starting polling/intervals without exposing a dispose that stops them.

## 8. CSS & Layout Rules
- UI modules must load CSS via a `<link>` element and do layout in `link.onload`.
- Use a consistent stylesheet path resolution strategy (absolute or `document.baseURI`-aware).
- Controls should use responsive two-column grids where appropriate.

## 9. Error Reporting and Logging
- Core: structured logging (level, message, meta). Command handlers should use structured log helpers.
- UI: non-blocking user notifications for errors; log to debug console pane.
- Each UI module should log its module load with version badge: `console.log('module loaded', BUILD_VERSION)` when available.

## 10. Testing & CI
- Unit tests required for core command handlers and audio processor logic.
- UI smoke tests (headless/browser) required for each UI module (e.g., Playwright or Puppeteer).
- Linting rules must enforce core/ui import boundaries.
- PRs must include tests for new command handlers or UI behaviors.

## 11. Accessibility & Internationalization
- All interactive elements must provide keyboard access and ARIA attributes.
- Text must be extracted into `web/languages/` and UIs must support locale injection.

## 12. Versioning & Releases
- Expose BUILD_VERSION in `web/core/constants.js`. UIs should display the version badge.
- Keep changelog entries for architectural changes.

## 13. Onboarding & Maintenance
- Each UI folder must contain a README describing its public API and lifecycle (initialize + dispose).
- Keep a small architectural checklist in `docs/ARCHITECTURE_CHECKLIST.md` that PR reviewers use.

## 14. Enforcement
- Add a CI lint rule to fail builds on core -> ui imports.
- Add tests that assert UIs expose `dispose()` and that calling `initialize*UI` twice does not create duplicate IDs.

---

This file is authoritative. Follow it to prevent regressions and circular rework.// filepath: /workspaces/acoustsee/future/ARCHITECTURE.md
# AcoustSee Architecture Guide

This document defines the architectural contracts, patterns, and guardrails for AcoustSee. Follow these rules for all contributions.

## 1. Core Philosophy
AcoustSee is modular, testable, and extensible. Keep concerns separated: core logic, UI, and platform integration must remain decoupled.

## 2. Headless Engine Pattern
- `web/core/` contains the headless Engine and command handlers.
- Core modules must not access `window`, `document`, or import anything from `web/ui/`.
- The Engine exposes `engine.dispatch(command, payload)` and registers command handlers in `web/core/commands/`.
- Command handlers return structured results (objects) and should not throw uncaught errors.

## 3. Directory Responsibilities
- `web/core/` — state machine, command registration, headless business logic.
- `web/core/commands/` — grouped command implementations (media, settings, debug, performance).
- `web/ui/` — pluggable UI modules; each UI lives in its own subdirectory (e.g., `ui/debug/`, `ui/touch-gestures/`).
- `web/audio/`, `web/video/`, `web/utils/`, `web/debug/` — well-scoped helpers and workers.

## 4. Pluggable UI Contract
Each UI module must:
- Live under `web/ui/<name>/`.
- Export `initialize<Name>UI(engine, DOM, options = {})` (exact export name documented in the module README).
- Create its DOM under a provided root (use `DOM.uiPanelRoot` if supplied).
- Load its own stylesheet dynamically and run DOM measurement/wiring only in `link.onload`.
- Use scoped IDs/prefixes to avoid collisions (e.g., `acoustsee-debug-*`).
- Use event delegation where possible and avoid fragile index-based child access.
- Return a `dispose()` function (or attach it to the panel) that removes event listeners, clears intervals, stops polling, and removes created DOM.

Example signature:
```js
export function initializeDebugUI(engine, DOM, options = {}) {
  // returns { dispose() { ... } }
}
```

## 5. UI Submodule Structure
A UI directory should contain:
- `debug-ui.js` (coordinator)
- `debug-ui.behavior.js` (layout/visual behavior)
- `debug-ui.actions.js` (event wiring)
- `debug-ui.controls.js` (factory helpers)
- `debug-ui.css` (styles)
- `worker-charts.js` or other contained subcomponents
All files must be copy-paste-ready and complete.

## 6. Synth / Audio Contract
- `web/audio/audio-processor.js` is the Conductor; `playCues(cues)` is the entry point.
- Synths in `web/audio/synths/` are pure: they accept (notes, context) and must not mutate global state.
- The audio subsystem may throw internal errors, but command handlers should catch and return structured failure results.

## 7. Guardrails — What Not To Do
- Do not add business logic to `core/engine.js`.
- Do not import UI modules into `core/` — enforce via lint rule.
- Avoid fragile DOM access by index; prefer data-action attributes and delegation.
- Avoid creating global IDs without module prefix.
- Avoid starting polling/intervals without exposing a dispose that stops them.

## 8. CSS & Layout Rules
- UI modules must load CSS via a `<link>` element and do layout in `link.onload`.
- Use a consistent stylesheet path resolution strategy (absolute or `document.baseURI`-aware).
- Controls should use responsive two-column grids where appropriate.

## 9. Error Reporting and Logging
- Core: structured logging (level, message, meta). Command handlers should use structured log helpers.
- UI: non-blocking user notifications for errors; log to debug console pane.
- Each UI module should log its module load with version badge: `console.log('module loaded', BUILD_VERSION)` when available.

## 10. Testing & CI
- Unit tests required for core command handlers and audio processor logic.
- UI smoke tests (headless/browser) required for each UI module (e.g., Playwright or Puppeteer).
- Linting rules must enforce core/ui import boundaries.
- PRs must include tests for new command handlers or UI behaviors.

## 11. Accessibility & Internationalization
- All interactive elements must provide keyboard access and ARIA attributes.
- Text must be extracted into `web/languages/` and UIs must support locale injection.

## 12. Versioning & Releases
- Expose BUILD_VERSION in `web/core/constants.js`. UIs should display the version badge.
- Keep changelog entries for architectural changes.

## 13. Onboarding & Maintenance
- Each UI folder must contain a README describing its public API and lifecycle (initialize + dispose).
- Keep a small architectural checklist in `docs/ARCHITECTURE_CHECKLIST.md` that PR reviewers use.

## 14. Enforcement
- Add a CI lint rule to fail builds on core -> ui imports.
- Add tests that assert UIs expose `dispose()` and that calling `initialize*UI` twice does not create duplicate IDs.

---

This file is authoritative. Follow it to prevent regressions and circular rework.