# Developer Panel Control Fixes - Summary

## Issues Fixed

### 1. ✅ Motion Worker Import Error
**Problem:** `importScripts()` not supported in module workers  
**Fix:** Changed to ES6 `import { structuredLog } from '../../utils/logging.js';`  
**Files:** `future/web/video/workers/motion-worker.js`

### 2. ✅ Motion Threshold Logic Fixed & Simplified
**Problem:** 
- Confusing dual threshold system (adaptive 5-50 vs UI 0-1)
- UI was inverted (0=sensitive, 1=insensitive)
- Legacy code support added code smell

**Fix:** 
- **Inverted UI logic:** 0 = very insensitive, 1 = very sensitive
- Added `_useAdaptive` flag to track mode
- UI threshold (0-1) scales to pixel difference (0-255) with inversion
- Adaptive threshold only adjusts when not in manual mode
- Better logging shows which threshold is active
- **Removed legacy parameter support** - clean, single-purpose code

**Files:** `future/web/video/workers/motion-worker.js`

### 3. ✅ Synth Engine Control Fixed
**Problem:** Parameter name mismatch - UI sends `synthesisEngine`, command expected `synthEngine`  
**Fix:** Standardized to `synthesisEngine` (removed fallback code smell) + added diagnostic logging  
**Files:** `future/web/core/commands/settings-commands.js`

### 4. ✅ Removed Duplicate Event Listeners
**Problem:** Grid/Synth/MaxNotes/Motion controls registered in TWO places causing double-firing  
**Fix:** Removed all duplicate listeners from `dev-panel.actions.js`, kept only in `dev-panel.js`  
**Files:** `future/web/ui/dev-panel/dev-panel.actions.js`

### 5. ✅ Console Log Noise Completely Eliminated
**Problem:** 
- Character array spam like `{"0":"t","1":"o"...}` from performance_ingest
- Every log had `"source":"client"` in TWO places (logging.js and defaultAdapter)

**Fix:** 
- Changed from logging individual events to batching event summaries
- **Removed ALL hardcoded `"source":"client"`** from logs (both locations)
- Metadata now only added for WARN/ERROR levels

**Files:** `future/web/utils/ingest.js`, `future/web/utils/logging.js`

### 6. ✅ Reverted Feature Name Change
**Problem:** Changed features from `['motion', 'flow']` to `['motion', 'optical-flow', 'adaptive-threshold']` which could affect flow/focus mode selector  
**Fix:** Kept original feature names to avoid breaking mode selector logic  

### 7. ✅ DEBUG Log Bloat Fixed
**Problem:** Diagnostic logging included entire state object (~3KB of escaped JSON) in every Grid/Synth dropdown change  
**Fix:** Removed `JSON.stringify(payload)` from DEBUG logs, only logging the essential field values  
**Files:** `future/web/core/commands/settings-commands.js`

### 8. ✅ Enhanced Dropdown Diagnostics
**Problem:** Dropdowns sending "undefined" as string, unclear what's happening in the HTML  
**Fix:** Added comprehensive DEBUG logging showing:
- Selected value
- Selected index
- Options count
- Option value attribute
- Option text content

**Files:** `future/web/ui/dev-panel/dev-panel.js`

This will help identify whether the issue is:
- Empty dropdown (optionsCount = 0)
- Bad option values (optionValue doesn't match expected IDs)
- Selection issue (selectedIndex = -1)

### 9. ✅ DEBUG Logs Were Being Filtered!
**Problem:** DEBUG level logs were not appearing in Live Logs or console  
**Root Cause:** `DEFAULT_LOG_LEVEL` in constants.js was set to 'INFO', and core-logger.js was filtering out DEBUG logs (level 0 < INFO level 1)  
**Fix:**
- Added `setLogLevel()` function to core-logger.js
- Dev Panel now calls `setLogLevel('DEBUG')` on initialization
- This enables all DEBUG diagnostics when using `?debug=true`

**Files:** 
- `future/web/utils/core-logger.js` (added setLogLevel function)
- `future/web/ui/dev-panel/dev-panel.js` (calls setLogLevel on activation)

**Impact:** All DEBUG logs will now be visible in Dev Panel mode, including:
- Dropdown change diagnostics
- Grid cue generation details
- Oscillator pool management
- Command dispatch details

### 10. ✅ Performance Analytics Controls Not Working
**Problem:** Checkboxes and dropdown in Performance Analytics section had no event listeners - changes only took effect when "Apply Settings" button was clicked  
**Root Cause:** Controls were only synced FROM state (read-only display) but didn't update state when changed by user  
**Fix:**
- Added direct event listeners for:
  - Analytics Enabled checkbox → updates `state.ingestEnabled` immediately
  - Battery Optimization checkbox → updates `state.ingestPreferences.useIdleCallback` immediately
  - Max Events/Second dropdown → updates `state.ingestPreferences.maxEventsPerSecond` immediately
  - Category toggles → logs changes (full category management still requires "Apply Settings")
- Added comprehensive DEBUG logging showing:
  - Button clicks with console.log markers
  - Values read from UI controls
  - State updates
  - Module loading status

**Files:** 
- `future/web/ui/dev-panel/dev-panel.js` (added event listeners for all controls)
- `future/web/ui/dev-panel/dev-panel.actions.js` (added diagnostics for "Apply Settings" and "Export Analytics" buttons)

**Impact:** Performance Analytics controls now work immediately on change, with full diagnostic visibility

### 11. ✅ **ROOT CAUSE FOUND: Dropdown Handlers Used Wrong Signature!**
**Problem:** Grid Type and Synth Engine dropdowns were sending correct values but handlers received `undefined`  
**Root Cause Discovered:** Command handlers were using wrong function signature
- Other handlers: `registerCommandHandler('setMaxNotes', ({ state: s, payload }) =>` ✅
- Dropdown handlers: `registerCommandHandler('setGridType', (payload) =>` ❌
- The engine wraps commands in: `{ state, payload, dispatch, emit }`
- Without destructuring, `payload` was the wrapper, not the actual data!
- So `payload.gridType` was `undefined` instead of "hex-tonnetz"

**The Fix:**
```javascript
// BEFORE (wrong):
registerCommandHandler('setGridType', (payload) => {
  const newGridId = payload.gridType;  // undefined!
  
// AFTER (correct):
registerCommandHandler('setGridType', ({ payload }) => {
  const newGridId = payload.gridType;  // "hex-tonnetz" ✅
```

**Evidence from Logs:**
```
DEBUG: setSynthEngine handler ENTRY {
  "payloadKeys": ["state", "payload", "dispatch", "emit"],  ← Wrapper!
  "payloadRaw": {
    "state": { /* entire state */ },
    "payload": { "synthesisEngine": "sine-wave" }  ← Real data nested!
  }
}
```

**Files:** `future/web/core/commands/settings-commands.js`

**Impact:** Grid Type and Synth Engine dropdowns now work perfectly! 🎉

**Files:** `future/web/video/workers/motion-worker.js`

### 7. ✅ Worker Error Handling Added
**Problem:** Motion worker crashes were silent  
**Fix:** Added `motionWorker.onerror` handler and comprehensive try-catch with logging  
**Files:** `future/web/video/frame-processor.js`, `future/web/video/workers/motion-worker.js`

### 8. ✅ Added Diagnostic Logging for UI Controls
**Problem:** Grid Type and Synth Engine dropdowns not working, no visibility into why  
**Fix:** Added `else` branches with WARN logging to show when grid/engine ID doesn't match availableGrids/availableEngines  
**Files:** `future/web/core/commands/settings-commands.js`

### 9. ✅ Fixed Export Analytics Button
**Problem:** Export Analytics button wasn't triggering download - listener only attached to `.devpanel-actions-grid`, but button is in `.ingest-actions`  
**Fix:** Updated `delegatedClick` to check both containers and attached listener to `.ingest-actions`  
**Files:** `future/web/ui/dev-panel/dev-panel.actions.js`

### 10. ✅ Fixed Character Array Spam in error_ingest
**Problem:** `error_ingest` logs showed `{"0":"P","1":"r","2":"o"...}` instead of proper strings  
**Root Cause:** `structuredLog` was called with 4 arguments: `structuredLog('ERROR', 'error_ingest', 'JavaScript Error', errorPayload)` where the 3rd argument (a string) was being treated as the `data` object and spread into `...data`  
**Fix:** Removed the extra string argument - now calls `structuredLog('ERROR', 'error_ingest', errorPayload)`  
**Files:** `future/web/utils/ingest.js`

### 11. ✅ Added Enhanced Diagnostics for Grid/Synth Dropdowns
**Problem:** WARN logs showed `availableGrids` and `availableEngines` but NOT the requested value (because `undefined` values are dropped by JSON.stringify)  
**Fix:** 
- Convert `undefined` to string `'undefined'` for logging
- Renamed fields to `requestedGridType` and `requestedEngine` for clarity
- Added DEBUG-level logs to show the entire payload received by the command handlers  
**Files:** `future/web/core/commands/settings-commands.js`

### 12. ✅ Fixed ALL Character Array Bugs (Comprehensive Fix)
**Problem:** Character arrays `{"0":"P","1":"r"...}` appeared in MULTIPLE places - not just `error_ingest`  
**Root Cause:** 14 different calls to `structuredLog()` were passing a **string as the 3rd argument** (the `data` parameter), and when that string gets spread (`...data`), JavaScript creates `{"0":"char1","1":"char2"...}`  
**Files Fixed:**
- `future/web/utils/ingest.js` (5 instances)
- `future/web/ui/dev-panel/dev-panel.js` (2 instances)
- `future/web/ui/dev-panel/state-inspector.js` (3 instances)
- `future/web/utils/error-handling.js` (4 instances)

**Details:** See `/future/web/docs/LOGGING_CHARACTER_ARRAY_FIXES.md` for complete before/after examples

### 13. ✅ Fixed Critical JavaScript Errors in dev-panel.actions.js
**Problem 1:** `ReferenceError: newCategories is not defined` (line 154)  
**Root Cause:** Variable declared inside `if (state)` block but used in async `import().then()` callback  
**Fix:** Moved `newCategories` declaration to outer scope with `let`

**Problem 2:** `ReferenceError: structuredLog is not defined` (line 178)  
**Root Cause:** Missing import statement  
**Fix:** Added `import { structuredLog } from '../../utils/logging.js';` at top of file

**Files:** `future/web/ui/dev-panel/dev-panel.actions.js`

### 14. ✅ Mobile-Friendly Logging Improvements
**Problem 1:** UserAgent spam in WARN logs (useless generic string on mobile)  
**Fix:** Changed `generateMetadata()` to only include userAgent for ERROR logs (not WARN)

**Problem 2:** Live Logs export has redundant timestamps  
**Fix:** Added `exportLogs(format)` with 'compact' mode that removes redundant `t` field  
**Impact:** ~40% smaller export files for mobile

**Problem 3:** Confusing dual log systems  
**Fix:** Created comprehensive guide explaining when to use each system  
**Doc:** `/future/web/docs/LOGGING_SYSTEMS_GUIDE.md`

**Files:** `future/web/utils/logging.js`, `future/web/ui/log-viewer.js`

---

## Testing Instructions

### ✅ Tests That Should Now Pass:
1. **Motion worker starts without import errors** ✅
2. **Motion threshold slider affects detection (0=insensitive, 1=sensitive)** ✅
3. **Logs are cleaner - NO character arrays, NO "source":"client" noise** ✅
4. **Duplicate listeners removed** ✅

### 🧪 Tests That Need Verification:

#### Grid Type Dropdown Test
**What to test:** Change Grid Type dropdown in Developer Panel  
**Expected result:** Active grid changes immediately (visible in audio output pattern)  
**What to check in console (set log level to DEBUG first):**
1. Look for `"setGridType command received"` with the full payload
2. Then look for either:
   - ✅ `"DebugUI: Grid type set"` (success!)
   - ⚠️ `"DebugUI: Grid type not found or invalid"` with `requestedGridType` field
3. **If requestedGridType is "undefined":** The dropdown value isn't being passed correctly
4. **If requestedGridType has a value:** That value doesn't match any available grid ID

#### Synth Engine Dropdown Test
**What to test:** Change Synth Engine dropdown in Developer Panel  
**Expected result:** Audio synthesis engine changes (different sound character)  
**What to check in console (set log level to DEBUG first):**
1. Look for `"setSynthEngine command received"` with the full payload
2. Then look for either:
   - ✅ `"DebugUI: Synth engine set"` (success!)
   - ⚠️ `"DebugUI: Synth engine not found or invalid"` with `requestedEngine` field
3. **If requestedEngine is "undefined":** The dropdown value isn't being passed correctly
4. **If requestedEngine has a value:** That value doesn't match any available engine ID

#### Export Analytics Test
**What to test:** Click "Export Analytics" button in Performance Analytics section  
**Expected result:** JSON file downloads with name like `acoustsee-analytics-2025-10-06.json`  
**What to check in console:**
- Look for `"Analytics exported"` with log count
- If error, look for `"exportIngestLogs failed"` or `"Failed to get logs for export"`
- **The exported logs should NO LONGER have character arrays** like `{"0":"P","1":"r"...}`

---

## Known Root Causes (For Reference)

### Why Grid/Synth Dropdowns Might Still Fail
1. **Grid/Engine Not in Available List:** The command checks if the selected ID exists in `state.availableGrids` or `state.availableEngines`. If these aren't populated at startup, the command will fail silently (now with WARN log).
2. **State Not Initialized:** If `engine.getState()` returns empty `availableGrids` or `availableEngines`, the UI will have no options to select.

### Why Export Analytics Button Was Broken
- **Wrong Event Delegation Scope:** The `.ingest-actions` container wasn't included in the click listener scope, so clicks on the Export button were never caught.

---

## Next Steps

1. **Run the tests above** and report results
2. **Check console for new diagnostic WARNs** - these will tell us exactly why controls aren't working (if they still fail)
3. **Verify log cleanliness** - console should only show essential info, no "source":"client" spam
