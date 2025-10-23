# Runtime Shims - Module Smoke Testing

**Version:** 2025-10-23  
**Purpose:** Test individual modules in isolation using Node.js, without needing a browser or the full application.

---

## Quick Start

### Use Case
When working with a coding agent or remote tester, include these shims alongside your module so they can:
1. Run smoke tests immediately
2. Verify the module doesn't have circular dependencies
3. Check the module's dependencies are met
4. Test initialization logic

**NOT for:** Production use. These are test approximations only.

1. **LLM-assisted development** - Include these with module code to enable smoke testing in remote environments

2. **Unit testing** - Run module logic in Node.js without browser dependenciesFiles

3. **Debugging** - Test individual modules without the complexity of the full app

4. **Documentation** - Demonstrate module dependencies and initialization patterns- engine-stub.js — minimal engine: dispatch, getState, onStateChange, registerCommand

- dom-shim.js — minimal DOM object used across UI modules (uiPanelRoot, mainContainer, videoFeed, frameCanvas)

**⚠️ CRITICAL: These are TEST HELPERS, not production code.** They approximate browser APIs but cannot replace real browser testing.- fake-audio-context.js — a tiny FakeAudioContext and FakeAudioManager to simulate Web Audio in Node

- fake-worker.js — a minimal FakeWorker constructor usable by modules expecting Worker

---- settings-facade.js — simple settings object (maxNotes, motionThreshold, flags)

- logger-shim.js — a tiny structuredLog wrapper that prints readable output

## File Inventory- run-example.js — small example that demonstrates initializing audio and video modules with these shims



| File | Purpose | What It Provides |How to use

|------|---------|------------------|

| `engine-stub.js` | Minimal command bus | `dispatch()`, `getState()`, `onStateChange()`, `registerCommand()` |1. Copy this `runtime-shims/` directory into your upload bundle with the target module (audio, video or ui).

| `dom-shim.js` | Minimal DOM references | Common UI elements (`uiPanelRoot`, `mainContainer`, `videoFeed`, etc.) |2. In the remote environment (LLM runner or local machine), run the example to smoke the module:

| `fake-audio-context.js` | Web Audio API mock | `FakeAudioContext`, `FakeAudioManager` with basic nodes |

| `fake-worker.js` | Web Worker mock | `FakeWorker` that simulates async message passing |```bash

| `settings-facade.js` | Default settings | Common app settings (`maxNotes`, `motionThreshold`, etc.) |node run-example.js

| `logger-shim.js` | Logging helper | Simplified `structuredLog()` for console output |```

| `run-example.js` | Integration test | Example showing how to initialize audio + video modules |

Notes and limitations

---

- These shims are intentionally tiny and approximate browser APIs. They are not substitutes for full browser testing.

## How to Use- Real browser behaviors (audio unlock quirks, precise Worker performance, camera devices) cannot be fully emulated.

- Keep shims versioned with the repository if you rely on them frequently; they should remain minimal to reduce maintenance.

### Option 1: Direct Node.js Testing



```bashPackaging for LLM uploads

cd future/web/runtime-shims-------------------------

node run-example.js

```You can bundle a single module folder (for example `future/web/audio`) together with this `runtime-shims/` directory into a single text file suitable for uploading to LLMs or remote testers. The repository includes a helper script at `scripts/package_for_llm.cjs` which does this for you.



This will:Example (from repo root):

1. Initialize fake browser globals (`window`, `document`, `navigator`)

2. Load the shims```bash

3. Import and initialize audio and video modulesnode scripts/package_for_llm.cjs future/web/audio artifacts/audio_with_shims.package.txt

4. Run basic smoke tests (process frame, play cues)```



### Option 2: Include in LLM Upload PackagesWhat the script does:

- Recursively collects files under the target folder and `future/web/runtime-shims`.

When sending module code to LLMs or remote testing environments:- Writes a single plain-text file containing a JSON metadata block and per-file separators.

- Caps embedded file content at 1 MB and inserts a `__FILE_TOO_LARGE__` placeholder for very large files.

```bash

# From repo root:Sanitization tips before uploading:

node scripts/package_for_llm.cjs future/web/audio artifacts/audio_with_shims.package.txt- If you need to remove absolute paths, open the package text and remove lines starting with `# AbsolutePath:`.

```- Remove large binary files (images/audio) from the package or replace them with a short description.

- Optionally strip long test artifacts or node_modules to reduce size.

This bundles your module with runtime-shims into a single text file.

If you'd like, I can also add an option to the packager to automatically sanitize absolute paths or exclude specific globs (for example `**/*.wav`), and then re-run the packaging for you.

### Option 3: Manual Integration in Tests

````

```javascriptRuntime shims for isolated module debugging

import { FakeAudioManager } from './runtime-shims/fake-audio-context.js';

import { engine } from './runtime-shims/engine-stub.js';Purpose

import { initializeAudio } from '../audio/audio-processor.js';

This folder contains tiny, well-documented stubs that let you run or test a single module (audio, video, or ui) without uploading the entire app. Include these files alongside the module you send to an LLM or tester so it can run smoke tests locally.

const audioManager = new FakeAudioManager();

await audioManager.unlockAudio();Files

await initializeAudio({ audioManager, maxNotes: 16, settings: {} });

```- engine-stub.js — minimal engine: dispatch, getState, onStateChange, registerCommand

- dom-shim.js — minimal DOM object used across UI modules (uiPanelRoot, mainContainer, videoFeed, frameCanvas)

---- fake-audio-context.js — a tiny FakeAudioContext and FakeAudioManager to simulate Web Audio in Node

- fake-worker.js — a minimal FakeWorker constructor usable by modules expecting Worker

## Shim Details- settings-facade.js — simple settings object (maxNotes, motionThreshold, flags)

- logger-shim.js — a tiny structuredLog wrapper that prints readable output

### `engine-stub.js` - The Command Bus Mock- run-example.js — small example that demonstrates initializing audio and video modules with these shims



**Purpose:** Simulates the central engine's command dispatch and state management.How to use



**API:**1. Copy this `runtime-shims/` directory into your upload bundle with the target module (audio, video or ui).

```javascript2. In the remote environment (LLM runner or local machine), run the example to smoke the module:

engine.dispatch('commandName', payload);  // Logs command, no-op by default

engine.getState();                        // Returns minimal state object```bash

engine.onStateChange(callback);           // No-op (doesn't trigger callbacks)node run-example.js

engine.registerCommand(name, handler);    // Logs registration```

```

Notes and limitations

**Limitations:**

- Does NOT execute command handlers (just logs)- These shims are intentionally tiny and approximate browser APIs. They are not substitutes for full browser testing.

- Does NOT trigger state change listeners- Real browser behaviors (audio unlock quirks, precise Worker performance, camera devices) cannot be fully emulated.

- Does NOT maintain real application state- Keep shims versioned with the repository if you rely on them frequently; they should remain minimal to reduce maintenance.



**When to Use:**
- Testing modules that dispatch commands
- Verifying command names and payloads
- Smoke testing initialization code

### `dom-shim.js` - Minimal DOM References

**Purpose:** Provides stub DOM elements that UI modules expect.

**API:**
```javascript
DOM.uiPanelRoot      // Mock container with appendChild
DOM.mainContainer    // Mock with addEventListener  
DOM.videoFeed        // Mock video element with play/pause
DOM.frameCanvas      // Mock canvas with getContext
DOM.button1          // null (can be assigned)
DOM.audioManager     // null (can be assigned)
```

**Limitations:**
- Does NOT render to screen
- Does NOT support real event propagation
- Does NOT support CSS or layout

**When to Use:**
- Testing UI module initialization
- Verifying DOM manipulation logic
- Checking event listener registration

### `fake-audio-context.js` - Web Audio API Mock

**Purpose:** Simulates Web Audio API for audio module testing.

**API:**
```javascript
const ctx = new FakeAudioContext();
await ctx.resume();                // Changes state to 'running'
const gain = ctx.createGain();     // Returns mock GainNode
const osc = ctx.createOscillator(); // Returns mock OscillatorNode

const manager = new FakeAudioManager();
await manager.unlockAudio();       // Resumes fake context
```

**Limitations:**
- Does NOT produce sound
- Does NOT simulate audio timing accurately
- Does NOT validate audio graph connections

**When to Use:**
- Testing synth initialization
- Verifying audio graph construction
- Checking oscillator/gain node usage

**⚠️ Important:** This mock does NOT catch connection errors or missing `masterGain` issues!

### `fake-worker.js` - Web Worker Mock

**Purpose:** Simulates Web Worker message passing.

**API:**
```javascript
const worker = new FakeWorker('./path/to/worker.js');
worker.onmessage = (e) => { /* handle e.data */ };
worker.postMessage({ type: 'command', data });
worker.terminate();
```

**Behavior:**
- Sends synthetic `{ type: 'ready', features: [] }` on construction
- Echoes back `{ type: 'result', result: { movingRegions: [] } }` on postMessage
- All messages are async (via setTimeout)

**Limitations:**
- Does NOT load or execute real worker code
- Does NOT simulate worker threading
- Does NOT handle transferable objects

**When to Use:**
- Testing worker initialization
- Verifying message format contracts
- Checking message handler logic

### `logger-shim.js` - Simplified Logging

**Purpose:** Provides `structuredLog()` compatible with the real logging system.

**API:**
```javascript
structuredLog('INFO', 'Message', { metadata });
structuredLog('ERROR', 'Error occurred', { error: e.message });
```

**Behavior:**
- Outputs to console.info/warn/error based on level
- Formats as JSON for easy parsing

**Limitations:**
- Does NOT persist to IndexedDB
- Does NOT support log level filtering
- Does NOT include userAgent or stack traces

### `settings-facade.js` - Default Settings

**Purpose:** Provides minimal application settings object.

**API:**
```javascript
import { settings } from './settings-facade.js';
console.log(settings.maxNotes);        // 16
console.log(settings.motionThreshold); // 20
```

**When to Use:**
- Providing default configuration to modules
- Testing settings-dependent behavior

---

## Critical Limitations (READ BEFORE USING)

### ❌ These Shims DO NOT:
1. **Validate audio graph correctness** - They won't catch missing `masterGain` connections
2. **Execute real worker code** - FakeWorker just echoes synthetic responses
3. **Simulate browser quirks** - No audio unlock, no camera permissions, no CORS
4. **Measure real performance** - No actual frame timing or audio latency
5. **Handle real DOM events** - No bubbling, no preventDefault, no focus management
6. **Persist state** - No localStorage, no IndexedDB, no cookies

### ⚠️ Common Gotchas:
- **Audio module tests pass but sound doesn't work in browser** - Shim doesn't validate connections
- **Worker tests pass but real worker crashes** - Shim doesn't load actual worker code
- **UI tests pass but layout breaks** - Shim doesn't render or compute styles
- **Performance looks fine but browser stutters** - Shim doesn't measure real costs

### ✅ What Shims ARE Good For:
- Verifying module initialization logic
- Checking command dispatch patterns
- Testing message format contracts
- Validating state management logic
- Catching import errors and syntax issues
- Smoke testing before browser integration

---

## Packaging for LLM Uploads

The repository includes a helper script for bundling modules with shims:

```bash
# From repo root:
node scripts/package_for_llm.cjs <source-dir> <output-file>

# Examples:
node scripts/package_for_llm.cjs future/web/audio artifacts/audio_with_shims.package.txt
node scripts/package_for_llm.cjs future/web/video artifacts/video_with_shims.package.txt
node scripts/package_for_llm.cjs future/web/ui/dev-panel artifacts/devpanel_with_shims.package.txt
```

### What the Packager Does:
1. Recursively collects files from `<source-dir>` and `future/web/runtime-shims`
2. Creates a single text file with JSON metadata and file separators
3. Caps individual files at 1 MB (inserts `__FILE_TOO_LARGE__` placeholder)
4. Preserves directory structure for imports

### Sanitization Tips:
- Remove absolute paths if privacy is a concern (lines starting with `# AbsolutePath:`)
- Exclude large binaries (images, audio, video) before packaging
- Strip `node_modules` and test artifacts to reduce size
- Remove sensitive configuration (API keys, tokens)

---

## Testing Workflow

### Before Running Browser Tests:
1. **Run shim tests first** - `node run-example.js`
2. **Fix initialization errors** - Shims catch import/syntax issues
3. **Verify command patterns** - Check engine.dispatch calls
4. **Check message contracts** - Validate worker message formats

### After Shim Tests Pass:
1. **Run real browser tests** - Use Playwright/Puppeteer
2. **Test with real audio** - Verify sound output
3. **Test with real camera** - Check video processing
4. **Measure real performance** - Profile frame timing
5. **Test on mobile** - Verify touch gestures and battery usage

### Debugging Failed Browser Tests:
- If shim tests passed but browser fails → Check browser-specific APIs
- If browser tests pass but behavior wrong → Check real-world timing/performance
- If both fail → Fix initialization logic first, then browser integration

---

## Examples

### Example 1: Testing Audio Synth Initialization

```javascript
import { FakeAudioManager } from './runtime-shims/fake-audio-context.js';
import { initializeAudio } from '../audio/audio-processor.js';

// Setup
const audioManager = new FakeAudioManager();
await audioManager.unlockAudio();

// Initialize with minimal settings
await initializeAudio({ 
  audioManager, 
  maxNotes: 16, 
  settings: { enableHRTF: false } 
});

// Test: Verify initialization doesn't throw
console.log('✓ Audio initialized successfully');

// Test: Call playCues with empty array (should not throw)
const { playCues } = await import('../audio/audio-processor.js');
await playCues([]);
console.log('✓ playCues handles empty array');

// Test: Call with single cue
await playCues([{ 
  objectType: 'test', 
  frequency: 440, 
  pan: 0, 
  duration: 0.1,
  intensity: 0.5 
}]);
console.log('✓ playCues handles single cue');
```

### Example 2: Testing Video Worker Communication

```javascript
import { FakeWorker } from './runtime-shims/fake-worker.js';
import { initializeVideo } from '../video/frame-processor.js';

// Initialize with FakeWorker
const videoAPI = initializeVideo({ 
  WorkerCtor: FakeWorker,
  workerBaseUrl: './',
  motionThreshold: 20,
  settings: {}
});

// Test: Verify worker is created
console.log('✓ Video initialized, API keys:', Object.keys(videoAPI));

// Test: Process frame with fake data
const fakeImageData = new Uint8ClampedArray(640 * 480 * 4);
const result = await videoAPI.processFrame(fakeImageData, 640, 480);
console.log('✓ processFrame returned:', result);

// Test: Verify result structure
if (result && Array.isArray(result.movingRegions)) {
  console.log('✓ Result has expected structure');
}
```

### Example 3: Testing UI Module Disposal

```javascript
import { engine } from './runtime-shims/engine-stub.js';
import { DOM } from './runtime-shims/dom-shim.js';
import { initializeDevPanel } from '../ui/dev-panel/dev-panel.js';

// Initialize UI
const { dispose } = initializeDevPanel(engine, DOM);

// Test: Verify dispose function exists
if (typeof dispose === 'function') {
  console.log('✓ UI module provides dispose function');
} else {
  console.error('✗ UI module missing dispose function');
  process.exit(1);
}

// Test: Call dispose (should not throw)
dispose();
console.log('✓ dispose() executed without errors');
```

---

## Maintenance

### When to Update Shims:
- Module APIs change (new parameters, different return types)
- New browser APIs are used by modules
- Test patterns evolve (new common mocking needs)

### Versioning Strategy:
- Keep shims in sync with main codebase
- Update shims in same PR that changes module APIs
- Document breaking changes in this README

### File Size Budget:
- Keep each shim < 100 lines
- If a shim grows beyond 100 lines, split it into multiple files
- Prefer multiple small shims over one large "god object"

---

**Last Updated:** 7 October 2025 - Added comprehensive testing guidelines and LLM gotchas by Claude Sonnet 4.5
