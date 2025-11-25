# Grid Configuration System

## Overview

The grids subsystem manages **paradigm-aware spatial grids** for video frame processing. Each grid represents a different way to map pixel coordinates to audio parameters. R251125r this explanation needs more detail, a lot more.

### Grid Types

- **linear-pitch**: 1D linear frequency mapping (columns = pitch)
- **circle-of-fifths**: Hexagonal harmonic topology  
- **hex-tonnetz**: Tonnetz topology (3-semitone lattice)
- Available grids enumerated in `available-grids.js`

---

## Grid Configuration (Critical Pattern)

### Single Source of Truth

**`grid-config.js` is the authoritative source for grid dimensions.**

All workers must receive grid configuration from the main thread. **Never hardcode grid values in workers.**

### Configuration Modes

| Mode | Rows | Cols | Purpose | Latency | Detail |
|------|------|------|---------|---------|--------|
| **flow** | 3 | 3 | Navigation mode | <50ms | Low (coarse) |
| **focus** | 8 | 8 | Exploration mode | <200ms | High (fine) |
| **hybrid** | 5 | 5 | Default | <100ms | Medium |

### Correct Usage Pattern

**Main Thread (frame-conductor.js):**
```javascript
import { getGridConfig } from './video/grids/grid-config.js';

// When sending frames to workers:
const gridConfig = getGridConfig(state.currentMode, frameWidth, frameHeight);
worker.postMessage({
  type: 'processingRequest',
  data: frameData,
  gridConfig,  // ← CRITICAL: Always include config
  state
});
```

**Worker (any video worker):**
```javascript
self.onmessage = (msg) => {
  // Receive gridConfig from main thread
  const gridConfig = msg.gridConfig || getGridConfig('hybrid'); 
  
  // Process using config
  const { rows, cols } = gridConfig;
  const cellWidth = frameWidth / cols;
  const cellHeight = frameHeight / rows;
  
  // Map pixel → cell
  const cellX = Math.floor(pixelX / cellWidth);
  const cellY = Math.floor(pixelY / cellHeight);
};
```

---

## Architecture: Why Separate Configs?

### Problem Solved

Early versions had grid dimensions hardcoded in multiple places:
- `depth-worker.js`: `{ rows: 4, cols: 4 }`
- `image-worker.js`: `{ rows: 4, cols: 4 }`
- `fast-motion-worker.js`: `{ rows: 4, cols: 4 }`
- `fast-grid-aggregator.js`: `{ rows: 4, cols: 4 }`

This created **sync drift**: changes to grid logic required updates in 5+ places.

### Solution: Message-Driven Sync

1. Main thread computes once: `gridConfig = getGridConfig(mode)`
2. Sends with every frame: `worker.postMessage({ gridConfig, ... })`
3. Worker uses received config (no local state about dimensions)
4. All workers automatically sync to mode changes

### Fallback Safety Strategy R251125f NO FALLBACKS!!! JUST DONT, DO THINGS RIGHT OR DONT DO IT AT ALL

Workers **may include a hardcoded fallback** for defensive robustness:
```javascript
const config = msg.gridConfig || { rows: 4, cols: 4, ... };
```

**Important**: This fallback should **never activate** in normal operation. It only helps if:
- Message format is malformed
- Worker is called with legacy message format
- Communication error occurs

**Do NOT rely on fallback as a feature.**

---

## Implementation Checklist

### When Adding New Worker

- [ ] Import `getGridConfig` from `grid-config.js`? → NO (worker can't import)
- [ ] Accept `gridConfig` in message? → YES
- [ ] Use `msg.gridConfig` to determine cell boundaries? → YES
- [ ] Include fallback `|| { rows: 4, cols: 4 }` for safety? → YES (defensive)
- [ ] Hardcode other grid dimensions? → NO (only use msg.gridConfig)

### When Adding New Grid Type

1. Create class (e.g., `new-grid.js`) extending grid interface
2. Add to `available-grids.js` exports
3. Add case to `GRID_CONFIGS` in `grid-config.js` if it has unique sizing requirements
4. **Do not** modify workers—they're agnostic to grid type (only rows/cols matter)

### When Changing Mode Logic

1. Update `getGridConfig()` in `grid-config.js`
2. All workers automatically receive new config on next frame
3. **No worker code changes needed**

---

## Testing Grid Configuration

### Unit Test: Config Structure
```javascript
import { getGridConfig, isValidGridConfig } from './grid-config.js';

const config = getGridConfig('focus');
assert(isValidGridConfig(config), 'Config must be valid');
assert.equal(config.rows, 8, 'Focus mode should have 8 rows');
assert.equal(config.cols, 8, 'Focus mode should have 8 cols');
```

### Integration Test: Message Format
```javascript
// Simulate worker receiving message
const msg = {
  type: 'processingRequest',
  data: frameData,
  gridConfig: getGridConfig('flow')
};

// Worker code should work:
const cellW = frameWidth / msg.gridConfig.cols;
const cellH = frameHeight / msg.gridConfig.rows;
```

### Validation Test: Sync
```javascript
// If mode changes, all workers should receive new config automatically
engine.dispatch('setMode', { mode: 'focus' });
// Next frame:
// worker receives { gridConfig: { rows: 8, cols: 8, ... } }
```

---

## Related Files

| File | Purpose |
|------|---------|
| `grid-config.js` | ✅ **Authority**: Mode→config mapping |
| `available-grids.js` | ✅ Registered grid types |
| `linear-pitch.js` | Grid topology (1D pitch) |
| `circle-of-fifths.js` | Grid topology (harmonic) |
| `hex-tonnetz.js` | Grid topology (tonnetz) |
| `../frame-conductor.js` | 🔗 Sends gridConfig with frames |
| `../workers/*.js` | 🔗 Receive and use gridConfig |

---

## Versioning & Migration

### Current Version
- `v0.9.x`: Grid config managed centrally, workers receive via message

### Planned Changes
- `v0.10.0`: Consider making grid sizing user-configurable (dev panel)
- `v1.0.0`: API stability guarantee on grid message format

---

## Common Mistakes

### ❌ Mistake 1: Hardcoding grid dimensions in worker
```javascript
// WRONG
const rows = 4, cols = 4;  // Hardcoded forever
```

### ✅ Fix 1: Use received config
```javascript
// CORRECT
const { rows, cols } = msg.gridConfig || { rows: 4, cols: 4 };
```

### ❌ Mistake 2: Creating custom config in worker
```javascript
// WRONG
const config = { rows: mode === 'flow' ? 3 : 8, cols: ... };
```

### ✅ Fix 2: Trust main thread config
```javascript
// CORRECT
const config = msg.gridConfig;  // Already mode-aware from main thread
```

### ❌ Mistake 3: Not sending gridConfig from main thread
```javascript
// WRONG
worker.postMessage({ data: frameData, state });  // Missing gridConfig!
```

### ✅ Fix 3: Always include gridConfig
```javascript
// CORRECT
worker.postMessage({ 
  data: frameData, 
  gridConfig: getGridConfig(state.currentMode),  // ← Include always
  state 
});
```

---

## Debugging Grid Issues

### Symptom: Grid cells misaligned with actual motion
**Cause**: Worker using wrong grid dimensions
**Solution**: Log `msg.gridConfig` in worker to verify rows/cols match current mode

### Symptom: Grid changes don't apply after mode switch
**Cause**: New gridConfig not being sent with frames
**Solution**: Verify frame-conductor.js calls `getGridConfig()` with updated `state.currentMode`

### Symptom: Workers crash or produce silent failures
**Cause**: gridConfig not sent, worker using invalid fallback
**Solution**: Add console.log to verify message format, check worker error logs

---

## References

- **ADR (Architecture Decision Record)**: `docs/adr/grid-configuration-sync.md` R251125a there is no such document 
- **Related Code Smell Fix**: P2-4 (Grid Config Duplication)
- **Performance**: Grid sizing affects both visual responsiveness and audio latency
