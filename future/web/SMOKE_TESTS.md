# Smoke Test Guide - AcoustSee

This document provides step-by-step guides for smoke testing (quick functional verification) of the core AcoustSee pipelines.

## Overview

Smoke tests verify that critical systems **initialize, communicate, and produce output** without requiring comprehensive coverage. They're designed to catch regressions quickly.

**Run Before Committing:**
- After modifying core audio or video logic
- After updating worker communication patterns
- After changing app boot sequence
- Before opening a PR

---

## Quick Start: Automated Smoke Tests

### Using Node.js (Fast)

```bash
cd /workspaces/acoustsee/future/web/runtime-shims
node run-example.js
```

Expected output:
```
✓ Orchestration state initialized
✓ Capability detection working
✓ Metrics collection active
✓ All systems operational
```

### Using Browser (Complete)

```bash
cd /workspaces/acoustsee/future/web
python3 -m http.server 8000
# Open http://localhost:8000/?debug=true&logLevel=DEBUG
# Check console for boot messages
```

---

## Manual Test Suite

### 1. Boot & Initialization Smoke Test

**Goal**: Verify app starts correctly with all subsystems active

**Steps:**
1. Open `http://localhost:8000/?debug=true&logLevel=INFO` in browser
2. Open DevTools Console
3. Check for these log patterns:

   ✅ **Expected logs in order:**
   ```
   INFO: Initializing settings from loaded configs
   INFO: Settings initialized
   INFO: ENGINE: Attempting to register Sonification commands
   INFO: init: Video grids loaded successfully {count:3}
   INFO: init: UI setup complete
   INFO: Audio system initialized successfully
   ```

4. **No ERROR messages** should appear
5. **No worker errors** (would show as `ERROR: Grid aggregator worker error {}`)

**Pass Criteria:**
- [ ] All modules appear in sequence
- [ ] No errors before "UI setup complete"
- [ ] Dev panel loads and shows metrics

---

### 2. Audio Playback Test (Test Tone)

**Goal**: Verify audio pipeline works with manual trigger

**Steps:**
1. From initialized state above, click **"Play Test Tone"** button
2. You should **hear a 440Hz sine wave** (or other configured tone)
3. Check logs for:
   ```
   DEBUG: playCues entered
   INFO: playCues: detected test-note cue {pitch:440}
   INFO: playTestNote: dispatched audioPlayCues
   ```

**Pass Criteria:**
- [ ] Audio plays immediately when clicking
- [ ] No console errors
- [ ] Cue dispatch logged with correct pitch/intensity

---

### 3. Video Initialization Test

**Goal**: Verify video pipeline starts and gets frame data

**Prerequisites:**
- Camera connected and permission granted
- Audio unlocked (from Test Tone or user gesture)

**Steps:**
1. From initialized state, click **"Start Processing"** button
2. Grant camera permission when prompted
3. Check logs for:
   ```
   INFO: Motion Specialist worker started
   INFO: Fast motion worker started
   INFO: Grid aggregator worker started
   INFO: Pan-intensity mapper worker started
   ```
4. Wait 2-3 seconds for motion detection to start
5. **Move your hand in front of camera**
6. Check for motion detection logs:
   ```
   DEBUG: Motion handler: Extracted result {count:XX}
   DEBUG: Motion handler: Sending to gridAggregator
   ```

**Pass Criteria:**
- [ ] All workers start without errors
- [ ] Motion detected when moving (count > 0)
- [ ] Grid aggregation proceeds (no timeouts)
- [ ] Logs appear at ~20-30Hz rate

---

### 4. Audio from Video Motion Test

**Goal**: Verify audio plays in response to camera motion

**Prerequisites:**
- Video processing running (from Test 3)
- Audio context active
- Motion being detected

**Steps:**
1. With motion detection active, wave your hand at camera
2. Listen for **sound changing with your motion**
3. Check logs for cue generation:
   ```
   DEBUG: Motion handler: Sending to gridAggregator {regionCount:XX}
   INFO: Dispatching audioCuesReady {cueCount:X}
   DEBUG: playCues entered {contextState:running}
   ```
4. **Sound intensity/pitch should respond to your hand motion**

**Pass Criteria:**
- [ ] Cues generated (cueCount > 0 in logs)
- [ ] `playCues` called with audio data
- [ ] Audio responds to motion (subjective, but should be obvious)
- [ ] No worker error logs

**Troubleshooting:**
- No sound? Check logs for `cueCount:0` (workers not responding)
- Workers timing out? Check browser console for worker module errors
- Silent but logs show cues? Check AudioContext state

---

### 5. Worker Communication Test

**Goal**: Verify workers initialize, receive messages, and respond

**Steps:**
1. Open DevTools > Console
2. Run this JavaScript:
   ```javascript
   // Monitor worker messages
   const originalPostMessage = Worker.prototype.postMessage;
   let msgCount = 0;
   Worker.prototype.postMessage = function(msg) {
       console.log(`Worker message ${++msgCount}:`, msg.type);
       return originalPostMessage.call(this, msg);
   };
   ```
3. Start video processing
4. Watch console for worker message types like:
   ```
   Worker message 1: processFrame
   Worker message 2: processFrame
   Worker message 3: gridAggregation
   ```

**Pass Criteria:**
- [ ] Worker messages flow continuously (not stuck)
- [ ] Message count increases every 30-50ms
- [ ] No worker.error events
- [ ] Message payloads have expected structure

---

### 6. Mode Switching Test

**Goal**: Verify flow/focus mode toggling works

**Steps:**
1. With motion detection active, check current mode:
   ```
   ?debug=true shows "Mode: flow" in footer
   ```
2. Click mode switcher (if available) or check logs:
   ```
   INFO: Switching depth estimation path
   INFO: Orchestration state updated {currentMode:'focus'}
   ```
3. Verify logs show appropriate grid being used

**Pass Criteria:**
- [ ] Mode changes without crashing
- [ ] Workers reinitialize if needed
- [ ] No error logs during transition

---

### 7. Performance Baseline Test

**Goal**: Verify app doesn't have performance regressions

**Steps:**
1. Open with `?logLevel=INFO&includeProcessFrameLogs=false`
2. Start motion detection
3. Export Live Logs after 5-10 seconds
4. In exported JSON, check metrics:

   ```javascript
   {
     "metrics": {
       "fps": 29.5,
       "frameExtractionTimeMs": 12.5,
       "gridMappingTimeMs": 8.2,
       "totalCycleTimeMs": 22.1
     }
   }
   ```

**Pass Criteria (Baseline Values):**
- [ ] FPS: 25-30 (target: 29-30)
- [ ] Frame extraction: <20ms (target: 10-15ms)
- [ ] Grid mapping: <15ms (target: 5-10ms)
- [ ] Total cycle: <40ms (target: 25-33ms for 30fps)
- [ ] Memory: <100MB (check DevTools)

**If Baseline Fails:**
- GPU utilization not available? (Expected on CPU-only)
- Variance OK ±5ms (depends on system load)
- If greatly exceeded, check for:
  - High browser tab count
  - system processes consuming CPU
  - Worker not initializing properly

---

### 8. Logging System Test

**Goal**: Verify log levels and filtering work

**Steps:**
1. Open `http://localhost:8000/?logLevel=DEBUG`
2. Start motion detection
3. Check console frequency (should log every frame, ~30 Hz)
4. Change to `?logLevel=INFO`
5. Motion still running - console should be much quieter
6. Change to `?logLevel=ERROR`
7. Only errors should appear

**Pass Criteria:**
- [ ] DEBUG: Very frequent logs (~30/sec)
- [ ] INFO: Sparse logs (state changes only)
- [ ] ERROR: Mostly silent unless problems occur

---

### 9. Export & Telemetry Test

**Goal**: Verify logs and metrics can be exported

**Steps:**
1. Run through Test 4 (audio from motion)
2. Click floating export button (lower right)
3. Export "Live Logs"
4. Open JSON in text editor
5. Verify structure:
   ```json
   {
     "exported_at": "2025-10-22T...",
     "log_count": 1234,
     "app_version": "0.9.4",
     "app_env": "development",
     "early_logs": [...],
     "runtime_logs": [...]
   }
   ```

**Pass Criteria:**
- [ ] File downloads without errors
- [ ] JSON is valid and readable
- [ ] Contains motion detection logs
- [ ] Metadata present (timestamps, versions)

---

### 10. Accessibility Smoke Test

**Goal**: Verify keyboard navigation and screen reader compatibility

**Steps:**
1. Open `http://localhost:8000/?debug=true`
2. **Keyboard Only Test:**
   - Tab through controls
   - All buttons reachable
   - Focus indicator visible (yellow outline)
   - Buttons activate with Enter/Space
   - No focus traps

3. **Screen Reader Test (if NVDA/VoiceOver available):**
   - Launch screen reader
   - Navigate page
   - Verify announced:
     - Page title
     - Buttons and labels
     - Status changes
     - Errors (if any)

**Pass Criteria:**
- [ ] All interactive elements keyboard accessible
- [ ] Focus indicator always visible
- [ ] Screen reader announces major sections
- [ ] No screen reader output errors

---

## Automated Test Runner (Node.js)

Located at `/workspaces/acoustsee/future/web/runtime-shims/run-example.js`

**Features:**
- Runs core orchestration logic headless
- Tests state initialization
- Validates metrics collection
- Fast (~100ms to complete)

**Run:**
```bash
cd /workspaces/acoustsee/future/web/runtime-shims
node run-example.js
```

---

## Regression Test Matrix

Use this checklist for PRs:

| System | Test | Status |
|--------|------|--------|
| **Boot** | Initialization | [ ] |
| **Audio** | Test tone plays | [ ] |
| **Video** | Motion detected | [ ] |
| **Pipeline** | Audio responds to motion | [ ] |
| **Workers** | Messages flowing | [ ] |
| **Mode** | Switch flow/focus | [ ] |
| **Perf** | Meets baseline | [ ] |
| **Logs** | Levels work | [ ] |
| **Export** | Downloads JSON | [ ] |
| **A11y** | Keyboard nav works | [ ] |

---

## Debugging Failed Tests

### Workers Not Initializing
```bash
# Check browser console for:
# "ERROR: Grid aggregator worker error {colno:9}"
# Indicates module import failure
# See: future/web/video/workers/fast-grid-aggregator.js line 1-30
```

### No Motion Detected
```javascript
// In console:
const logs = window.__acoustsee_logs;
logs
  .filter(l => l.data.message?.includes('Motion'))
  .slice(-5) // Last 5 motion logs
  .forEach(l => console.log(l.text));
```

### Audio Silent But Logs Show Cues
- Check AudioContext state: `audioContext.state`
- Check oscillator pool: `oscillatorPool.length`
- Check master gain volume: `masterGain.gain.value`

### Logs Sparse/Missing
- Check log level setting in URL
- Verify `window.__acoustsee_logs` exists
- Check browser console for module errors

---

## Performance Profiling

For deeper analysis, use Chrome DevTools:

1. Open DevTools Performance tab
2. Click record
3. Start motion detection
4. Let run for 5-10 seconds
5. Stop recording
6. Analyze:
   - Frame rate (should be steady ~30fps)
   - Long tasks (should be <50ms)
   - Worker activity (should be continuous)

---

## CI/CD Integration

When setting up CI:

```bash
#!/bin/bash
cd future/web/runtime-shims
node run-example.js || exit 1
echo "✓ Runtime shims smoke test passed"
```

---

## Questions?

- Check `ARCHITECTURE.md` for subsystem details
- Review `audio/README.md` for audio pipeline
- See `video/README.md` for video processing
- File an issue if you find test gaps
