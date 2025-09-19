````markdown
Runtime shims for isolated module debugging

Purpose

This folder contains tiny, well-documented stubs that let you run or test a single module (audio, video, or ui) without uploading the entire app. Include these files alongside the module you send to an LLM or tester so it can run smoke tests locally.

Files

- engine-stub.js — minimal engine: dispatch, getState, onStateChange, registerCommand
- dom-shim.js — minimal DOM object used across UI modules (uiPanelRoot, mainContainer, videoFeed, frameCanvas)
- fake-audio-context.js — a tiny FakeAudioContext and FakeAudioManager to simulate Web Audio in Node
- fake-worker.js — a minimal FakeWorker constructor usable by modules expecting Worker
- settings-facade.js — simple settings object (maxNotes, motionThreshold, flags)
- logger-shim.js — a tiny structuredLog wrapper that prints readable output
- run-example.js — small example that demonstrates initializing audio and video modules with these shims

How to use

1. Copy this `runtime-shims/` directory into your upload bundle with the target module (audio, video or ui).
2. In the remote environment (LLM runner or local machine), run the example to smoke the module:

```bash
node run-example.js
```

Notes and limitations

- These shims are intentionally tiny and approximate browser APIs. They are not substitutes for full browser testing.
- Real browser behaviors (audio unlock quirks, precise Worker performance, camera devices) cannot be fully emulated.
- Keep shims versioned with the repository if you rely on them frequently; they should remain minimal to reduce maintenance.


Packaging for LLM uploads
-------------------------

You can bundle a single module folder (for example `future/web/audio`) together with this `runtime-shims/` directory into a single text file suitable for uploading to LLMs or remote testers. The repository includes a helper script at `scripts/package_for_llm.cjs` which does this for you.

Example (from repo root):

```bash
node scripts/package_for_llm.cjs future/web/audio artifacts/audio_with_shims.package.txt
```

What the script does:
- Recursively collects files under the target folder and `future/web/runtime-shims`.
- Writes a single plain-text file containing a JSON metadata block and per-file separators.
- Caps embedded file content at 1 MB and inserts a `__FILE_TOO_LARGE__` placeholder for very large files.

Sanitization tips before uploading:
- If you need to remove absolute paths, open the package text and remove lines starting with `# AbsolutePath:`.
- Remove large binary files (images/audio) from the package or replace them with a short description.
- Optionally strip long test artifacts or node_modules to reduce size.

If you'd like, I can also add an option to the packager to automatically sanitize absolute paths or exclude specific globs (for example `**/*.wav`), and then re-run the packaging for you.

````
Runtime shims for isolated module debugging

Purpose

This folder contains tiny, well-documented stubs that let you run or test a single module (audio, video, or ui) without uploading the entire app. Include these files alongside the module you send to an LLM or tester so it can run smoke tests locally.

Files

- engine-stub.js — minimal engine: dispatch, getState, onStateChange, registerCommand
- dom-shim.js — minimal DOM object used across UI modules (uiPanelRoot, mainContainer, videoFeed, frameCanvas)
- fake-audio-context.js — a tiny FakeAudioContext and FakeAudioManager to simulate Web Audio in Node
- fake-worker.js — a minimal FakeWorker constructor usable by modules expecting Worker
- settings-facade.js — simple settings object (maxNotes, motionThreshold, flags)
- logger-shim.js — a tiny structuredLog wrapper that prints readable output
- run-example.js — small example that demonstrates initializing audio and video modules with these shims

How to use

1. Copy this `runtime-shims/` directory into your upload bundle with the target module (audio, video or ui).
2. In the remote environment (LLM runner or local machine), run the example to smoke the module:

```bash
node run-example.js
```

Notes and limitations

- These shims are intentionally tiny and approximate browser APIs. They are not substitutes for full browser testing.
- Real browser behaviors (audio unlock quirks, precise Worker performance, camera devices) cannot be fully emulated.
- Keep shims versioned with the repository if you rely on them frequently; they should remain minimal to reduce maintenance.

