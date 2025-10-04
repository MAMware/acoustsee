High-level plan
- Make grid/synth selection changes immediately update state and inspector, and ensure audio actually switches to the selected synth.
- Make Video Size always appear by sourcing dimensions from either the state or whichever video element has them, and reflect them into state for consistency.
- Fix the “eventQueue is not defined” error so processing doesn’t get interrupted by analytics.

Actions taken

1) Inspector not updating on grid/synth changes + audio not matching selection
- Always dispatch changes from the controls:
  - Updated dev-panel.actions.js so `#grid-type-select` and `#synth-engine-select` always dispatch without depending on `window.settings` being populated.
- Ensure the audio engine actually switches synths:
  - Added a selected-synth override in audio-processor.js:
    - New function `setSelectedSynthEngine(engineId)` maps the engine id to a playFunction from available-synths.js and remembers it.
    - `playCues` now uses the globally selected playFunction (when set), overriding the profile’s default, so audio output aligns with the selection immediately.
  - Call it when the synth engine changes:
    - In settings-commands.js, after setting `synthesisEngine` in state, I call `setSelectedSynthEngine(newEngineId)`.
- Inspector reactivity:
  - The State Inspector already listens to `engine.onStateChange`. With the fixed dispatch wiring, changing grid/synth now updates state, triggers listeners, and re-renders.
  - Also fixed an ID collision that could prevent rendering by giving the inspector’s internal container a unique id (`#state-groups-content`) so it no longer collides with the outer `#state-content`.

2) “Video Size: W × H” not showing
- Stable updater that doesn’t get wiped by inspector re-renders:
  - In dev-panel.js, the “Video Size” label is appended to the stable state section container (not inside the inspector’s inner grid).
- More robust dimension detection:
  - The updater now looks for dimensions in this order: state.videoSize → preview video → main video.
  - Listens to `loadedmetadata`, `loadeddata`, `playing`, and `resize` on both the preview and main video, and also does a short, half-second polling until dimensions appear.
- Reflects into state:
  - Once dimensions are known, the code sets `engine.setState({ videoSize: { width, height } })`, so the value is visible in the State Inspector and stays consistent.

3) Crash: “Uncaught ReferenceError: eventQueue is not defined”
- Fixed analytics queue scoping:
  - In ingest.js, moved `eventQueue` and `lastFlushTime` to module scope and removed shadowed declarations, so `queueEvent` can always access them.
  - Wrapped queueing with try/catch and added a safe log path that never breaks command dispatch.

Notes you can verify now
- Inspector updates: Change the “Grid Type” and “Synth Engine” from the Developer Panel and watch the “Core System” section update immediately (gridType and synthesisEngine).
- Audio aligns with selection: You should hear the synth actually change when you pick a different engine.
- Video Size: After the camera starts, “Video Size: W × H” should appear under the State Inspector. It will show based on either state or the active video element (main or preview).
- No more ingest error spam: “eventQueue is not defined” should disappear from logs.

If anything still feels off
- Grid not influencing sonification: If you still feel the chosen grid doesn’t affect audio as expected, I can trace from `frame-processor` → `grids` → `sonification-commands` to confirm the selected `gridType` is being used to produce cues (and not overridden elsewhere).
- If the Video Size still doesn’t appear on a specific device, I’ll add a tiny fallback that reads `DOM.frameCanvas.width/height` as a last resort, just in case the video element defers metadata longer than expected.

Completion summary
- Done:
  - Controls dispatch wiring fixed (grid/synth).
  - Audio engine now respects selected synth via `setSelectedSynthEngine`.
  - State Inspector re-renders correctly on selection changes.
  - Video size appears reliably and is reflected into state.
  - Analytics “eventQueue” ReferenceError fixed.
- Next optional:
  - Trace grid influence in cue generation if you want me to verify the full grid → audio mapping end-to-end.

Made changes.