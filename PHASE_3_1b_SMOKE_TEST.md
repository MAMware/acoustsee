# Phase 3.1b Smoke Test Checklist

// R291025 This document as been review by MAMware and is cosidered UNFIT since it does not pass quality checks. E. g.: is full of ambiguity and mentions features that are not present at AcoustSee, @Copilot please improve.


**Status**: 🔄 **READY FOR TESTING**  
**Branch**: v0.9.4-workerContracts  
**Commit**: 0244574 (Phase 3.1b integration)  
**Date**: 2025-10-28


## Pre-Test Setup

```bash
# Terminal 1: Start local server
cd /workspaces/acoustsee/future/web
python3 -m http.server 8000

# Terminal 2: Open browser
# Chrome/Firefox: http://localhost:8000/?debug=true
```

## Test 1: Application Starts Without Errors

### Steps:
1. Open http://localhost:8000/?debug=true in browser
2. Allow camera access when prompted
3. Wait for audio to initialize

### Expected Results:
- [ ] Video stream appears (shows live camera feed)
- [ ] No console errors (F12 → Console tab)
- [ ] Dev panel opens with controls visible
- [ ] Status shows "Connected" or similar // R291025 -or similar- this ambiguity should not be allowed
- [ ] No red error states in UI / ?? again "red error states" what are talking  about

### Logging to Check:
```
structuredLog('INFO', 'FrameConductor initialized', { mode: 'flow' })
structuredLog('INFO', 'initializeVideo: Video pipeline initialization completed successfully')
```

---

## Test 2: Flow Mode

### Prerequisites:
- App started successfully
- Video stream visible

### Steps:
1. Select "Flow" mode in orchestration dropdown (if available)
2. Move hand/object in front of camera slowly
3. Watch for motion detection (squares/highlights)
4. Listen for audio changes

### Expected Results:
- [ ] Motion detection works (visual indicators appear)
- [ ] Audio responds to motion (pitch/intensity changes)
- [ ] Dev-panel shows latency <50ms (target)
- [ ] No console errors
- [ ] Frame processing continuous (no stutters)

### Logging to Check:
```
structuredLog('DEBUG', 'Frame processor: Flow mode cues generated', { cuesCount: X })
structuredLog('INFO', 'Dispatching audioCuesReady', { cueCount: X, mode: 'flow' })
```

### Performance Check:
- Open Chrome DevTools → Performance tab
- Record 5 seconds of motion detection
- Check: Frame rate should stay near 60 FPS
- Should not drop below 30 FPS

---

## Test 3: Focus Mode

### Prerequisites:
- Flow mode tested successfully
- Dev panel open

### Steps:
1. Select "Focus" mode from dropdown
2. Wait 2-3 seconds for workers to load
3. Move hand/object in front of camera
4. Listen for audio changes
5. Check dev-panel for worker loading

### Expected Results:
- [ ] Mode switch works without errors
- [ ] Workers load successfully (watch console)
- [ ] Motion detection works (with new semantic layer)
- [ ] Audio responds appropriately
- [ ] Dev-panel shows latency <200ms (target)
- [ ] No console errors during mode switch

### Logging to Check:
```
structuredLog('INFO', 'Mode switched via FrameConductor', { 
  newMode: 'focus',
  previousMode: 'flow'
})
```

---

## Test 4: Hybrid Mode (if available)

### Prerequisites:
- Focus mode tested successfully

### Steps:
1. Select "Hybrid" mode from dropdown
2. Wait for workers to load
3. Move objects in front of camera
4. Note any combined behavior

### Expected Results:
- [ ] Mode switch completes successfully
- [ ] Hybrid mode behavior matches expectations
- [ ] Dev-panel shows latency <10ms per decision worker
- [ ] No console errors

---

## Test 5: Mode Switching Hot-Swap

### Prerequisites:
- All modes tested individually

### Steps:
1. Start in Flow mode with motion
2. Switch to Focus mode while motion continues
3. Switch to Hybrid mode (if available)
4. Switch back to Flow mode
5. Repeat 2-3 times rapidly

### Expected Results:
- [ ] Smooth transitions between modes
- [ ] No errors during rapid switching
- [ ] Audio continues without interruption
- [ ] Old workers terminated correctly
- [ ] New workers load correctly

### Logging to Check:
```
structuredLog('INFO', 'Mode switched via FrameConductor', { ... })
structuredLog('INFO', 'FrameConductor initialized', { mode: ... })
```

---

## Test 6: Console Error Check

### Steps:
1. Open DevTools Console (F12)
2. Clear console (Ctrl+L or click clear button)
3. Run through Tests 1-5
4. Review console for any errors (red text)

### Expected Results:
- [ ] Zero console errors (red messages)
- [ ] All logs are DEBUG/INFO/WARN only (no ERROR or uncaught exceptions)
- [ ] Audio warnings acceptable (if any)

### Common Issues to Ignore:
- "ResizeObserver loop limit exceeded" (browser bug, not our code)
- "WebGL context lost" (only if recovers automatically)
- CORS warnings for localhost (expected)

---

## Test 7: Audio Playback Verification

### Steps:
1. Ensure speaker/headphones are on
2. Move hand slowly across camera (top to bottom)
3. Move hand left to right
4. Rapid movement
5. Still/no motion

### Expected Results:
- [ ] Audio plays for all movement types
- [ ] Pitch changes with vertical position (Flow mode)
- [ ] Intensity changes with motion magnitude
- [ ] Silence or low amplitude when no motion
- [ ] Audio never clips or distorts (should sound musical)

---

## Test 8: Dev-Panel Metrics

### Steps:
1. Open dev-panel (click Dev icon or check debug=true URL)
2. Select "Orchestration" tab
3. Check visible metrics

### Expected Results:
- [ ] Current mode displayed correctly
- [ ] Frame count increments continuously
- [ ] Latency displays (should be <50ms Flow, <200ms Focus)
- [ ] Worker list shows correct workers for mode
- [ ] No NaN or undefined values in metrics
- [ ] Memory usage reasonable (<50MB for video subsystem)

### Metrics to Log:
```
conductor.getMetrics() = {
  lastFrameTimeMs: <X>,
  totalFramesProcessed: <Y>,
  totalErrorsEncountered: 0,
  currentMode: 'flow|focus|hybrid',
  currentWorkerCount: <N>,
  workerAverageTimings: { ... }
}
```

---

## Test 9: Grid Mapping (if grid selector available)

### Prerequisites:
- Flow mode working with audio

### Steps:
1. Move hand to top of frame - listen for pitch
2. Move hand to bottom - listen for pitch
3. Switch grid (if selector available)
4. Repeat movement
5. Note any grid-specific behavior

### Expected Results:
- [ ] Different grids produce different sounds
- [ ] Linear pitch grid: bottom=low, top=high
- [ ] Circle of fifths (if available): harmony-based tones
- [ ] Grid switching doesn't cause errors

---

## Test 10: Canvas Fallback (if OffscreenCanvas unavailable)

### Steps:
1. Check browser console for:
   ```
   "MediaStreamTrackProcessor not supported, using canvas-based fallback"
   ```
2. If shown, continue with all other tests
3. If not shown, skip this test (modern browser, OffscreenCanvas available)

### Expected Results:
- [ ] Fallback works if triggered
- [ ] Same audio/motion behavior as primary path
- [ ] Slight latency increase acceptable (<200ms vs <50ms)
- [ ] No crashes or errors

---

## Cleanup & Post-Test

### After All Tests Pass:
1. Stop local server (Ctrl+C in Terminal 1)
2. Close browser tab
3. Review any warnings logged
4. Document any issues found

### Test Result Summary:
- **Pass**: All tests completed without errors
- **Warn**: Minor issues found but no blocking bugs
- **Fail**: Critical errors preventing functionality

---

## Debug Commands (if issues encountered)

### 1. Check FrameConductor Initialization
```javascript
// In browser console:
console.log(window.conductor || 'FrameConductor not exposed');
```

### 2. Check Worker Status
```javascript
// In browser console (if dev-panel exposes metrics):
console.log(engine.getState().workers);
```

### 3. View Structured Logs
```javascript
// Enable max verbosity:
// Reload with: http://localhost:8000/?debug=true&logLevel=DEBUG
```

### 4. Performance Profiling
```javascript
// Chrome DevTools → Performance tab → Record → [run test] → Stop
// Look for: Main thread blocking, worker delays, frame drops
```

---

## Known Limitations (Phase 3.1b)

1. **No Semantic Detection Yet**: Focus mode uses simulated object detection (placeholder)
   - Real ML model coming in future phase

2. **Grid Mapping**: Currently uses motion fallback if grid fails
   - Expected behavior, not a bug

3. **Worker Timeouts**: If worker exceeds timeout, returns empty result
   - Logged as warning, audio continues

---

## Success Criteria

✅ **Phase 3.1b is COMPLETE when:**
1. All 10 tests pass without blocking errors
2. No console errors (red text)
3. Audio playback smooth in all modes
4. Mode switching works without interruption
5. Dev-panel metrics show correct values
6. Frame latency within targets (<50ms Flow, <200ms Focus)
7. No regressions from previous version

---

## Next Steps

**If Tests Pass:**
- ✅ Phase 3.1b COMPLETE
- → Begin Phase 3.1c (full test suite)
- → Begin Phase 3.2 (AudioRouter)

**If Issues Found:**
1. Document issue in debugging section
2. Check logs for error messages
3. Review frame-conductor.js for logic errors
4. Add specific logging at problem point
5. Re-test after fix

---

**Tester**: [Your Name]  
**Date**: ___________  
**Result**: ☐ PASS ☐ WARN ☐ FAIL

