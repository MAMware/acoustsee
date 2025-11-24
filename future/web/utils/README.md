# Utils Subsystem

This directory contains cross-cutting utilities that are used by multiple subsystems. These are **stateless helper functions and lightweight services** - not business logic.

**CRITICAL ARCHITECTURAL RULES:**
1. **Utils are PURE** - No side effects, no global state (except loggers).
2. **Utils don't know about subsystems** - They can't import from `core/`, `audio/`, `video/`, or `ui/`.
3. **Utils are REUSABLE** - If it's specific to one subsystem, it doesn't belong here.
4. **Utils are TESTABLE** - Every function should be unit-testable in isolation.

---

## File Overview

| File | Purpose | When to Use |
|------|---------|-------------|
| `async.js` | Async/await helpers, debounce, throttle | When you need controlled async execution |
| `core-logger.js` | **Ring buffer + console output** (DEBUG, INFO, WARN, ERROR) | For simple console logging with filtering |
| `early-logs.js` | Captures pre-dev-panel logs from ring buffer | For exporting boot logs, splash screen diagnostics |
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
| `DEBUG` | Detailed diagnostic info |  No |  No (only with `?debug=true`) |
| `INFO` | General informational messages |  No |  Yes |
| `WARN` | Warnings that don't break functionality |  Yes |  Yes |
| `ERROR` | Errors that need attention |  Yes |  Yes |

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

 **ALWAYS use `structuredLog` for:**
- Command handler entry/exit
- Error conditions
- Performance milestones
- State transitions
- User actions

 **AVOID ITS use for:**
- Per-frame logs in tight loops (use sampling: `if (Math.random() < 0.01)`)
- Sensitive user data (PII, credentials)

### Logging Strategy & Performance Implications

#### The Logging Pipeline

```javascript
structuredLog('ERROR', 'Something failed', { detail: 'value' })
    ↓
console.log/warn/error (via core-logger.js) 
    ├─ Visible immediately in browser console
    └─ Displayed in dev-panel log viewer
    ↓
RingBuffer (in-memory, ~1000 entries)
    ├─ Kept for debugging
    └─ Discarded when full (newest replaces oldest)
    ↓
IndexedDB (if level is WARN or ERROR)
    ├─ Persisted to disk
    └─ Survives page reload
    ↓
Analytics Ingest (optional, if enabled)
    └─ Sent to performance tracking server
```

#### When To Use Each Level

**DEBUG** - Development only, no performance impact
```javascript
if (urlSearchParams.get('debug')) {
  structuredLog('DEBUG', 'Detailed state', { 
    complexObject: largeDataStructure,
    allDetails: 'everything'
  });
}
```
-  Disabled in production
-  NO performance cost when disabled
-  Never use for per-frame logs

**INFO** - General milestones and user actions
```javascript
structuredLog('INFO', 'User started processing');
structuredLog('INFO', 'Grid selected: hex-tonnetz');
structuredLog('INFO', 'Audio context unlocked');
```
-  Important milestones
-  User actions
-  State transitions
-  NOT persisted (console only)
-  Don't use for every state change

**WARN** - Important but recoverable issues
```javascript
structuredLog('WARN', 'Grid not available', { 
  requestedId: 'foo',
  fallback: 'square'
});
structuredLog('WARN', 'Oscillator pool exhausted', { 
  requested: 5,
  available: 0
});
```
-  Persisted to IndexedDB
-  Visible in dev-panel
-  Sent to analytics
-  Doesn't crash the app
-  Should NOT happen frequently

**ERROR** - Critical issues that need attention
```javascript
structuredLog('ERROR', 'Audio initialization failed', { 
  error: e.message,
  audioContext: ac?.state
});
structuredLog('ERROR', 'Worker failed to load', { 
  worker: 'motion-worker.js',
  path: workerPath
});
```
-  Always persisted
-  High priority in analytics
-  Triggers recovery (if handler exists)
-  User should be aware
-  Performance implications OK (errors are exceptional)

#### Performance Implications of Logging

**Per-frame logging in main loop:**
```javascript
//  BAD - 60 logs per second, 3600 per minute!
function processFrame(frame) {
  structuredLog('INFO', 'Processing frame', { frameId: frame.id });
  // ... processing ...
}

//  GOOD - Sampled, ~1 log per second
function processFrame(frame) {
  if (Math.random() < 0.01) {  // 1% sampling
    structuredLog('DEBUG', 'Processing frame', { frameId: frame.id });
  }
  // ... processing ...
}

//  BETTER - Periodic, every Nth frame
let frameCount = 0;
function processFrame(frame) {
  frameCount++;
  if (frameCount % 60 === 0) {  // Every 60th frame at 60fps
    structuredLog('DEBUG', 'Frame batch', { 
      frameCount,
      averageTime: getAverageFrameTime()
    });
  }
}
```

**High-frequency locations that need sampling:**
```javascript
// Frame processor 
//  Cap logs to ~1 per second
if (frameCount % 60 === 0) {
  structuredLog('DEBUG', 'Frame processed', { ... });
}

// Motion worker (60fps per frame)
//  Only log on ERROR, not per-frame
if (regions.length > expectedMax) {
  structuredLog('WARN', 'Too many motion regions', { ... });
}

// Audio synthesis (per note)
//  Don't log per-note, aggregate
if (totalNotesGenerated % 100 === 0) {
  structuredLog('DEBUG', 'Notes generated', { total: totalNotesGenerated });
}

// State changes (variable frequency)
//  OK to log all (usually rare)
structuredLog('INFO', 'State changed: ' + newState);
```

#### Structured Logging Best Practices

```javascript
//  DO THIS - Structured with context
structuredLog('INFO', 'Audio context created', {
  sampleRate: audioContext.sampleRate,
  state: audioContext.state,
  timestamp: Date.now()
});

//  DO THIS - Clear message + selective data
structuredLog('WARN', 'Grid mapping slow', {
  duration: gridTime,
  gridId: grid.id,
  cuesCount: cues.length
});

//  DON'T DO THIS - Unstructured
console.log('Audio OK');

//  DON'T DO THIS - Too much data
console.log('Audio', audioContext);  // Entire object

//  DON'T DO THIS - Serialization issues
structuredLog('INFO', `Audio: ${JSON.stringify(audioContext)}`);  // Circular!

//  DON'T DO THIS - Sensitive data
structuredLog('INFO', 'User email: ' + userEmail);  // PII leak
```

#### Debugging with Structured Logs

**Find performance issues:**
```javascript
// All logs with duration > 100ms
const logs = await getAllIdbLogs();
const slow = logs.filter(log => log.data?.duration > 100);

// Correlate with errors
const errors = logs.filter(log => log.level === 'ERROR');
errors.forEach(err => {
  console.log('Error context:', err);
});
```

**Monitor device performance:**
```javascript
// Collect FPS data
let frameCount = 0;
const fps = [];

function trackFrame(duration) {
  frameCount++;
  if (frameCount % 60 === 0) {
    const currentFPS = 1000 / (duration / 60);
    fps.push(currentFPS);
    
    if (currentFPS < 10) {  // Critical
      structuredLog('ERROR', 'Low FPS detected', { fps: currentFPS });
    } else if (currentFPS < 15) {  // Warning
      structuredLog('WARN', 'FPS dropping', { fps: currentFPS });
    }
  }
}
```

---

## 2. core-logger.js - Console Output with Ring Buffer

**This is the LOW-LEVEL console abstraction used by `logging.js`.**

### Purpose
- Maintains in-memory ring buffer as **single source of truth** for all logs
- Formats log output to browser console
- Filters logs based on current log level
- Provides real-time callback for dev panel integration

### API

```javascript
import { 
  LOG_LEVELS, 
  setLogLevel, 
  getCurrentLogLevel,
  getRingBufferLogs,
  clearRingBuffer,
  getRingBufferCount,
  setOutputCallback
} from '../utils/core-logger.js';

// Set minimum log level
setLogLevel('DEBUG'); // Show all logs
setLogLevel('INFO');  // Hide DEBUG logs (default)
setLogLevel('WARN');  // Hide DEBUG and INFO
setLogLevel('ERROR'); // Only show errors

// Get current level
const currentLevel = getCurrentLogLevel();

// Query ring buffer
const allLogs = getRingBufferLogs(); // Get all logs in chronological order
const count = getRingBufferCount();  // How many logs stored
clearRingBuffer();                   // Clear all logs

// Real-time callback for dev panel
setOutputCallback((level, text) => {
  displayInUI(level, text);
});
```

### The Ring Buffer: Single Source of Truth

The ring buffer is a **circular in-memory log storage** that solves the "lost logs" problem.

#### Architecture

**Data Structure:**
```javascript
{
  timestamp: "2025-11-24T17:41:46.210Z",  // ISO 8601 string
  level: "INFO",                           // DEBUG | INFO | WARN | ERROR
  text: "[...] LEVEL: message (file.js:123)", // Formatted for display
  data: { ...structured data... }         // Original metadata
}
```

**Capacity:** 1000 entries (configurable via `DEFAULT_BUFFER_SIZE`)

**Circular Behavior:**
- Fills linearly from index 0 to 999
- Once full, wraps around and overwrites oldest entries
- Always maintains most recent 1000 logs

#### Problem It Solves

**Before the ring buffer:**
```javascript
// Early boot logs
structuredLog('INFO', 'Engine initializing...');  // Lost!
structuredLog('INFO', 'Video grid loaded...');    // Lost!
structuredLog('ERROR', 'Audio unlock failed!');   // Lost!

// Dev panel opens 3 seconds later
// User has no visibility into what happened during boot
```

**After the ring buffer:**
```javascript
// All logs captured immediately in memory
structuredLog('INFO', 'Engine initializing...');  // ✅ Stored
structuredLog('INFO', 'Video grid loaded...');    // ✅ Stored  
structuredLog('ERROR', 'Audio unlock failed!');   // ✅ Stored

// Dev panel opens and queries ring buffer
const earlyLogs = getRingBufferLogs();
//  All boot logs instantly available, no async delay
```

#### Consumers of Ring Buffer

**1. Browser Console (immediate)**
- Every log written to console in real-time
- Data objects now printed alongside messages (as of Nov 24, 2025 fix)

**2. Dev Panel Live Logs (log-viewer.js)**
```javascript
// On dev panel init
const logs = getRingBufferLogs();
logs.forEach(log => displayInLogViewer(log));

// For real-time updates
setOutputCallback((level, text) => {
  appendToLogViewer(level, text);
});
```

**3. Early Logs Export (early-logs.js)**
```javascript
// Splash screen "Export Logs" button
const allLogs = getRingBufferLogs();
downloadAsJSON(allLogs);  // Fresh data, no stale IDB pollution
```

**4. Analytics Ingestion (future)**
- Can sample from ring buffer for telemetry
- Structured data already available

#### Why "Ring" Instead of Array?

A simple array would either:
1. **Grow unbounded** → Memory leak (60 logs/sec = 216k logs/hour)
2. **Require expensive shifts** → `array.shift()` is O(n)

The ring buffer gives you:
-  **Fixed memory** (~1MB for 1000 entries)
-  **Constant-time writes** - O(1) insertion
-  **Automatic disposal** - Old logs replaced by new
-  **No blocking** - All synchronous, no async overhead

#### How It Works

```javascript
// Internal state
let ringBuffer = [];      // The array (max 1000 items)
let bufferIndex = 0;      // Next write position
let bufferFull = false;   // Has it wrapped around yet?

// Writing (constant time)
function addToRingBuffer(level, text, data) {
  const entry = { timestamp, level, text, data };
  
  if (ringBuffer.length < 1000) {
    ringBuffer.push(entry);  // Still filling
  } else {
    ringBuffer[bufferIndex] = entry;  // Overwrite oldest
    bufferIndex = (bufferIndex + 1) % 1000;  // Wrap around
    bufferFull = true;
  }
}

// Reading (returns chronological order)
export function getRingBufferLogs() {
  if (!bufferFull) {
    return ringBuffer.slice();  // Not yet full, return in order
  }
  
  // Buffer full: reconstruct chronological order
  // Start from bufferIndex (oldest) and wrap around
  const result = [];
  for (let i = 0; i < 1000; i++) {
    result.push(ringBuffer[(bufferIndex + i) % 1000]);
  }
  return result;
}
```

#### Performance Characteristics

| Operation | Complexity | Notes |
|-----------|------------|-------|
| Write | O(1) | Constant time, no shifts |
| Read all | O(n) | Creates copy, capped at 1000 |
| Memory | Fixed | ~1MB max (1000 × ~1KB/entry) |
| Blocking | None | All synchronous |

#### Integration with Logging Pipeline

```javascript
// Every structuredLog call flows through this:

structuredLog('ERROR', 'Something failed', { detail: 'value' })
    ↓
logging.js (formats structured entry)
    ↓
core-logger.js output()
    ├─ Adds to ring buffer (single source of truth)
    ├─ Prints to browser console
    ├─ Calls outputCallback (dev panel)
    └─ Returns
    ↓
idb-logger.js (if WARN/ERROR)
    └─ Persists to IndexedDB for long-term storage
```

### When to Use Ring Buffer APIs

 **Use `getRingBufferLogs()` for:**
- Dev panel initialization (backfill logs before panel existed)
- Early logs export from splash screen
- Debugging: manual console inspection
- Testing: verify logging behavior

 **Use `setOutputCallback()` for:**
- Real-time log display in dev panel
- Custom log viewers
- Testing: capture logs for assertion

 **Use `clearRingBuffer()` for:**
- App reset
- User-requested log clear
- Testing: clean slate between tests

 **DON'T use ring buffer APIs for:**
- Creating new logs (use `structuredLog()`)
- Per-frame queries (expensive, use sampling)
- Persistent storage (use `idb-logger.js`)

---

## 3. early-logs.js - Pre-Dev-Panel Log Capture

**Captures logs from boot/splash before dev panel is available.**

### Purpose
- Queries ring buffer for logs before dev panel initialization
- Powers "Export Logs" button on splash screen
- Ensures no early logs are lost due to timing

### API

```javascript
import { captureEarlyLogs, markDevPanelInitTime } from '../utils/early-logs.js';

// Mark when dev panel starts initializing
markDevPanelInitTime();

// Get all logs before that timestamp
const earlyLogs = await captureEarlyLogs();
// Returns: [{timestamp, level, text, data}, ...]
```

### How It Works

```javascript
// During boot (main.js, boot.js)
structuredLog('INFO', 'Engine starting...');     // t=0ms
structuredLog('INFO', 'Video initialized...');   // t=150ms
structuredLog('ERROR', 'Audio unlock failed!');  // t=300ms

// Splash screen "Export Logs" clicked at t=500ms
const logs = await captureEarlyLogs();
// Returns all logs (no dev panel init time set yet)

// Later: Dev panel initializes at t=3000ms
markDevPanelInitTime();  // Sets cutoff timestamp

const earlyLogs = await captureEarlyLogs();
// Returns only logs with timestamp < 3000ms
```

### When to Use

 **Use for:**
- Splash screen "Export Logs" functionality
- Debugging boot sequence issues
- Analyzing initialization problems

 **DON'T use for:**
- Real-time log display (use `setOutputCallback()`)
- Creating logs (use `structuredLog()`)
- Querying all logs (use `getRingBufferLogs()`)

---

## 4. `idb-logger.js` - Persistent Storage (IndexedDB)

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

 **DON'T use directly** - `structuredLog()` automatically persists WARN/ERROR logs.

 **DO use for:**
- Exporting analytics (Dev Panel)
- Clearing old logs
- Manual log injection (rare)

---

## 5. `ingest.js` - Performance Event Ingestion

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

 **Use for:**
- High-frequency performance metrics (frame timing, audio cue generation)
- User workflow tracking (start/stop, mode switches)
- Auto-optimization events (FPS adjustments)

 **DON'T use for:**
- One-time events (use `structuredLog` instead)
- Error conditions (use `structuredLog('ERROR')`)
- User input events (use command dispatch)

---

## 6. `performance.js` - Performance Measurement & Worker Timeout Adaptation 

**This provides data structures, utilities for measuring system performance, AND adaptive timeout configuration based on device tier and capture method.**

### Part A: Performance Measurement

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

### Part B: Worker Timeout Adaptation (Nov 6: Alpha Phase)

**Why Timeout Adaptation?**

Different video capture methods have different latency characteristics:
- **GPU path:** Fast capture (~16-33ms), workers need ~100-200ms timeout
- **Canvas path:** Slow capture (~100-250ms), workers need ~300-600ms timeout  
- **Low-end device:** Even with GPU, motion detection slower, need 2x multiplier

Hard-coded timeouts cause:
- GPU path: Works, plenty of headroom
- Canvas path: Timeouts before work completes → cascade failures
- Low-end: Timeouts too aggressive → workers killed prematurely

**Solution: Automatic Timeout Scaling**

```javascript
import { getWorkerTimeoutConfig, detectDeviceTier } from '../utils/performance.js';

// Called once at FrameConductor initialization
const timeoutConfig = getWorkerTimeoutConfig(engine.state);

// Returns something like:
// { flowTimeout: 300, focusTimeout: 600, hybridTimeout: 30 }
```

**How It Works:**

```javascript
// In performance.js
export function getWorkerTimeoutConfig(state = null) {
  // Step 1: Base timeouts (appropriate for GPU path)
  const baseConfig = {
    flowTimeout: 100,    // Flow mode: fast, real-time
    focusTimeout: 200,   // Focus mode: detailed analysis
    hybridTimeout: 10    // Hybrid mode: quick decisions
  };
  
  // Step 2: Multiply if device is low-end (slower CPU)
  const deviceTier = detectDeviceTier();
  if (deviceTier === 'low-end') {
    baseConfig.flowTimeout *= 2;    // 200ms
    baseConfig.focusTimeout *= 2;   // 400ms
    // Don't multiply hybrid (already fast)
  }
  
  // Step 3: Multiply if Canvas path active (CPU-bound capture)
  if (state?.videoCapture?.usingCanvas) {
    baseConfig.flowTimeout *= 3;    // 300ms (canvas adds 100-150ms overhead)
    baseConfig.focusTimeout *= 3;   // 600ms (canvas adds 100-150ms overhead)
  }
  
  return baseConfig;
}
```

**Timeout Values by Configuration:**

| Device Tier | Capture Path | Flow | Focus | Why |
|-------------|---|---|---|---|
| Desktop | GPU | 100ms | 200ms | Fast hardware + acceleration |
| Desktop | Canvas | 300ms | 600ms | 3x for canvas capture overhead |
| Low-End | GPU | 200ms | 400ms | 2x for slower CPU |
| Low-End | Canvas | 600ms | 1200ms | 2x device + 3x path (cumulative) |

**When Timeouts Are Calculated:**

```javascript
// In frame-conductor.js → constructor (lines 75-92)
const timeoutConfig = getWorkerTimeoutConfig(config.engine?.state);
this.config = {
  flowTimeout: timeoutConfig.flowTimeout,
  focusTimeout: timeoutConfig.focusTimeout,
  hybridTimeout: timeoutConfig.hybridTimeout,
};

// NOTE: Calculated ONCE at initialization
// NOT recalculated per-frame (too expensive)
// If device condition changes, reinitialize FrameConductor
```

**Using Timeouts in Your Worker:**

```javascript
// In frame-conductor.js (internal to FrameConductor)
const timeout = this.config.flowTimeout;  // Appropriate for current config

// Set timeout for worker
const timeoutHandle = setTimeout(() => {
  structuredLog('WARN', 'Worker timeout', { 
    workerName: workerConfig.name,
    timeoutMs: timeout,
    mode: this.#currentMode
  });
  worker.terminate();
}, timeout);

// Clear on success
clearTimeout(timeoutHandle);
```

**Alpha Note:** Timeouts are **diagnostic SLAs, not hard limits**

In this alpha phase:
- Timeouts trigger DEBUG logging but don't crash the app
- Workers fail gracefully when timeout occurs
- Logs show what was slow: "Worker timeout: motion-worker after 100ms"
- Helps identify bottlenecks for future optimization

**For Developers Adding Workers:**

1. Use timeouts from FrameConductor config, NOT hardcoded
2. Ensure worker completes within timeout (or will be terminated)
3. Test on both GPU and Canvas paths
4. Monitor console for "Worker timeout" messages during testing

---

### Part C: Device Tier Detection

```javascript
import { detectDeviceTier } from '../utils/performance.js';

const tier = detectDeviceTier();  // 'desktop' | 'tablet' | 'low-end'

// Used internally by timeout adaptation
// Factors: RAM, CPU cores, GPU capability
```

### When to Use Performance.js

 **Use for:**
- Frame timing analysis
- AutoFPS decision-making
- Timeout configuration (device-aware)
- Performance diagnostics in Dev Panel

 **DON'T use for:**
- Real-time per-frame logs (use sampling)
- Non-performance metrics
- Anything else should be its own function

---

## 7. `error-handling.js` - Graceful Error Boundaries

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

 **Use for:**
- Optional features (analytics, UI enhancements)
- External API calls
- User preference loading

 **DON'T use for:**
- Critical operations (video capture, audio initialization)
- Command handlers (they should handle errors explicitly)
- Performance-critical code (adds overhead)

---

## 8. `async.js` - Async Utilities

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

 **Use for:**
- Resize handlers (debounce)
- Scroll handlers (throttle)
- User input (debounce search queries)
- Controlled delays in tests

 **DON'T use for:**
- Performance-critical paths
- Frame processing (use dedicated scheduler)

---

## 9. `utils.js` - Miscellaneous Helpers

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

 **Use for:**
- Platform-specific behavior
- Feature detection
- Math utilities
- Type checking helpers

 **DON'T add:**
- Business logic
- Subsystem-specific code
- Complex stateful utilities

---

## Adding a New Utility

### Checklist

1. **Is it really a utility?**
   -  Does it belong in a specific subsystem? → Put it there instead
   -  Does it maintain state? → Consider creating a service/manager
   -  Is it used by only one place? → Keep it local
   -  Is it reusable, stateless, and cross-cutting? → Continue

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

###  The Stateful Utility
```javascript
// DON'T maintain state
let cachedValue = null;
export function getCached() {
  return cachedValue;
}
```

###  The Subsystem Importer
```javascript
// DON'T import from subsystems
import { engine } from '../core/engine.js';
export function logToEngine(msg) {
  engine.dispatch('log', msg);
}
```

###  The Kitchen Sink
```javascript
// DON'T make one util that does everything
export function doAllTheThings(a, b, c, d, e, f) {
  // 500 lines of code...
}
```

###  The Global Polluter
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

### Ring Buffer Performance
- Fixed memory: ~1MB (1000 entries × ~1KB each)
- Write: O(1) constant time
- Read: O(n) but capped at 1000 entries
- No blocking: All synchronous

### IndexedDB Performance
- Batch writes when possible (ingest.js does this)
- Don't query on every frame
- Use capped collections (1000 entries max)

### RingBuffer (performance.js) Performance
- Pre-allocate size based on expected sample count
- Use `isFull()` to avoid unnecessary calculations
- Keep buffer sizes reasonable (<100 samples)

---

## File Checklist

When working in this directory:
- [ ] Did you add state? **AVOID. Utils must be stateless.**
- [ ] Did you import from a subsystem? **AVOID. Utils are independent.**
- [ ] Did you add business logic? **AVOID. It belongs in a command handler.**
- [ ] Did you write tests? **Required for all new utilities.**
- [ ] Did you document the API? **IMPORTANT: Update this README.**
- [ ] Is it used in multiple places? **If no, keep it local.**
- [ ] Is it pure (no side effects)? **Exception: loggers are allowed side effects.**

---

**Last Updated:** 24 November 2025 - Added ring buffer architecture documentation

