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
**What to check in console:**
- Look for `"DebugUI: Grid type set"` (success) OR
- Look for `"DebugUI: Grid type not found or invalid"` (diagnostic)
- If you see the WARN, check what grid IDs are available vs what was sent

#### Synth Engine Dropdown Test
**What to test:** Change Synth Engine dropdown in Developer Panel  
**Expected result:** Audio synthesis engine changes (different sound character)  
**What to check in console:**
- Look for `"DebugUI: Synth engine set"` (success) OR
- Look for `"DebugUI: Synth engine not found or invalid"` (diagnostic)
- If you see the WARN, check available engine IDs

#### Export Analytics Test
**What to test:** Click "Export Analytics" button in Performance Analytics section  
**Expected result:** JSON file downloads with name like `acoustsee-analytics-2025-10-06.json`  
**What to check in console:**
- Look for `"Analytics exported"` with log count
- If error, look for `"exportIngestLogs failed"` or `"Failed to get logs for export"`

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
