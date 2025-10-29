# Phase 3.1b Integration Guide: Refactor frame-processor to Use FrameConductor

**Status**: 🚀 **READY TO START**  
**Depends On**: Phase 3.1a ✅ COMPLETE (FrameConductor created)  
**Duration**: 3-4 hours  
**Target**: Reduce frame-processor.js from 1,051 to ~600 lines (remove 290+ duplicate lines)

---

## 🎯 Objective

Integrate the FrameConductor into frame-processor.js to replace ~290 lines of hardcoded chain orchestration logic. The refactoring:

1. Removes `startFlowModeWorkers()` (replaced by conductor initialization)
2. Removes `processFlowMode()` (replaced by conductor.processFrame())
3. Removes custom event listeners for individual workers
4. Keeps all public APIs unchanged (no breaking changes)
5. Maintains existing canvas fallback logic
6. Preserves mode routing and grid mapping

---

## 📊 Before & After Comparison

### BEFORE (Current)
```
frame-processor.js: 1,051 lines
├── startMotionWorker() - loads motion worker
├── startDepthWorker() - loads depth worker
├── startFlowModeWorkers() - loads 3 Flow mode workers ← REPLACE
├── processFlowMode() - hardcoded chain logic (159 lines) ← REPLACE
├── processWithMotionWorker() - hardcoded hybrid/focus chain ← REPLACE
├── initializeVideoCanvasFallback() - browser compat
└── ... (other methods)

Problems:
- 290+ lines of duplicate chain orchestration
- Hardcoded custom event listeners per worker
- No validation except manual WorkerContract checks
- Adding new worker requires modifying frame-processor
- Chain logic scattered across multiple functions
```

### AFTER (Refactored)
```
frame-processor.js: ~600 lines
├── import FrameConductor from './frame-conductor.js'
├── let frameConductor = null
├── initializeVideo()
│  └── frameConductor = new FrameConductor(config)
│      frameConductor.initializeForMode(mode)
├── processFrame() [MAIN LOOP]
│  ├── Check mode change → frameConductor.initializeForMode(newMode)
│  ├── Call frameConductor.processFrame()
│  └── Dispatch 'audioCuesReady' with results
└── ... (other methods)

Benefits:
- 451 fewer lines (43% reduction)
- All orchestration logic in FrameConductor
- Adding new worker: just update manifest, no code changes
- Full validation via WorkerContract
- Metrics accessible via getMetrics()
- Cleaner separation of concerns
```

---

## 🔍 Code Locations to Modify

### File: `future/web/video/frame-processor.js`

#### 1. Add Import (Line ~12, after existing imports)
```javascript
// CURRENT:
import { WorkerContract } from './workers/worker-contract.js';

// ADD:
import { FrameConductor } from './frame-conductor.js';  // NEW
import { getWorkersForMode } from './workers/worker-manifest.js';  // Already used, but now just for reference
```

#### 2. Add Module State (Line ~20-25, after existing module state)
```javascript
// CURRENT:
let flowModeWorkers = {
  fastMotion: null,
  gridAggregator: null,
  panIntensityMapper: null
};

// REPLACE WITH:
let frameConductor = null;  // Manifest-driven orchestrator
```

#### 3. Remove/Replace `startFlowModeWorkers()` Function

**Current**: Lines 95-155 (61 lines)  
**Action**: DELETE entirely - FrameConductor handles worker loading

```javascript
// DELETE THIS ENTIRE FUNCTION (Lines 95-155)
function startFlowModeWorkers() {
  try {
    if (!flowModeWorkers.fastMotion) {
      flowModeWorkers.fastMotion = new Worker(...);
      ...
    }
    ...
  } catch (e) {
    ...
  }
}
```

#### 4. Replace `processFlowMode()` Function

**Current**: Lines 159-408 (250 lines of chain orchestration)  
**Action**: Replace entire function body with conductor call

```javascript
// REPLACE THIS:
function processFlowMode(frameData, width, height, state) {
  return new Promise((resolve) => {
    try {
      // ... 250 lines of nested handlers and manual chain logic ...
      
      // Remove all custom event listeners
      flowModeWorkers.fastMotion.addEventListener('message', motionHandler);
      flowModeWorkers.gridAggregator.addEventListener('message', gridHandler);
      flowModeWorkers.panIntensityMapper.addEventListener('message', panIntensityHandler);
      
      // Remove all manual message passing
      flowModeWorkers.fastMotion.postMessage({ type: 'frame', ... });
      
      // ... 150+ more lines ...
    } catch (error) { ... }
  });
}

// WITH THIS:
async function processFlowMode(frameData, width, height, state) {
  if (!frameConductor) {
    throw new Error('FrameConductor not initialized');
  }

  try {
    const result = await frameConductor.processFrame(frameData, width, height, state);
    
    // Extract cues from result
    let cues = [];
    const grid = _config.getCurrentGrid();
    
    if (grid && grid.mapFunction && result.result?.coords?.length > 0) {
      // Convert result to movingRegions format
      const movingRegions = [];
      const regions = result.result;
      for (let i = 0; i < regions.count && i < regions.coords.length / 2; i++) {
        movingRegions.push({
          x: regions.coords[i * 2],
          y: regions.coords[i * 2 + 1],
          intensity: regions.intens[i] || 0
        });
      }
      
      // Map via grid
      const gridOutput = grid.mapFunction(frameData, width, height, null, { movingRegions });
      if (gridOutput?.cues?.length > 0) {
        cues = gridOutput.cues;
      }
    }
    
    // Fallback
    if (cues.length === 0) {
      cues = createCuesFromAudioParams({ pan: 0, intensity: 0 }, state);
    }
    
    return { cues, panIntensity: { pan: 0, intensity: 0 } };
  } catch (error) {
    structuredLog('ERROR', 'processFlowMode error', { error: error.message });
    return { cues: [], panIntensity: { pan: 0, intensity: 0 } };
  }
}
```

#### 5. Update `initializeVideo()` Function

**Current**: Lines 760-775  
**Action**: Initialize FrameConductor in this function

```javascript
// CURRENT:
export async function initializeVideo(config) {
  _config = config;
  _config.engine = engine;
  
  try {
    startFrameProviderWorker();
    startMotionWorker('flow');  // START SINGLE WORKER
    startFlowModeWorkers();      // ← REMOVE THIS LINE
    
    engine.onCommand('setOperatingMode', async (payload) => {
      currentMode = payload.mode;
      // ... mode switching logic
    });
  }
}

// UPDATED:
export async function initializeVideo(config) {
  _config = config;
  _config.engine = engine;
  
  try {
    startFrameProviderWorker();
    
    // Initialize FrameConductor (REPLACES startFlowModeWorkers and startMotionWorker)
    frameConductor = new FrameConductor({
      flowTimeout: 100,
      focusTimeout: 200,
      hybridTimeout: 10,
      logMetrics: true,
      logFrames: true
    });
    
    // Initialize for default mode
    await frameConductor.initializeForMode('flow');
    
    engine.onCommand('setOperatingMode', async (payload) => {
      currentMode = payload.mode;
      // Re-initialize conductor for new mode (hot-swap workers)
      try {
        await frameConductor.initializeForMode(payload.mode);
      } catch (error) {
        structuredLog('ERROR', 'Failed to switch to mode', { mode: payload.mode, error: error.message });
      }
    });
  }
}
```

#### 6. Update Frame Processing Loop

**Current**: Lines 630-720 (canvas fallback scenario)  
**Action**: Replace `processFlowMode()` calls with same signature (already updated)

```javascript
// This is ALREADY HANDLED by the processFlowMode() replacement above
// No additional changes needed - the function signature stays the same
// frame-processor.js calls: const flowResult = await processFlowMode(frameData, canvas.width, canvas.height, state);
// This will now call the conductor internally
```

#### 7. Update Cleanup on Shutdown

**Current**: May not exist  
**Action**: Add dispose call if shutdown handler exists

```javascript
// ADD AT END OF FILE (if not already present):
export function disposeVideo() {
  if (frameProviderWorker) {
    frameProviderWorker.terminate();
  }
  if (motionWorker) {
    motionWorker.terminate();
  }
  if (depthWorker) {
    depthWorker.terminate();
  }
  
  // NEW: Dispose conductor
  if (frameConductor) {
    frameConductor.dispose();
    frameConductor = null;
  }
  
  structuredLog('INFO', 'Video processor disposed');
}
```

---

## 📋 Step-by-Step Refactoring Checklist

### Phase 3.1b-1: Preparation (30 minutes)
- [ ] Create new branch: `git checkout -b v0.9.4-frameConductor-integration`
- [ ] Back up current frame-processor.js: `cp frame-processor.js frame-processor.js.backup`
- [ ] Read through entire frame-processor.js to understand structure
- [ ] Identify all locations where `processFlowMode()` is called
- [ ] Count current line count: `wc -l frame-processor.js`

### Phase 3.1b-2: Core Refactoring (2-2.5 hours)
- [ ] Add FrameConductor import at top
- [ ] Add `let frameConductor = null` to module state
- [ ] DELETE entire `startFlowModeWorkers()` function
- [ ] REPLACE `processFlowMode()` implementation (keep signature)
- [ ] UPDATE `initializeVideo()` to create FrameConductor instance
- [ ] UPDATE mode switching to call `frameConductor.initializeForMode(newMode)`
- [ ] ADD `disposeVideo()` function if not present
- [ ] Verify no syntax errors: `npm run lint` or similar

### Phase 3.1b-3: Testing & Validation (1 hour)
- [ ] Run unit tests: `npm test` (or appropriate test command)
- [ ] Smoke test Flow mode: open http://localhost:8000/?debug=true
  - [ ] Select "Flow mode" in orchestration dropdown
  - [ ] Verify motion detection works
  - [ ] Check dev-panel shows <50ms latency
- [ ] Smoke test Focus mode
  - [ ] Switch to "Focus mode"
  - [ ] Verify all 5 workers loaded
  - [ ] Check dev-panel shows <200ms latency
- [ ] Smoke test Hybrid mode
- [ ] Verify audio still plays (bridge still working)
- [ ] Check browser console for errors
- [ ] Measure line count: `wc -l frame-processor.js` (should be ~600 lines)

### Phase 3.1b-4: Documentation & Commit (30 minutes)
- [ ] Update `future/web/video/README.md` to mention FrameConductor
- [ ] Document that old `startFlowModeWorkers()` is now in FrameConductor
- [ ] Commit changes with clear message
- [ ] Create PR with before/after diff

---

## 🚦 Testing Commands

### Lint Check
```bash
# Run ESLint if configured
npm run lint future/web/video/frame-processor.js

# Or manually check for syntax
node --check future/web/video/frame-processor.js
```

### Run Tests
```bash
# Run all tests
npm test

# Run video-specific tests
npm test -- video

# Run with coverage
npm test -- --coverage
```

### Browser Smoke Test
```bash
# Terminal 1: Start local server
cd future/web && python3 -m http.server 8000

# Terminal 2: Open browser
open http://localhost:8000/?debug=true

# Check:
# 1. Video loads without errors
# 2. Motion detection works (squares appear on screen)
# 3. Audio plays
# 4. Dev-panel shows orchestration metrics
# 5. Mode switching works
# 6. No console errors
```

---

## 🔴 Potential Issues & Solutions

### Issue 1: "frameConductor is not initialized"
**Cause**: `initializeVideo()` not called or conductor initialization failed  
**Solution**: 
- Check that `initializeVideo()` is called during app startup
- Check error logs for initialization failures
- Ensure `engine` reference is available

### Issue 2: "Worker messages still using custom handlers"
**Cause**: Accidentally left old event listener code in frame-processor  
**Solution**:
- Search for `addEventListener('message', ...)` in frame-processor
- Should be ZERO matches (all in FrameConductor now)
- Use: `grep -n addEventListener future/web/video/frame-processor.js`

### Issue 3: "Latency increased after refactoring"
**Cause**: FrameConductor overhead or different worker loading order  
**Solution**:
- Compare timings via dev-panel metrics
- Check if workers are loaded correctly (use getMetrics())
- Verify worker timeout settings match previous behavior
- Profile using Chrome DevTools Performance tab

### Issue 4: "Mode switching not working"
**Cause**: Conductor initialization failing on mode change  
**Solution**:
- Check error logs for mode initialization failures
- Ensure new mode is valid: 'flow' | 'focus' | 'hybrid'
- Verify worker-manifest has entries for the mode

### Issue 5: "Grid mapping not working after refactoring"
**Cause**: Motion regions not extracted from conductor result  
**Solution**:
- Check that `frameConductor.processFrame()` returns proper result structure
- Verify motion regions have `.coords` and `.count` fields
- Add logging: `console.log(result)` in processFlowMode()

---

## 📝 Code Review Checklist

Before committing, verify:

- [ ] **No breaking changes**: All public exports unchanged
- [ ] **Imports correct**: FrameConductor, worker-manifest, logging
- [ ] **Module state clean**: Only `frameConductor` var (removed flow mode vars)
- [ ] **startFlowModeWorkers deleted**: Should not exist anymore
- [ ] **processFlowMode signature preserved**: `(frameData, width, height, state) => Promise`
- [ ] **Error handling**: Try/catch around conductor calls
- [ ] **Logging**: structuredLog used consistently
- [ ] **Dispose cleanup**: Conductor.dispose() called on shutdown
- [ ] **No custom event listeners**: In frame-processor.js
- [ ] **Grid mapping preserved**: Canvas fallback + grid.mapFunction still works
- [ ] **Performance**: No latency regression (<50ms Flow, <200ms Focus)
- [ ] **Test coverage**: All paths tested

---

## 📊 Success Metrics

### Code Metrics
- ✅ frame-processor.js: 1,051 → ~600 lines (43% reduction)
- ✅ Duplicate code eliminated: 290+ lines removed
- ✅ Lines of code complexity: Reduced by ~40%

### Functionality Metrics
- ✅ All modes work: Flow, Focus, Hybrid
- ✅ Grid mapping still works
- ✅ Canvas fallback still works
- ✅ Audio still plays
- ✅ Mode switching hot-swaps workers

### Performance Metrics
- ✅ Flow mode latency: <50ms (no regression)
- ✅ Focus mode latency: <200ms (no regression)
- ✅ Memory usage: Similar or better
- ✅ CPU usage: Similar or better

### Quality Metrics
- ✅ Zero console errors
- ✅ All tests pass
- ✅ ESLint clean
- ✅ Comprehensive error handling

---

## 🎬 Timeline

| Time | Task |
|------|------|
| 0:00-0:30 | Preparation & backup |
| 0:30-2:30 | Core refactoring |
| 2:30-3:00 | Testing & validation |
| 3:00-3:30 | Documentation & commit |

**Total**: 3.5 hours

---

## 💡 Notes for Refactoring

1. **Keep it Simple**: FrameConductor handles complexity; frame-processor should be thin
2. **Test Incrementally**: After each major change, run smoke tests
3. **Use Logging**: structuredLog at key points for debugging
4. **Preserve APIs**: Don't change function signatures or exports
5. **Document Changes**: Update README and code comments
6. **Measure Performance**: Use dev-panel metrics to verify no regression

---

## 🚀 Next Steps (After Phase 3.1b Complete)

Once refactoring is verified working:

1. **Phase 3.1c**: Full test suite (unit + integration)
2. **Phase 3.2**: AudioRouter (capability-aware synth routing)
3. **Phase 3.3**: Bridge enhancement (multiple event types)
4. **Phase 3.4**: Full integration testing
5. **Phase 3.5**: Documentation & polish

---

**Status**: 🟢 Ready to begin Phase 3.1b  
**Prerequisite**: Phase 3.1a ✅ COMPLETE  
**Duration**: ~3.5 hours  
**Deliverable**: frame-processor.js (1,051 → ~600 lines, 290 duplicate lines removed)
