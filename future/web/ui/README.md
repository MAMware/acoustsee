# UI Subsystem

This directory contains all user interface modules. The project uses a **pluggable UI architecture**, allowing different UIs to be loaded based on the application's mode and URL parameters.

**⚠️ CRITICAL ARCHITECTURAL RULES:**
1. **UI modules MUST NOT import from `core/`.** Use the injected `engine` instance only.
2. **UI modules communicate with core ONLY via `engine.dispatch()`.** No direct function calls.
3. **UI modules react to state ONLY via `engine.onStateChange()`.** No polling the state.
4. **Each UI must be independently disposable.** Cleanup is mandatory, not optional.

---

## Key Files & Concepts

### `ui-registry.js`: Central UI Registry

This is the discovery mechanism that allows UI modules to register themselves without creating global exports.

**API:**
```javascript
// In your UI module:
import { registerComponent } from '../ui-registry.js';

export function initializeMyUI(engine, DOM) {
  // Your UI logic...
  return { dispose() { /* cleanup */ } };
}

// Register at module load time:
registerComponent('my-ui', initializeMyUI);
```

**Why?**
- Prevents accidental global pollution
- Allows dynamic loading via `?debug=true` or mode switching
- Makes UIs discoverable to boot-time handlers

---

## UI Module Contract (MANDATORY)

Every UI module **MUST** follow this exact contract:

### 1. Export Signature

```javascript
export function initialize<Name>UI(engine, DOM) {
  // ... your UI logic ...
  
  // REQUIRED: Return dispose function
  return {
    dispose() {
      // Remove ALL event listeners
      // Clear ALL intervals/timeouts
      // Stop ALL workers
      // Remove ALL created DOM elements
    }
  };
}
```

### 2. Registration

```javascript
import { registerComponent } from '../ui-registry.js';
registerComponent('name', initialize<Name>UI);
```

### 3. DOM Interaction Rules

✅ **DO:**
- Use `DOM.uiPanelRoot` as your root container (provided by `main.js`)
- Create scoped IDs: `acoustsee-myui-button`
- Use event delegation: `container.addEventListener('click', delegatedHandler)`
- Use `data-action` attributes: `<button data-action="doSomething">`
- Load CSS dynamically: `<link rel="stylesheet" href="...">`
- Measure/layout ONLY in `link.onload` callback

❌ **DON'T:**
- Access global DOM elements directly (`document.getElementById` without checking)
- Create generic IDs that might collide (`button1`, `panel`)
- Use fragile DOM access patterns (`.children[3]`)
- Perform layout calculations before CSS loads
- Forget to remove listeners in `dispose()`

### 4. Communication with Core

✅ **DO:**
```javascript
// Dispatch commands:
engine.dispatch('startProcessing', { videoEl, canvasEl });

// Listen to state:
engine.onStateChange(state => {
  if (state.isProcessing) {
    updateUI('Running...');
  }
});
```

❌ **DON'T:**
```javascript
// NO direct imports from core:
import { someFunction } from '../core/something.js'; // ❌ FORBIDDEN

// NO polling state:
setInterval(() => {
  const state = engine.getState(); // ❌ Use onStateChange instead
}, 100);

// NO direct function calls into other subsystems:
import { playCues } from '../audio/audio-processor.js'; // ❌ Use dispatch
```

---

## Current UI Modules

### `touch-gestures/` - Primary Accessible UI

**Purpose:** Non-visual interaction for blind/low-vision users

**Activation:** Default (always loaded unless `?debug=true`)

**Key Features:**
- 1 tap = Start/Stop processing
- 2 taps = Announce status
- 3 taps = Send debug report
- Settings mode (enter via long press)

**Files:**
- `touch-gestures-ui.js` - Main coordinator
- `touch-gestures-behavior.js` - Gesture detection logic
- `touch-gestures-actions.js` - Command dispatch handlers

---

### `dev-panel/` - Developer Dashboard

**Purpose:** Debugging, diagnostics, and performance monitoring

**Activation:** `?debug=true` URL parameter

**Key Features:**
- Live Logs (console mirror, exportable)
- Performance Analytics (persistent error tracking)
- State Inspector (current application state)
- Control Panel (test commands directly)
- Worker Monitor (frame processing metrics)

**Files:**
- `dev-panel.js` - Main coordinator + HTML template
- `dev-panel.behavior.js` - Layout and collapsible sections
- `dev-panel.actions.js` - Button click handlers
- `dev-panel.controls.js` - Dropdown/checkbox factories
- `worker-charts.js` - Performance visualization
- `dev-panel.css` - Scoped styles

**Special Notes:**
- Loads IndexedDB logger for persistent analytics
- Creates WebSocket connection for live monitoring (optional)
- Heavy DOM (100+ elements) - loads asynchronously

---

## UI Module Lifecycle

```
1. Page Load
   ↓
2. main.js determines which UI to load (based on URL params)
   ↓
3. Dynamic import: await import('./ui/my-ui/my-ui.js')
   ↓
4. UI module registers itself: registerComponent('my-ui', initializeFn)
   ↓
5. main.js calls: getComponent('my-ui') → initializeFn
   ↓
6. Execute: const ui = initializeFn(engine, DOM)
   ↓
7. UI is active, listening to state changes
   ↓
8. [On mode change or cleanup]
   ↓
9. Call: ui.dispose()
   ↓
10. UI removes all traces, releases all resources
```

---

## Creating a New UI Module

### Step 1: Create Directory Structure

```
future/web/ui/my-ui/
├── my-ui.js              # Main coordinator
├── my-ui.behavior.js     # Layout/visual behavior (optional)
├── my-ui.actions.js      # Event handlers (optional)
├── my-ui.css             # Scoped styles
└── README.md             # API documentation
```

### Step 2: Implement the Contract

```javascript
// my-ui.js
import { registerComponent } from '../ui-registry.js';

export function initializeMyUI(engine, DOM) {
  const panel = document.createElement('div');
  panel.id = 'acoustsee-myui-panel';
  panel.className = 'myui-panel';
  
  // Load CSS
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = new URL('./my-ui.css', import.meta.url).href;
  link.onload = () => {
    // Do layout/measurement ONLY after CSS loads
    initializeLayout();
  };
  document.head.appendChild(link);
  
  // Build UI
  panel.innerHTML = `
    <h1>My UI</h1>
    <button data-action="test">Test</button>
  `;
  
  // Event delegation
  const handleClick = (e) => {
    const action = e.target.dataset.action;
    if (action === 'test') {
      engine.dispatch('someCommand', { data: 'value' });
    }
  };
  panel.addEventListener('click', handleClick);
  
  // Listen to state
  const stateListener = (state) => {
    console.log('State changed:', state.isProcessing);
  };
  engine.onStateChange(stateListener);
  
  // Attach to DOM
  if (DOM.uiPanelRoot) {
    DOM.uiPanelRoot.appendChild(panel);
  } else {
    document.body.appendChild(panel);
  }
  
  // REQUIRED: Return dispose function
  return {
    dispose() {
      panel.removeEventListener('click', handleClick);
      engine.offStateChange(stateListener); // If API exists
      panel.remove();
      link.remove();
    }
  };
}

// Register
registerComponent('my-ui', initializeMyUI);
```

### Step 3: Document the API

Create `my-ui/README.md`:
```markdown
# My UI Module

## Purpose
What this UI does...

## Activation
How to load it (URL param, mode, etc.)

## API
`initializeMyUI(engine, DOM)` - Returns `{ dispose() }`

## Dependencies (avoid external)
- Requires X feature
- Optional Y integration
```

### Step 4: Test

- [ ] UI loads without errors
- [ ] All buttons/controls work
- [ ] State changes update UI correctly
- [ ] `dispose()` removes ALL traces
- [ ] No console errors after disposal
- [ ] CSS is scoped (doesn't leak to other UIs)
- [ ] Works with `?debug=true` parameter

---

## Dev Panel Special Patterns

The dev-panel is a special "meta" UI used exclusively for diagnostics and debugging. It has unique requirements compared to regular UIs.

### Dev Panel State Access

Unlike regular UIs, the dev-panel can access **internal diagnostic state structures**:

✅ **ALLOWED (in dev-panel only):**
```javascript
// dev-panel/dev-panel.js can access orchestration state
const diagnostics = engine.getState().orchestration;     // ✅ Allowed
const capabilities = diagnostics.capabilities;            // ✅ Allowed
const metrics = diagnostics.metrics;                      // ✅ Allowed
const activeWorker = diagnostics.activeExtractor;         // ✅ Allowed
```

❌ **NOT ALLOWED (in regular UIs):**
```javascript
// touch-gestures/touch-gestures-ui.js CANNOT do this
const diagnostics = engine.getState().orchestration;     // ❌ Regular UI shouldn't access
const metrics = diagnostics.metrics;                     // ❌ User shouldn't see internals
```

**Why?** The dev-panel is for developers only. Regular UIs should be user-focused and not depend on diagnostic details.

### Dev Panel Initialization Timing

Dev-panel is only initialized AFTER:
1. ✅ Engine created and state loaded
2. ✅ All command handlers registered
3. ✅ All subsystems initialized
4. ✅ App is "powered on" (user clicked start)

This means:
- ✅ All state exists when dev-panel loads
- ✅ All commands are available for testing
- ✅ Workers have been initialized
- ❌ BUT: Dev panel should NOT assume specific state values

**Defensive coding pattern:**

```javascript
export function initializeDeveloperPanel(engine, DOM) {
  const container = document.createElement('div');
  
  function render(state) {
    // ✅ Always check state exists before accessing
    const capabilities = state?.orchestration?.capabilities ?? {};
    const metrics = state?.orchestration?.metrics ?? { fps: 0 };
    
    container.innerHTML = `
      <div>Capabilities: ${JSON.stringify(capabilities)}</div>
      <div>FPS: ${metrics.fps}</div>
    `;
  }
  
  // Get initial state (might be empty)
  const initialState = engine.getState();
  render(initialState);
  
  // Subscribe to updates
  engine.onStateChange(state => render(state));
  
  DOM.uiPanelRoot?.appendChild(container);
  
  return {
    dispose() {
      container.remove();
    }
  };
}
```

### Adding New Sections to Dev Panel

When adding a new section (e.g., "Network Monitor", "ML Model Status"):

**Step 1:** Create corresponding state in `core/orchestration-state.js`

```javascript
// In createInitialOrchestrationState()
networkStatus: {
  connected: false,
  latency: 0,
  packetsLost: 0,
}
```

**Step 2:** Create update handler in `core/commands/diagnostics-commands.js`

```javascript
engine.registerCommandHandler('updateNetworkStatus', (payload) => {
  const state = engine.getState();
  Object.assign(state.orchestration.networkStatus, payload);
  engine.setState({ orchestration: state.orchestration });
});
```

**Step 3:** Create inspector component (follows orchestration-inspector.js pattern)

```javascript
export function initializeNetworkInspector(engine, DOM) {
  const container = document.createElement('div');
  container.className = 'dev-panel-network-inspector';
  
  function updateUI(status) {
    container.innerHTML = `
      <div class="status">
        <span>${status.connected ? '✓ Connected' : '✗ Offline'}</span>
        <span>Latency: ${status.latency}ms</span>
      </div>
    `;
  }
  
  // Render initial state
  const state = engine.getState();
  if (state?.orchestration?.networkStatus) {
    updateUI(state.orchestration.networkStatus);
  } else {
    container.innerHTML = '<p>Network status initializing...</p>';
  }
  
  // Subscribe to updates
  engine.onStateChange(state => {
    if (state?.orchestration?.networkStatus) {
      updateUI(state.orchestration.networkStatus);
    }
  });
  
  DOM.uiPanelRoot?.appendChild(container);
  
  return {
    dispose() {
      container.remove();
    }
  };
}
```

**Step 4:** Register in dev-panel.js

```javascript
// In dev-panel.js init
const networkInspector = initializeNetworkInspector(engine, DOM);
panel.__networkInspector = networkInspector;
```

**Step 5:** Add cleanup to dev-panel disposal

```javascript
export function initializeDeveloperPanel(engine, DOM) {
  // ... existing code ...
  
  return {
    dispose() {
      // Cleanup all sub-inspectors
      if (panel.__orchestrationInspector?.dispose) {
        panel.__orchestrationInspector.dispose();
      }
      if (panel.__networkInspector?.dispose) {
        panel.__networkInspector.dispose();
      }
      // ... etc for all inspectors ...
      
      container.remove();
    }
  };
}
```

### Orchestration Inspector Pattern

The orchestration-inspector is an excellent model for diagnostic UIs:

**Pattern 1: Subscribe and Update**
```javascript
engine.onStateChange(state => {
  // Re-render UI with new state
  updateUI(state.orchestration);
});
```

**Pattern 2: Handle Initial State**
```javascript
// Render immediately with current state
const state = engine.getState();
if (state && state.orchestration) {
  updateUI(state.orchestration);
} else {
  showLoadingMessage();  // State not yet populated
}
```

**Pattern 3: Show Meaningful Fallbacks**
```javascript
function updateUI(orchestration) {
  if (!orchestration?.capabilities) {
    container.innerHTML = '<p>Capabilities not yet detected...</p>';
    return;
  }
  
  // Render full UI
  buildCapabilitiesGrid(orchestration.capabilities);
}
```

**Pattern 4: Keyboard Accessibility for Dev Panel**
```javascript
// Keyboard shortcuts for developers
document.addEventListener('keydown', e => {
  if (!isDevPanelOpen) return;
  
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'r') {
      e.preventDefault();
      refreshMetrics();  // Ctrl+R: Refresh
    }
    if (e.key === 'e') {
      e.preventDefault();
      exportMetrics();   // Ctrl+E: Export
    }
    if (e.key === 'm') {
      e.preventDefault();
      toggleMinimize();  // Ctrl+M: Minimize
    }
  }
});
```

### Dev Panel Testing

Special considerations when testing the dev-panel:

```javascript
// ✅ DO check that dev-panel respects state immutability
const state1 = engine.getState();
// ... dev-panel renders ...
const state2 = engine.getState();
assert(state1 === state2);  // Same object reference

// ✅ DO verify disposal removes all traces
const beforeDispose = DOM.uiPanelRoot.children.length;
devPanel.dispose();
const afterDispose = DOM.uiPanelRoot.children.length;
assert(afterDispose < beforeDispose);

// ✅ DO test with incomplete state
const partialState = { orchestration: {} };  // No capabilities yet
engine.setState(partialState);
// Dev-panel should show "initializing..." not crash

// ❌ DON'T assume specific state values at init time
// Dev-panel should gracefully handle missing data
```

---

## Common Anti-Patterns to Avoid

### ❌ The Global Polluter
```javascript
// DON'T create globals
window.myUiState = {};
window.updateMyUI = () => {};
```

### ❌ The Direct Importer
```javascript
// DON'T import core modules
import { startProcessing } from '../core/commands/media-commands.js';
startProcessing(); // Breaks encapsulation!
```

### ❌ The Fragile Selector
```javascript
// DON'T use index-based access
const button = container.children[3].children[0]; // Breaks easily!

// DO use semantic selectors
const button = container.querySelector('[data-action="submit"]');
```

### ❌ The Memory Leaker
```javascript
// DON'T forget cleanup
export function initializeMyUI(engine, DOM) {
  setInterval(() => { /* ... */ }, 1000);
  // ❌ No dispose() function - interval runs forever!
}
```

### ❌ The State Poller
```javascript
// DON'T poll state
setInterval(() => {
  const state = engine.getState();
  if (state.isProcessing) { /* ... */ }
}, 100);

// DO react to changes
engine.onStateChange(state => {
  if (state.isProcessing) { /* ... */ }
});
```

---

## Testing Your UI

### Unit Tests (Optional but Recommended)
```javascript
import { initializeMyUI } from './my-ui.js';

test('UI initializes without errors', () => {
  const mockEngine = { dispatch: jest.fn(), onStateChange: jest.fn() };
  const mockDOM = { uiPanelRoot: document.createElement('div') };
  
  const ui = initializeMyUI(mockEngine, mockDOM);
  expect(ui.dispose).toBeDefined();
  
  ui.dispose();
});
```

### Integration Tests (Playwright/Puppeteer)
```javascript
test('UI responds to commands', async ({ page }) => {
  await page.goto('http://localhost:8000/?debug=true');
  
  const button = await page.locator('[data-action="test"]');
  await button.click();
  
  // Verify command was dispatched
  const logs = await page.evaluate(() => window.commandLog);
  expect(logs).toContain('someCommand');
});
```

---

## File Checklist

When working in this directory:
- [ ] Did you import from `core/`? **Stop. Use `engine.dispatch()` instead.**
- [ ] Did you create a global? **Stop. Keep state within your module.**
- [ ] Did you add event listeners? **Ensure they're removed in `dispose()`.**
- [ ] Did you start timers/intervals? **Ensure they're cleared in `dispose()`.**
- [ ] Did you create workers? **Ensure they're terminated in `dispose()`.**
- [ ] Did you test `dispose()` twice? **It should not throw errors.**
- [ ] Did you use generic IDs? **Prefix with `acoustsee-myui-`.**
- [ ] Did you load CSS? **Do layout ONLY in `link.onload`.**

---

**Last Updated:** 7 October 2025 - Pluggable UI architecture finalized
