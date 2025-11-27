# Testing Guide for AcoustSee

## Test Organization

Tests in `future/web/test/` are organized by type for clarity and maintainability:

```
test/
├── unit/                           # Jest unit tests (.test.js)
│   ├── async.test.js              # Async utilities
│   ├── audio-init.test.js         # Audio initialization
│   ├── audio-manager.test.js      # AudioManager class
│   ├── bootstrap-imports.test.js  # Import validation
│   ├── engine.test.js             # Engine core
│   ├── video-init.test.js         # Video initialization
│   ├── analytics-i18n.test.js     # i18n/analytics
│   └── core/                      # Core module tests
│       └── engine-selectors.test.js
│
├── integration/                    # Integration tests
│   └── i18n-engine-init.test.js   # Multi-module integration
│
├── node-scripts/                  # Node.js test scripts (not Jest)
│   ├── test-audio-video-pipeline.js
│   ├── test-stack-format.js
│   ├── audio/
│   │   ├── test-initialize-audio.js
│   │   └── test-audio-manager.js
│   └── video/
│       └── test-initialize-video.js
│
├── fixtures/                      # Test artifacts & fixtures
│   ├── boot.for-test.js          # Boot module test variant
│   └── test-logging-source.html  # Logging source test
│
├── setup.js                       # Jest global setup
├── TESTING.md                     # This file
├── TESTING.md                     # Testing documentation
├── audio-diagnostic.js            # Audio diagnostics
├── motion-threshold-validator.js  # Motion threshold validation
├── demos/                         # Demo files
├── logs/                          # Test logs directory
└── smoke/                         # Smoke tests
```

## Running Tests

### Jest Unit Tests (Recommended)
```bash
npm run test:unit                  # Run all unit tests
npm run test -- unit/async.test.js  # Run specific test
```

### Node.js Test Scripts
```bash
node future/web/test/node-scripts/test-audio-video-pipeline.js
node future/web/test/node-scripts/audio/test-initialize-audio.js
```

---

## Test Environment Setup

This document describes the test environment, global shims, and utilities for running AcoustSee tests in Node.js and browser environments.

---

## Global Shims

The test environment requires several browser APIs to be available in Node.js. These are provided via modular shims in `runtime-shims/`.

### Basic Environment Shims

**File:** `runtime-shims/dom-shim.js`
- Provides minimal `document`, `window`, `navigator` stubs
- Supports `querySelector`, `getElementById` for DOM queries
- Safe no-op implementations for common DOM operations

**File:** `runtime-shims/fake-audio-context.js`
- Mocks Web Audio API (AudioContext, OscillatorNode, GainNode, etc.)
- Enables audio processor testing without actual audio hardware
- Tracks audio node creation and parameter changes

**File:** `runtime-shims/fake-worker.js`
- Mocks Web Workers API
- Allows worker-based code to run synchronously in tests
- Supports message passing and error handling

### Specialized Test Shims

#### Haptic Testing (`runtime-shims/haptic-shim.js`)

Consolidated haptic utilities for vibration feedback testing.

```javascript
import { setupHapticShim, assertHapticPattern, resetHapticTracking } from '../../runtime-shims/haptic-shim.js';

// In test setup
const haptics = setupHapticShim();

// In test
navigator.vibrate([30, 50, 30]);
assertHapticPattern(haptics, [30, 50, 30], "Three pulses triggered");

// Between tests
resetHapticTracking(haptics);
```

**API Reference:**

- `setupHapticShim()` → `{ lastPattern, patterns, callCount }` - Initialize tracking
- `resetHapticTracking(tracking)` - Reset between tests
- `assertHapticPattern(tracking, expected, message?)` - Assert pattern match
- `getHapticCallCount(tracking)` → `number` - Count of vibrate() calls
- `getHapticPatterns(tracking)` → `Array` - All captured patterns

---

## Module-Scoped Globals

Some modules maintain private state for testing consistency:

### TTS Module (`utils/tts.js`)

The `speakText()` function uses a module-scoped `lastTTSTime` for cooldown throttling.

**Test Impact:** Consecutive `speakText()` calls within 3 seconds (default) are throttled.

**Workaround:**
```javascript
import { resetTTSTimer } from '../../utils/tts.js';

beforeEach(() => {
  resetTTSTimer();  // Clear cooldown between tests
});
```

### Translations Cache (`languages/i18n.js`)

The `getText()` function caches translations per language.

**Test Impact:** Stale translations may be returned if cache not cleared.

**Workaround:**
```javascript
import { clearTranslationsCache } from '../../languages/i18n.js';

beforeEach(() => {
  clearTranslationsCache();
});
```

---

## Test Environment Initialization

### Minimal Setup

For simple unit tests:

```javascript
import { setupHapticShim } from '../runtime-shims/haptic-shim.js';

describe('My Test Suite', () => {
  beforeAll(() => {
    setupHapticShim();
    // Add other shims as needed
  });

  test('should work', () => {
    // Test code
  });
});
```

### Full Environment Setup

For integration tests, use `runtime-shims/run-example.js` as reference:

```javascript
// Basic browser globals
global.navigator = { userAgent: 'Node.js Runtime' };
global.window = { location: { hostname: 'localhost' } };
global.document = { 
  visibilityState: 'visible', 
  addEventListener: () => {},
  head: { appendChild: () => {} },
  querySelector: () => null
};

// Import and setup specialized shims
import { FakeAudioManager } from './fake-audio-context.js';
import { FakeWorker } from './fake-worker.js';
import { setupHapticShim } from './haptic-shim.js';

// Setup
global.Worker = FakeWorker;
global.HTMLCanvasElement = function() {};
setupHapticShim();
```

---

## Debugging Tests

### Enable Structured Logging

Set environment variable to see detailed logs:

```bash
DEBUG=acoustsee:* npm test
```

### Inspect State

Use the engine's state getter:

```javascript
const state = engine.getState();
console.log('Current cues:', state.cueBuffer);
console.log('Current mode:', state.currentMode);
```

### Trace Audio Graph

Check audio node connections:

```javascript
const audioState = engine.getState().audio;
console.log('Master gain:', audioState.masterGain?.gain.value);
console.log('Active oscillators:', audioState.oscillatorPool?.filter(o => o.active).length);
```

---

## Common Test Patterns

### Asserting Haptic Feedback

```javascript
const haptics = setupHapticShim();

engine.dispatch('objectDetected', { label: 'person' });
// Person trigger = haptic pulse
assertHapticPattern(haptics, [100, 50, 100], "Person haptic triggered");
```

### Testing Translation

```javascript
import { getText, initializeLanguage, clearTranslationsCache } from '../languages/i18n.js';

beforeEach(() => {
  clearTranslationsCache();
});

test('getText returns translated message', async () => {
  const state = { language: 'en-US', availableLanguages: [{ id: 'en-US' }], i18n: {} };
  await initializeLanguage(state);
  
  const msg = await getText('ui.greeting', {}, state);
  expect(msg).not.toContain('missing');
});
```

### Testing TTS Throttling

```javascript
import { speakText, resetTTSTimer } from '../utils/tts.js';

beforeEach(() => {
  resetTTSTimer();
});

test('TTS cooldown throttles rapid calls', () => {
  const state = { ttsEnabled: true, language: 'en-US', ttsCooldownMs: 3000 };
  
  speakText(state, "First");      // Should trigger
  speakText(state, "Second");     // Should throttle (within 3s)
  
  // Verify in logs or via mock
});
```

---

## Best Practices

1. **Isolate Test Globals** - Use separate shim instances per test suite if testing multiple systems
2. **Reset State Between Tests** - Always clear caches, timers, and tracking objects
3. **Mock External APIs** - Don't rely on actual browser/device APIs in tests
4. **Document Assumptions** - Note which globals your test requires
5. **Use Semantic Names** - Name tracking variables clearly (`haptics`, `audioTracking`, etc.)

---

## Troubleshooting

| Issue | Cause | Solution |
|-------|-------|----------|
| `navigator is not defined` | Missing global setup | Call `setupHapticShim()` or provide `global.navigator` |
| TTS cooldown prevents testing | Module-scoped timer persists | Call `resetTTSTimer()` in `beforeEach()` |
| Stale translations returned | Cache not cleared | Call `clearTranslationsCache()` in `beforeEach()` |
| Audio nodes don't connect | FakeAudioManager not initialized | Ensure `new FakeAudioManager()` is created and `.initialize()` called |

---

## Related Documentation

- `future/web/ARCHITECTURE_RULES.md` - Core architectural constraints affecting tests
- `future/web/core/README.md` - Engine initialization and lifecycle
- `future/web/audio/README.md` - Audio subsystem testing patterns
- `future/web/video/README.md` - Video processor testing patterns
