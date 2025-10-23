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

---

## Option 1: Local Testing

```bash
cd future/web/runtime-shims
node run-example.js
```

Expected output:
```
✓ Audio module initialized
✓ Video module initialized
✓ Frame processing works
✓ Audio generation works
```

---

## Option 2: Remote Testing (LLM Upload)

Include when sending modules to remote agents:
1. Your module folder (e.g., `future/web/audio/`)
2. This `runtime-shims/` folder
3. Any dependencies it references

```bash
# From repo root:
node scripts/package_for_llm.cjs future/web/audio artifacts/audio_for_llm.txt
```

---

## File Reference

| File | Simulates | What It Does |
|------|-----------|-------------|
| `engine-stub.js` | `core/engine.js` | Provides `dispatch()`, `getState()`, `onStateChange()` |
| `dom-shim.js` | Browser DOM | Mock DOM elements (`uiPanelRoot`, `videoFeed`, etc.) |
| `fake-audio-context.js` | Web Audio API | Mock `AudioContext`, `OscillatorNode`, `GainNode`, etc. |
| `fake-worker.js` | Web Worker | Mock `Worker` with message passing |
| `settings-facade.js` | `core/state.js` | Minimal settings object |
| `logger-shim.js` | `utils/logging.js` | Simplified `structuredLog()` that prints to console |
| `run-example.js` | Integration test | Smoke test demonstrating module usage |

---

## How Shims Work

### Example: Testing Audio Module Initialization

```javascript
// run-example.js
import EngineStub from './engine-stub.js';
import FakeAudioContext from './fake-audio-context.js';
import { settings } from './settings-facade.js';

// Create minimal environment
const engine = new EngineStub();
const audioContext = new FakeAudioContext();

// Test: Can audio module initialize?
import { initializeAudio } from '../audio/audio-processor.js';
const result = initializeAudio({ audioManager: { audioContext } });

if (result.ok) {
  console.log('✓ Audio module initialized successfully');
} else {
  console.error('✗ Audio module failed:', result.error);
}
```

---

## Shim Details

### `engine-stub.js` - Command Bus Mock

**Purpose:** Simulates the central engine's command dispatch and state management.

**API:**
```javascript
engine.dispatch('commandName', payload);  // Logs command, no-op by default
engine.getState();                        // Returns minimal state object
engine.onStateChange(callback);           // No-op (doesn't trigger callbacks)
engine.registerCommand(name, handler);    // Logs registration
```

**Limitations:**
- Does NOT execute command handlers (just logs)
- Does NOT trigger state change listeners
- Does NOT maintain real application state

**When to Use:**
- Testing modules that dispatch commands
- Verifying command names and payloads
- Smoke testing initialization code

---

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

---

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

**⚠️ Important:** This mock does NOT catch connection errors or missing `masterGain` issues!

**When to Use:**
- Testing synth initialization
- Verifying audio graph construction
- Checking oscillator/gain node usage

---

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

---

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
| Gotcha | Why | Solution |
|--------|-----|----------|
| Audio tests pass but sound doesn't work | Shim doesn't validate connections | Run browser tests after shim tests pass |
| Worker tests pass but real worker crashes | Shim doesn't load actual worker code | Test worker logic separately in browser |
| UI tests pass but layout breaks | Shim doesn't render or compute styles | Use Playwright/Puppeteer for UI tests |
| Performance looks fine but stutters | Shim doesn't measure real costs | Profile in browser with DevTools |
| Commands don't work | Stub doesn't execute handlers | Verify handlers in engine integration tests |

### ✅ What Shims ARE Good For:
- Verifying module initialization logic
- Checking command dispatch patterns
- Testing message format contracts
- Validating state management logic
- Catching import errors and syntax issues
- Smoke testing before browser integration

---

## When Shims Fail

### "Module not found: core/engine.js"
**Cause:** Module is importing directly from core instead of using dependency injection
**Fix:** Pass engine instance during initialization, don't import it

### "Cannot read property 'dispatch' of undefined"
**Cause:** Engine stub not created or not passed to module
**Fix:** Ensure `engine = new EngineStub()` before module initialization

### "ReferenceError: window is not defined"
**Cause:** Module uses browser globals directly
**Fix:** Add to shim:
```javascript
global.window = {};
global.document = {};
global.navigator = {};
```

### "TypeError: audioContext.createOscillator is not a function"
**Cause:** Using real Web Audio instead of fake
**Fix:** Ensure you're importing `FakeAudioContext` not real `AudioContext`

### "Worker failed to load"
**Cause:** Trying to load actual worker code with FakeWorker
**Fix:** FakeWorker is synthetic only; test real workers in browser with Playwright

---

## Creating New Shims

When adding a new module subsystem, create corresponding shim:

```javascript
// fake-mysubsystem.js
export default class FakeMySubsystem {
  constructor() {
    this.active = false;
  }
  
  initialize() {
    this.active = true;
    return true;
  }
  
  process(data) {
    if (!this.active) throw new Error('Not initialized');
    return { result: data };  // Echo input for testing
  }
}
```

Then test in `run-example.js`:
```javascript
import FakeMySubsystem from './fake-mysubsystem.js';
const subsystem = new FakeMySubsystem();
console.log('✓ Created fake subsystem');
```

---

## Packaging for LLM Uploads

Use the helper script to bundle modules with shims:

```bash
# From repo root:
node scripts/package_for_llm.cjs <source-dir> <output-file>

# Examples:
node scripts/package_for_llm.cjs future/web/audio artifacts/audio_with_shims.txt
node scripts/package_for_llm.cjs future/web/video artifacts/video_with_shims.txt
node scripts/package_for_llm.cjs future/web/ui/dev-panel artifacts/devpanel_with_shims.txt
```

### What the Script Does:
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

### Example 1: Testing Audio Synth

```javascript
import { FakeAudioManager } from './fake-audio-context.js';
import { initializeAudio } from '../audio/audio-processor.js';

const audioManager = new FakeAudioManager();
await audioManager.unlockAudio();

await initializeAudio({ 
  audioManager, 
  maxNotes: 16, 
  settings: { enableHRTF: false } 
});

console.log('✓ Audio initialized');

const { playCues } = await import('../audio/audio-processor.js');
await playCues([{ 
  objectType: 'test', 
  frequency: 440, 
  pan: 0, 
  duration: 0.1,
  intensity: 0.5 
}]);

console.log('✓ Cues generated');
```

### Example 2: Testing Video Worker

```javascript
import { FakeWorker } from './fake-worker.js';
import { initializeVideo } from '../video/frame-processor.js';

const videoAPI = initializeVideo({ 
  WorkerCtor: FakeWorker,
  workerBaseUrl: './',
  motionThreshold: 20,
  settings: {}
});

console.log('✓ Video initialized');

const fakeImageData = new Uint8ClampedArray(640 * 480 * 4);
const result = await videoAPI.processFrame(fakeImageData, 640, 480);

if (result && Array.isArray(result.movingRegions)) {
  console.log('✓ Frame processed');
}
```

### Example 3: Testing UI Disposal

```javascript
import { engine } from './engine-stub.js';
import { DOM } from './dom-shim.js';
import { initializeDevPanel } from '../ui/dev-panel/dev-panel.js';

const { dispose } = initializeDevPanel(engine, DOM);

if (typeof dispose === 'function') {
  console.log('✓ UI module provides dispose function');
  dispose();
  console.log('✓ Cleanup completed');
} else {
  console.error('✗ Missing dispose function');
  process.exit(1);
}
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

**Last Updated:** October 23, 2025 - Reorganized for clarity and added comprehensive gotchas section
