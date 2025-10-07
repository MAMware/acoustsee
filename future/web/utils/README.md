# Utils Subsystem

This directory contains cross-cutting utilities that are used by multiple subsystems. These are **stateless helper functions and lightweight services** - not business logic.

**⚠️ CRITICAL ARCHITECTURAL RULES:**
1. **Utils are PURE** - No side effects, no global state (except loggers).
2. **Utils don't know about subsystems** - They can't import from `core/`, `audio/`, `video/`, or `ui/`.
3. **Utils are REUSABLE** - If it's specific to one subsystem, it doesn't belong here.
4. **Utils are TESTABLE** - Every function should be unit-testable in isolation.

---

## File Overview

| File | Purpose | When to Use |
|------|---------|-------------|
| `async.js` | Async/await helpers, debounce, throttle | When you need controlled async execution |
| `core-logger.js` | Console output with log levels (DEBUG, INFO, WARN, ERROR) | For simple console logging with filtering |
| `error-handling.js` | Graceful error boundaries, try/catch wrappers | When you need non-critical error handling |
| `idb-logger.js` | IndexedDB persistence for logs/analytics | For persistent error tracking (Performance Analytics) |
| `ingest.js` | Performance event ingestion with throttling | For tracking performance-critical events |
| `logging.js` | Structured logging with metadata | For ALL application logging (REQUIRED) |
| `performance.js` | Performance measurement (RingBuffer, FPS calculation) | For measuring frame processing time |
| `utils.js` | Miscellaneous helpers (platform detection, etc.) | For general-purpose utilities |

---

## 1. `logging.js` - Structured Logging (PRIMARY)

**This is the MAIN logging system used throughout the application.**

### Purpose
- Provides consistent, structured logging with metadata
- Integrates with both console (via `core-logger.js`) and persistent storage (via `idb-logger.js`)
- Supports log levels, sampling, and performance-aware throttling

### API

```javascript
import { structuredLog } from '../utils/logging.js';

// Basic usage:
structuredLog('INFO', 'Something happened');

// With metadata:
structuredLog('ERROR', 'Failed to process frame', { 
  frameId: 123, 
  error: e.message 
});

// With options:
structuredLog('DEBUG', 'Detailed info', { data }, true, true);
//                                      ^metadata  ^persist  ^sample
```

### Log Levels (in order of severity)

| Level | When to Use | Persisted? | Visible by Default? |
|-------|-------------|------------|---------------------|
| `DEBUG` | Detailed diagnostic info | ❌ No | ❌ No (only with `?debug=true`) |
| `INFO` | General informational messages | ❌ No | ✅ Yes |
| `WARN` | Warnings that don't break functionality | ✅ Yes | ✅ Yes |
| `ERROR` | Errors that need attention | ✅ Yes | ✅ Yes |

### Configuration

```javascript
import { loggingConfig } from '../utils/logging.js';

// Toggle metadata inclusion
loggingConfig.includeMetadata = false;

// Toggle stack traces (WARN/ERROR only)
loggingConfig.includeStack = true;

// Toggle URL inclusion (WARN/ERROR only)
loggingConfig.includeUrl = true;

// Toggle userAgent (disabled by default)
loggingConfig.includeUserAgent = false; 
```

### When to Use

✅ **ALWAYS use `structuredLog` for:**
- Command handler entry/exit
- Error conditions
- Performance milestones
- State transitions
- User actions

❌ **DON'T use for:**
- Per-frame logs in tight loops (use sampling: `if (Math.random() < 0.01)`)
- Debug logs in production code without `?debug=true` check
- Sensitive user data (PII, credentials)

---

## 2. `core-logger.js` - Console Output with Levels

**This is the LOW-LEVEL console abstraction used by `logging.js`.**

### Purpose
- Formats log output to browser console
- Filters logs based on current log level
- Provides color-coding in console

### API

```javascript
import { LOG_LEVELS, setLogLevel } from '../utils/core-logger.js';

// Set minimum log level
setLogLevel('DEBUG'); // Show all logs
setLogLevel('INFO');  // Hide DEBUG logs (default)
setLogLevel('WARN');  // Hide DEBUG and INFO
setLogLevel('ERROR'); // Only show errors

// Get current level
const currentLevel = getCurrentLogLevel();
```

### When to Use

❌ **DON'T use directly** - Use `structuredLog()` instead, which calls this internally.

---

## 3. `idb-logger.js` - Persistent Storage (IndexedDB)

**This handles persistent storage for Performance Analytics.**

### Purpose
- Stores WARN/ERROR logs persistently across sessions
- Powers the "Export Analytics" feature in Dev Panel
- Auto-caps at 1000 entries to prevent database bloat

### API

```javascript
import { addIdbLog, getAllIdbLogs, clearIdbLogs } from '../utils/idb-logger.js';

// Add a log entry (called automatically by structuredLog for WARN/ERROR)
await addIdbLog({
  timestamp: new Date().toISOString(),
  level: 'ERROR',
  message: 'Something broke',
  data: { error: 'details' }
});

// Retrieve all logs (for export)
const logs = await getAllIdbLogs();

// Clear logs (after export or reset)
await clearIdbLogs();
```

### Database Schema

```javascript
{
  dbName: 'AcoustSeeLogsDB',
  version: 1,
  store: 'logs',
  schema: {
    keyPath: 'id',  // Auto-incrementing
    indexes: [
      { name: 'timestamp', keyPath: 'timestamp' },
      { name: 'level', keyPath: 'level' }
    ]
  }
}
```

### When to Use

❌ **DON'T use directly** - `structuredLog()` automatically persists WARN/ERROR logs.

✅ **DO use for:**
- Exporting analytics (Dev Panel)
- Clearing old logs
- Manual log injection (rare)

---

## 4. `ingest.js` - Performance Event Ingestion

**This tracks performance-critical events with throttling and batching.**

### Purpose
- Collects high-frequency performance events without overwhelming the system
- Batches events before sending to IndexedDB
- Respects battery optimization settings

### API

```javascript
import { ingestEvent } from '../utils/ingest.js';

// Track a performance event
ingestEvent('audioCuesReady', { 
  cueCount: 12, 
  duration: 15.3 
});

// Event categories (from state.ingestCategories):
ingestEvent('startProcessing', {});     // user_workflow
ingestEvent('setFrameInterval', {});    // auto_optimization
ingestEvent('logFrameBenchmark', {});   // performance_critical
```

### Configuration

```javascript
// In application state (core/state.js):
{
  ingestPreferences: {
    useIdleCallback: true,           // Use requestIdleCallback
    maxEventsPerSecond: 10,          // Throttle limit
    enableOnLowPerformance: true,    // Keep running on slow devices
    enableOnMobile: true             // Keep running on mobile
  }
}
```

### When to Use

✅ **Use for:**
- High-frequency performance metrics (frame timing, audio cue generation)
- User workflow tracking (start/stop, mode switches)
- Auto-optimization events (FPS adjustments)

❌ **DON'T use for:**
- One-time events (use `structuredLog` instead)
- Error conditions (use `structuredLog('ERROR')`)
- User input events (use command dispatch)

---

## 5. `performance.js` - Performance Measurement

**This provides data structures and utilities for measuring system performance.**

### Components

#### `RingBuffer`
A circular buffer for storing rolling performance measurements.

```javascript
import { RingBuffer } from '../utils/performance.js';

const buffer = new RingBuffer(30); // Store last 30 measurements

buffer.push(16.7); // Frame time in ms
buffer.push(15.2);

// Get statistics
console.log(buffer.getMean());   // Average
console.log(buffer.getMax());    // Worst case
console.log(buffer.getMin());    // Best case
console.log(buffer.isFull());    // true if >= 30 samples
```

#### FPS Calculation
```javascript
import { calculateFPS } from '../utils/performance.js';

const fps = calculateFPS(16.7); // ms per frame → 60 FPS
```

### When to Use

✅ **Use for:**
- Frame timing analysis
- AutoFPS decision-making
- Performance diagnostics in Dev Panel

❌ **DON'T use for:**
- Real-time per-frame logs (use sampling)
- Non-performance metrics

---

## 6. `error-handling.js` - Graceful Error Boundaries

**This provides try/catch wrappers for non-critical operations.**

### Purpose
- Execute operations that might fail without crashing the app
- Log errors gracefully
- Provide fallback values

### API

```javascript
import { executeNonCriticalOperation } from '../utils/error-handling.js';

const result = executeNonCriticalOperation(
  'MyFeature',                     // Name for logging
  () => {
    // Risky operation
    return someUnreliableFunction();
  },
  'fallback value'                 // Optional default
);

// If function throws, logs error and returns fallback
```

### When to Use

✅ **Use for:**
- Optional features (analytics, UI enhancements)
- External API calls
- User preference loading

❌ **DON'T use for:**
- Critical operations (video capture, audio initialization)
- Command handlers (they should handle errors explicitly)
- Performance-critical code (adds overhead)

---

## 7. `async.js` - Async Utilities

**This provides helpers for managing asynchronous operations.**

### API

```javascript
import { debounce, throttle, delay } from '../utils/async.js';

// Debounce: Wait for quiet period
const debouncedFn = debounce(() => {
  console.log('Called after 300ms of inactivity');
}, 300);

// Throttle: Limit call frequency
const throttledFn = throttle(() => {
  console.log('Called at most once per 100ms');
}, 100);

// Delay: Promisified setTimeout
await delay(1000); // Wait 1 second
```

### When to Use

✅ **Use for:**
- Resize handlers (debounce)
- Scroll handlers (throttle)
- User input (debounce search queries)
- Controlled delays in tests

❌ **DON'T use for:**
- Performance-critical paths
- Frame processing (use dedicated scheduler)

---

## 8. `utils.js` - Miscellaneous Helpers

**General-purpose utility functions.**

### API

```javascript
import { 
  detectIsMobile, 
  detectBrowserCapabilities,
  clamp,
  normalize
} from '../utils/utils.js';

// Platform detection
const isMobile = detectIsMobile();

// Browser feature detection
const caps = detectBrowserCapabilities();
// Returns: { hasWebGL, hasWebWorkers, hasIndexedDB, ... }

// Math helpers
const clamped = clamp(value, 0, 100);      // Constrain to range
const normalized = normalize(50, 0, 100);  // Map to 0-1
```

### When to Use

✅ **Use for:**
- Platform-specific behavior
- Feature detection
- Math utilities
- Type checking helpers

❌ **DON'T add:**
- Business logic
- Subsystem-specific code
- Complex stateful utilities

---

## Adding a New Utility

### Checklist

1. **Is it really a utility?**
   - ❌ Does it belong in a specific subsystem? → Put it there instead
   - ❌ Does it maintain state? → Consider creating a service/manager
   - ❌ Is it used by only one place? → Keep it local
   - ✅ Is it reusable, stateless, and cross-cutting? → Continue

2. **Which file does it belong in?**
   - Logging? → Add to `logging.js`
   - Performance? → Add to `performance.js`
   - Async? → Add to `async.js`
   - Error handling? → Add to `error-handling.js`
   - None of the above? → Add to `utils.js`

3. **Write it following this pattern:**

```javascript
/**
 * Brief description of what this function does.
 * 
 * @param {Type} paramName - Description
 * @returns {Type} Description
 * @example
 * const result = myUtility(42);
 */
export function myUtility(paramName) {
  // Pure function - no side effects
  return processedValue;
}
```

4. **Test it:**

```javascript
import { myUtility } from './utils.js';

test('myUtility handles normal input', () => {
  expect(myUtility(42)).toBe(expected);
});

test('myUtility handles edge cases', () => {
  expect(myUtility(null)).toBe(fallback);
});
```

5. **Document it:**
   - Add to this README under the appropriate section
   - Include usage examples
   - Note any gotchas or limitations

---

## Common Anti-Patterns to Avoid

### ❌ The Stateful Utility
```javascript
// DON'T maintain state
let cachedValue = null;
export function getCached() {
  return cachedValue;
}
```

### ❌ The Subsystem Importer
```javascript
// DON'T import from subsystems
import { engine } from '../core/engine.js';
export function logToEngine(msg) {
  engine.dispatch('log', msg);
}
```

### ❌ The Kitchen Sink
```javascript
// DON'T make one util that does everything
export function doAllTheThings(a, b, c, d, e, f) {
  // 500 lines of code...
}
```

### ❌ The Global Polluter
```javascript
// DON'T create globals
window.myUtil = function() { ... };
```

---

## Testing Guidelines

### Unit Tests (Required for all utils)

```javascript
import { myUtility } from './utils.js';

describe('myUtility', () => {
  test('handles normal input', () => {
    expect(myUtility(42)).toBe(expected);
  });
  
  test('handles edge cases', () => {
    expect(myUtility(null)).toBe(fallback);
    expect(myUtility(undefined)).toBe(fallback);
    expect(myUtility(Infinity)).not.toThrow();
  });
  
  test('is deterministic', () => {
    const result1 = myUtility(42);
    const result2 = myUtility(42);
    expect(result1).toEqual(result2);
  });
});
```

---

## Performance Considerations

### Logging Performance
- Use sampling for high-frequency logs: `if (Math.random() < 0.01)`
- Don't log in tight loops without throttling
- Prefer `INFO` over `DEBUG` for production code

### IndexedDB Performance
- Batch writes when possible (ingest.js does this)
- Don't query on every frame
- Use capped collections (1000 entries max)

### RingBuffer Performance
- Pre-allocate size based on expected sample count
- Use `isFull()` to avoid unnecessary calculations
- Keep buffer sizes reasonable (<100 samples)

---

## File Checklist

When working in this directory:
- [ ] Did you add state? **Stop. Utils must be stateless.**
- [ ] Did you import from a subsystem? **Stop. Utils are independent.**
- [ ] Did you add business logic? **Stop. It belongs in a command handler.**
- [ ] Did you write tests? **Required for all new utilities.**
- [ ] Did you document the API? **Update this README.**
- [ ] Is it used in multiple places? **If no, keep it local.**
- [ ] Is it pure (no side effects)? **Exception: loggers are allowed side effects.**

---

Created by Claude Sonnet 4.5
**Last Updated:** 7 October 2025 - Utils architecture finalized- 
