# AcoustSee Logging Systems - User Guide

## Overview

AcoustSee has **two separate logging systems** designed for different purposes:

| System | Purpose | When to Use | Export Button | File Name |
|--------|---------|-------------|---------------|-----------|
| **Live Logs** | Console mirror - ALL logs in real-time | Quick debugging, see everything happening | "Export" | `acoustsee-logs.json` |
| **Performance Analytics** | Persistent storage - Important events only | Track errors over time, performance analysis | "Export Analytics" | `acoustsee-analytics-YYYY-MM-DD.json` |

---

## 1. Live Logs (Console Mirror)

### What It Shows:
- **Everything** that appears in the browser console
- Real-time updates (pauses when you pause)
- Survives page refreshes (stored in memory)

### Log Levels:
- `DEBUG` - Detailed diagnostic info (only when debug mode active)
- `INFO` - General informational messages
- `WARN` - Warnings that don't break functionality
- `ERROR` - Errors that need attention

### Export Format:
```json
[
  {
    "level": "INFO",
    "message": "[2025-10-06T13:36:04.887Z] INFO: COMMAND: Start processing initiated."
  },
  {
    "level": "WARN",
    "message": "[2025-10-06T13:35:50.318Z] WARN: DebugUI: Synth engine not found {\"requestedEngine\":\"undefined\"}"
  }
]
```

### Mobile Usage:
✅ **Perfect for mobile testing** - compact format, easy to read
✅ Export button works on all browsers
✅ No redundant timestamps

### Use Cases:
- "What's happening right now?"
- "Did my button click trigger anything?"
- "Why is this feature not working?"

---

## 2. Performance Analytics (IndexedDB Persistent Storage)

### What It Shows:
- **WARN and ERROR logs only** (important issues)
- **Performance events** (`performance_ingest`, `error_ingest`)
- **Persisted to IndexedDB** (survives page refresh and browser restart)
- **Automatic cleanup** (keeps last 1000 entries)

### Export Format:
```json
[
  {
    "timestamp": "2025-10-06T13:35:50.318Z",
    "level": "WARN",
    "message": "DebugUI: Synth engine not found or invalid",
    "data": {
      "requestedEngine": "undefined",
      "availableEngines": ["fm-synthesis", "sawtooth-pad", "sine-wave", "strings"]
    }
  },
  {
    "timestamp": "2025-10-06T13:36:04.123Z",
    "level": "ERROR",
    "message": "error_ingest",
    "data": {
      "userAgent": "Mozilla/5.0 (Linux; Android 10; K)...",
      "event_type": "client_error",
      "message": "ReferenceError: foo is not defined",
      "stack": "ReferenceError: foo is not defined\n    at https://..."
    }
  }
]
```

### Mobile Usage:
✅ **Great for bug reports** - captures errors that happened earlier
✅ **Detailed error context** - includes userAgent and stack traces for ERROR logs
⚠️ **Can be large** - only export when you need full diagnostics

### Use Cases:
- "What errors happened in the last session?"
- "Is there a pattern to these crashes?"
- "Send bug report to developer"

---

## Key Differences

### Data Included:

| Feature | Live Logs | Performance Analytics |
|---------|-----------|----------------------|
| DEBUG logs | ✅ Yes (if enabled) | ❌ No |
| INFO logs | ✅ Yes | ❌ No |
| WARN logs | ✅ Yes | ✅ Yes |
| ERROR logs | ✅ Yes | ✅ Yes + extra context |
| UserAgent | ❌ No | ✅ Yes (ERROR only) |
| Stack traces | ❌ No | ✅ Yes (ERROR only) |
| Performance events | ✅ Yes | ✅ Yes |

### Storage:

| Feature | Live Logs | Performance Analytics |
|---------|-----------|----------------------|
| Storage | In-memory buffer | IndexedDB (persistent) |
| Max entries | 1000 (configurable) | 1000 (auto-cleanup) |
| Survives refresh | ❌ No | ✅ Yes |
| Survives restart | ❌ No | ✅ Yes |

---

## When to Use Which?

### Use Live Logs When:
- ✅ Testing feature right now
- ✅ Need to see all log levels
- ✅ Want quick, readable output
- ✅ On mobile (compact format)
- ✅ Debugging UI interactions

### Use Performance Analytics When:
- ✅ Tracking errors over time
- ✅ Need detailed crash reports
- ✅ Sending bug report to developer
- ✅ Analyzing performance patterns
- ✅ Need userAgent and stack traces

---

## Mobile Testing Best Practices

### ✅ DO:
1. Use Live Logs for quick checks
2. Export Live Logs after reproducing issue
3. Pause logs before exporting (cleaner)
4. Use Performance Analytics for persistent errors

### ❌ DON'T:
1. Don't try to copy from mobile console (doesn't work reliably)
2. Don't export huge log files (filter first if possible)
3. Don't rely on Performance Analytics for INFO/DEBUG (it doesn't store them)

---

## Recent Improvements (October 2025)

### ✅ Fixed:
1. **UserAgent noise reduced** - Now only included in ERROR logs (not WARN)
2. **Character arrays eliminated** - All logs now show proper JSON objects
3. **Compact export format** - Live Logs now mobile-friendly
4. **Critical bugs fixed** - No more `newCategories is not defined` errors

### 📊 Impact:
- Live Logs exports are **~40% smaller**
- Performance Analytics more focused (WARN logs cleaner)
- Mobile testing much easier

---

## FAQ



---

## For Developers: How to Add Logging

### Live Logs (will appear in console AND Live Logs):
```javascript
import { structuredLog } from '../../utils/logging.js';

structuredLog('INFO', 'myFeature', { message: 'Feature activated', userId: 123 });
structuredLog('WARN', 'myFeature', { message: 'Something unusual', value: 'unexpected' });
```

### Performance Analytics (will also be persisted to IndexedDB):
```javascript
// WARN and ERROR logs are automatically persisted
structuredLog('ERROR', 'myFeature', { 
  message: 'Critical failure', 
  error: e.message, 
  context: {...} 
});
```

---

## Technical Details

### Live Logs Implementation:
- **File:** `future/web/ui/log-viewer.js`
- **Storage:** In-memory ring buffer (1000 entries)
- **Update:** Real-time via `requestAnimationFrame`
- **Export:** `exportLogs('compact')` - mobile-friendly format

### Performance Analytics Implementation:
- **File:** `future/web/utils/idb-logger.js`
- **Storage:** IndexedDB (`AcoustSeeLogsDB`)
- **Persistence:** Automatic for WARN/ERROR + performance events
- **Export:** `getAllIdbLogs()` - full diagnostic format
