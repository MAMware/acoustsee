# Dev Panel v2: Phase 1 Telemetry Dashboard

A pluggable developer diagnostics UI implementing the AcoustSee Phase 1 telemetry system as a standalone, reusable module.

**Status:** ✅ Production Ready  
**Phase:** Phase 1 (Tasks 1-6 complete)  
**Architecture:** Hexagonal (pluggable UI pattern)  

## Purpose

Provides real-time monitoring and diagnostics for developers:

1. **Camera Controls (Workflow 1)** - Start/stop video capture, select GPU/CPU source
2. **Frame Processing (Task 3)** - Per-worker latency, dropped frames, timeouts
3. **Audio Routing (Task 4)** - Cue reception, sync delta, audio/video alignment
4. **Telemetry Dashboard (Workflow 3)** - Real-time metrics across 5 dashboards
5. **Performance Charts** - Historical visualization with circular buffer

## Activation

### URL Parameter (Recommended)
```
https://acoustsee.local/?devpanel=v2
```

### Programmatic (Advanced)
```javascript
import { getComponent } from './ui-registry.js';

const devPanelV2 = getComponent('dev-panel-v2');
const ui = devPanelV2(engine, DOM);
ui.activate();
ui.show();

// Later, when disposing:
ui.dispose();
```

## API

### Initialization

**Signature:**
```javascript
export function initializeDevPanelV2(arg1, arg2)
```

**Parameters:**

| Param | Type | Required | Note |
|-------|------|----------|------|
| `arg1` | engine\|uiContext | ✅ | Engine instance or UI context object |
| `arg2` | DOM | if arg1 is engine | DOM object (legacy signature) | //R011225-Do: lets analyze how much is this needed, might be a candidate to deprecate 

**Returns:**
```javascript
{
  show(),        // Make panel visible
  hide(),        // Hide panel
  toggle(),      // Toggle visibility
  activate(),    // Initialize Phase 1 components
  dispose()      // Clean up all resources
}
```

### Example

**Recommended (New Context Pattern):**
```javascript
import { initializeDevPanelV2 } from './dev-panel-v2/dev-panel-v2.js';
import { createUIContext } from '../ui-context.js';

const uiContext = createUIContext({
  engine,
  DOM,
  eventBus,
  settings: { /* ... */ }
});

const devPanelV2 = initializeDevPanelV2(uiContext);
devPanelV2.activate();
```

**Legacy (Direct Engine/DOM):**
```javascript
import { initializeDevPanelV2 } from './dev-panel-v2/dev-panel-v2.js';

const devPanelV2 = initializeDevPanelV2(engine, DOM);
devPanelV2.activate();
```

## Architecture

### File Structure
```
dev-panel-v2/
├── dev-panel-v2.js        # Main coordinator + contract implementation
├── dev-panel-v2.css       # Scoped styles (no leakage)
└── README.md              # This file
```

### Design Principles

✅ **Modular** - Each subsystem independently initialized and disposed  
✅ **Pluggable** - Follows `registerComponent()` pattern  
✅ **Headless-Compatible** - No imports from core/audio/video  
✅ **Responsive** - Mobile-friendly layout  
✅ **Clean** - All listeners/timers cleaned on disposal  
✅ **Scoped** - CSS scoped to `#acoustsee-dev-panel-v2`  

### Integration with Phase 1 Components

Dev Panel v2 coordinates these Phase 1 modules:

| Component | File | Purpose |
|-----------|------|---------|
| **Camera Controls** | `dev-panel/camera-controls.js` | Workflow 1: Start/stop video, source selection |
| **Telemetry Dashboard** | `dev-panel/telemetry-dashboard.js` | Workflow 3: Real-time metrics (5 dashboards) |
| **Chart Controller** | `dev-panel/dev-panel-chart-controller.js` | Historical performance visualization |

## Features

### 1. Camera Controls (Workflow 1)
- ✅ Start/Stop camera button
- ✅ GPU/CPU source selector
- ✅ Stream status indicator
- ✅ Real-time error feedback

### 2. Telemetry Dashboard (Workflow 3)
Five real-time dashboards:
- **Video:** Frame rate, dropped frames, latency, source
- **Audio:** Signal quality, buffer health, clipping, sample rate
- **Sync:** Audio-video drift (±ms), offset, calibration
- **Resources:** CPU, memory, GPU, thermal state
- **Features:** Noise reduction, SNR, extraction, standardization

Color-coded status:
- 🟢 **Green:** Optimal (within target range)
- 🟡 **Yellow:** Degraded (within acceptable)
- 🔴 **Red:** Critical (outside acceptable)

### 3. Performance Charts
- Circular buffer visualization (300 frames)
- Real-time latency trends
- Dropped frame history
- Worker performance breakdown

## Usage Patterns

### Pattern 1: Quick Activation (Recommended)
```javascript
import { getComponent } from './ui-registry.js';

// Get and activate in one go
const devPanelV2 = getComponent('dev-panel-v2');
if (devPanelV2) {
  const ui = devPanelV2(engine, DOM);
  ui.activate();
}
```

### Pattern 2: Show/Hide Toggle
```javascript
const ui = devPanelV2(engine, DOM);
ui.activate();

// Toggle on keyboard shortcut
document.addEventListener('keydown', e => {
  if (e.ctrlKey && e.key === 'd') {
    e.preventDefault();
    ui.toggle();
  }
});
```

### Pattern 3: Conditional Activation
```javascript
// Only show in debug mode
const isDev = new URLSearchParams(window.location.search).has('debug');

if (isDev) {
  const ui = devPanelV2(engine, DOM);
  ui.activate();
  ui.show();
}
```

### Pattern 4: Proper Cleanup
```javascript
const ui = devPanelV2(engine, DOM);
ui.activate();

// Later, when app shuts down
window.addEventListener('beforeunload', () => {
  ui.dispose();  // CRITICAL: Prevents memory leaks
});
```

## Architectural Compliance

### Hexagonal Architecture ✅
- ✅ **No core imports** - Uses `engine.dispatch()` and `engine.onStateChange()`
- ✅ **Headless core principle** - No DOM access from core/audio/video modules
- ✅ **Resource adapter pattern** - UI provides resources to core
- ✅ **Proper boundaries** - UI layer fully separate from business logic

### UI Contract ✅
- ✅ **Returns dispose function** - All cleanup happens automatically
- ✅ **No memory leaks** - Event listeners tracked and removed
- ✅ **Scoped styles** - CSS doesn't leak to other UIs
- ✅ **Independent activation** - Can be loaded/unloaded any time

### State Management ✅
- ✅ **Immutable reads** - Only reads from `engine.getState()`
- ✅ **Event-driven updates** - Subscribes via `engine.onStateChange()`
- ✅ **No polling** - Reactive to state changes
- ✅ **No direct mutations** - Never modifies engine state

## Performance Characteristics

| Metric | Value | Notes |
|--------|-------|-------|
| Memory Overhead | < 50KB | Circular buffers + DOM elements |
| CPU per Update | < 10ms | Batch via requestAnimationFrame |
| DOM Elements | ~80 | Scoped to panel container |
| Event Listeners | ~15 | All cleaned on disposal |
| CSS Payload | ~3KB | Minified, scoped |

## Mobile Responsiveness

Responsive breakpoints:
- **Desktop (> 900px):** Full layout, 600px width
- **Tablet (600-900px):** Adjusted spacing, single column
- **Mobile (< 600px):** Full-width panel, 60vh height, touch-friendly

## Error Handling

Dev Panel v2 includes defensive error handling:

```javascript
// Gracefully handles missing components
try {
  moduleRefs.cameraControls = initializeCameraControls(engine);
} catch (e) {
  console.error('Failed to initialize camera controls:', e);
  // Panel still functions without this component
}
```

**Failure modes handled:**
- ✅ Missing engine reference (defaults to no-op)
- ✅ Missing DOM (falls back to document.body)
- ✅ Component initialization errors (skipped, others continue)
- ✅ Resource cleanup errors (swallowed, next item proceeds)

## Testing

### Manual Testing
1. Add `?devpanel=v2` to URL
2. Should see panel in bottom-right corner
3. Click "×" to hide, refresh to show again
4. Check browser console for errors
5. Hit Ctrl+Shift+I (DevTools) and search for "zombie"

### Automated Testing
```javascript
test('Dev Panel v2 initializes and disposes', () => {
  const mockEngine = { 
    dispatch: jest.fn(), 
    getState: () => ({}),
    onStateChange: jest.fn() 
  };
  const mockDOM = { uiPanelRoot: document.createElement('div') };
  
  const ui = initializeDevPanelV2(mockEngine, mockDOM);
  expect(ui.dispose).toBeDefined();
  expect(ui.activate).toBeDefined();
  
  ui.activate();
  expect(mockDOM.uiPanelRoot.children.length).toBeGreaterThan(0);
  
  ui.dispose();
  expect(mockDOM.uiPanelRoot.children.length).toBe(0);
});
```

## Debugging

### Enable Verbose Logging
```javascript
// In dev-panel-v2.js, change:
// structuredLog('INFO', '...')
// to:
// console.log('[DEV_PANEL_V2]', '...')
```

### Check for Memory Leaks
```javascript
// In browser console
const devPanel = document.querySelector('#acoustsee-dev-panel-v2');
console.log('Event listeners:', devPanel.__listenerRegistry?.listeners?.length);
console.log('Camera controls:', devPanel.__cameraControls);
console.log('Telemetry dashboard:', devPanel.__telemetryDashboard);
```

### Test Disposal
```javascript
// In browser console, after running for a bit
ui.dispose();

// Then check:
console.log(document.querySelector('#acoustsee-dev-panel-v2'));  // Should be null
console.log(document.querySelector('[href*="dev-panel-v2.css"]'));  // Should be null or removed
```

## Related Files

### Phase 1 Infrastructure
- `dev-panel/telemetry-collector.js` - Event batching and transmission
- `dev-panel/camera-controls.js` - Workflow 1 UI
- `dev-panel/telemetry-dashboard.js` - Workflow 3 dashboard
- `dev-panel/dev-panel-chart-controller.js` - Performance visualization

### Architecture Documentation
- `docs/adr/0011-hexagonal-purity-remediation.md` - Hexagonal principles
- `docs/design/DEV_PANEL_FLOWS.md` - Workflow specifications
- `future/web/ui/README.md` - UI architecture guide

### Configuration
- `future/web/ui/ui-registry.js` - Component registration
- `future/web/ui/ui-context.js` - Standardized UI context

## Version History

| Version | Date | Changes |
|---------|------|---------|
| v2.0.0 | 2025-12-01 | Initial release (Phase 1 complete) |

## Future Enhancements (Phase 2+)

- [ ] Historical trend graphs (1h/24h/7d)
- [ ] Anomaly detection alerts
- [ ] Session export to localStorage
- [ ] Worker dependency visualization
- [ ] Audio waveform visualization
- [ ] Real-time spectrum analyzer
- [ ] Network monitoring dashboard 
- [ ] ML model status display

## Support

For issues or questions:
1. Check `docs/sessions/` for recent implementation notes
2. Review `TASKS.md` for Phase 1 status
3. Consult `docs/design/DEV_PANEL_FLOWS.md` for workflow specs
4. Check `docs/adr/` for architectural decisions

---

**Last Updated:** December 1, 2025  
**Maintainers:** AcoustSee Development Team  
**License:** See LICENSE in repository root
