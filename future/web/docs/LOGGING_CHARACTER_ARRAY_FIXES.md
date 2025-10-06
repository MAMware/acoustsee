# Character Array Bug - Complete Fix

## Root Cause

The character array bug `{"0":"P","1":"r","2":"o"...}` was caused by passing a **string as the third argument** to `structuredLog()`, when it expects an **object**.

### The Bug Pattern:
```javascript
// ❌ WRONG - string gets spread into object
structuredLog('ERROR', 'error_ingest', 'Promise Rejection', errorPayload);
//                                      ^^^^^^^^^^^^^^^^^^ This is the 3rd argument (data)
//                                                         and it gets spread: ...data
```

When JavaScript does `...data` on a string, it spreads the string into an object with numeric keys:
```javascript
{ ...('Promise Rejection') }
// Results in: {"0":"P","1":"r","2":"o", ...}
```

### Correct Pattern:
```javascript
// ✅ CORRECT - object as 3rd argument
structuredLog('ERROR', 'error_ingest', errorPayload);
```

Or include the message inside the data object:
```javascript
// ✅ ALSO CORRECT
structuredLog('ERROR', 'error_ingest', { message: 'Promise Rejection', ...errorPayload });
```

---

## All Files Fixed

### 1. ✅ `future/web/utils/ingest.js`
**Fixed 5 instances:**

#### Line 92: `ingest_queue_error`
```javascript
// Before:
structuredLog('ERROR', 'ingest_queue_error', 'Failed to queue analytics event', { error: ... });

// After:
structuredLog('ERROR', 'ingest_queue_error', { error: ..., message: 'Failed to queue analytics event' });
```

#### Line 222: `performance_optimization_applied`
```javascript
// Before:
structuredLog('INFO', 'performance_optimization_applied', 'Auto-adjusted ingest preferences', { ... });

// After:
structuredLog('INFO', 'performance_optimization_applied', { message: 'Auto-adjusted ingest preferences', ... });
```

#### Line 421 & 447: `error_ingest` (JavaScript Error & Promise Rejection)
```javascript
// Before:
structuredLog('ERROR', 'error_ingest', 'JavaScript Error', errorPayload);
structuredLog('ERROR', 'error_ingest', 'Promise Rejection', errorPayload);

// After:
structuredLog('ERROR', 'error_ingest', errorPayload);
```

#### Line 457: `ingest_categories_updated`
```javascript
// Before:
structuredLog('INFO', 'ingest_categories_updated', 'Dynamic categorization updated', { ... });

// After:
structuredLog('INFO', 'ingest_categories_updated', { message: 'Dynamic categorization updated', ... });
```

#### Line 469: `optimization_settings_updated`
```javascript
// Before:
structuredLog('INFO', 'optimization_settings_updated', 'Performance optimization updated', { ... });

// After:
structuredLog('INFO', 'optimization_settings_updated', { settings: state.ingestPreferences });
```

---

### 2. ✅ `future/web/ui/dev-panel/dev-panel.js`
**Fixed 2 instances:**

#### Lines 751, 754: `dev-panel` initialization
```javascript
// Before:
structuredLog('INFO', 'dev-panel', 'Visual state inspector initialized');
structuredLog('ERROR', 'dev-panel', 'Failed to initialize state inspector', { error: ... });

// After:
structuredLog('INFO', 'dev-panel', { message: 'Visual state inspector initialized' });
structuredLog('ERROR', 'dev-panel', { message: 'Failed to initialize state inspector', error: ... });
```

---

### 3. ✅ `future/web/ui/dev-panel/state-inspector.js`
**Fixed 3 instances:**

#### Lines 77, 81, 128: State inspector warnings/errors
```javascript
// Before:
structuredLog('WARN', 'state-inspector', 'Engine missing onStateChange method');
structuredLog('WARN', 'state-inspector', 'Failed to initialize UI, fallback active');
structuredLog('ERROR', 'state-inspector', 'Failed to update state view', { error: ... });

// After:
structuredLog('WARN', 'state-inspector', { message: 'Engine missing onStateChange method' });
structuredLog('WARN', 'state-inspector', { message: 'Failed to initialize UI, fallback active' });
structuredLog('ERROR', 'state-inspector', { message: 'Failed to update state view', error: ... });
```

---

### 4. ✅ `future/web/utils/error-handling.js`
**Fixed 4 instances:**

#### Line 210: `critical-error`
```javascript
// Before:
structuredLog('ERROR', 'critical-error', 'CRITICAL: Accessibility system failure', { title, message, ... });

// After:
structuredLog('ERROR', 'critical-error', { 
  message: 'CRITICAL: Accessibility system failure', 
  title, 
  errorMessage: message, // Renamed to avoid collision
  ...
});
```

#### Line 277: Critical operation retry success
```javascript
// Before:
structuredLog('INFO', systemName, 'Critical operation succeeded after retry', { ... });

// After:
structuredLog('INFO', systemName, { message: 'Critical operation succeeded after retry', ... });
```

#### Line 302: System permanent failure
```javascript
// Before:
structuredLog('ERROR', systemName, 'CRITICAL: System permanently failed', { ... });

// After:
structuredLog('ERROR', systemName, { message: 'CRITICAL: System permanently failed', ... });
```

#### Line 328: Non-critical operation fallback
```javascript
// Before:
structuredLog('ERROR', systemName, 'Non-critical operation failed, using fallback', { ... });

// After:
structuredLog('ERROR', systemName, { message: 'Non-critical operation failed, using fallback', ... });
```

---

### 5. ✅ `future/web/ui/dev-panel/dev-panel.actions.js`
**Fixed 2 critical bugs:**

#### Import Missing: Added structuredLog import
```javascript
// Added at top of file:
import { structuredLog } from '../../utils/logging.js';
```

#### Scope Issue: `newCategories` out of scope
```javascript
// Before:
const state = engine.getState();
if (state) {
  const newCategories = {}; // Declared inside if block
  ...
}
import('../../utils/ingest.js').then(ingestModule => {
  ingestModule.updateIngestCategories(engine, newCategories); // ❌ Out of scope!
});

// After:
let newCategories = {}; // Declared in outer scope
const state = engine.getState();
if (state) {
  newCategories = {}; // Reassigned
  ...
}
import('../../utils/ingest.js').then(ingestModule => {
  ingestModule.updateIngestCategories(engine, newCategories); // ✅ In scope!
}).catch(e => {
  structuredLog('ERROR', 'Failed to import ingest module', { error: e.message });
});
```

---

## Impact

### Before Fixes:
**Live Logs (acoustsee-logs.json) showed:**
```json
{
  "t": 1759755456246,
  "level": "INFO",
  "text": "[2025-10-06T12:57:36.246Z] INFO: optimization_settings_updated {\"0\":\"P\",\"1\":\"e\",\"2\":\"r\",...}"
}
```

### After Fixes:
**Should now show:**
```json
{
  "timestamp": "2025-10-06T12:57:36.246Z",
  "level": "INFO",
  "message": "optimization_settings_updated",
  "data": {
    "settings": {
      "useIdleCallback": true,
      "maxEventsPerSecond": 60
    }
  }
}
```

---

## Testing Checklist

- [ ] Export Analytics - no character arrays in JSON
- [ ] Live Logs Export - no character arrays in text logs
- [ ] Console shows proper JSON objects (not {"0":"P"...})
- [ ] No "newCategories is not defined" errors
- [ ] No "structuredLog is not defined" errors
- [ ] Grid/Synth dropdowns show `requestedEngine: "undefined"` clearly in diagnostics

---

## Prevention

**Code Review Rule:** Always check `structuredLog()` calls have exactly 3-5 arguments:
1. `level` (string): 'DEBUG', 'INFO', 'WARN', 'ERROR'
2. `message` (string): The log message
3. `data` (object): **MUST BE AN OBJECT**, never a string
4. `persist` (boolean, optional): Whether to save to IndexedDB
5. `sample` (boolean, optional): Whether to apply sampling

**Quick Check:**
```javascript
// ❌ WRONG
structuredLog('ERROR', 'my-event', 'Some description', { data })

// ✅ CORRECT
structuredLog('ERROR', 'my-event', { message: 'Some description', ...data })
```
