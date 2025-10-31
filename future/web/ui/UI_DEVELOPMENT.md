# UI Development Guide

**Quick Start for Plug-and-Play UI Development (v0.10.0+)**

This guide shows how to create new UI modules that automatically integrate with AcoustSee's EventBus and tracing infrastructure.

---

## Table of Contents

1. [Minimal UI Template](#minimal-ui-template)
2. [UI Context Contract](#ui-context-contract)
3. [Automatic TraceId Generation](#automatic-traceid-generation)
4. [EventBus Integration](#eventbus-integration)
5. [Registration & Loading](#registration--loading)
6. [Complete Example](#complete-example)
7. [Testing Your UI](#testing-your-ui)

---

## Minimal UI Template

Copy this template to create a new UI module:

```javascript
// future/web/ui/my-custom-ui/my-custom-ui.js

/**
 * Initialize your custom UI module.
 * 
 * @param {object} uiContext - Standardized UI context
 * @returns {function} dispose - Cleanup function
 */
export function initializeMyCustomUI(uiContext) {
  const { engine, DOM, eventBus, generateTraceId, structuredLog } = uiContext;
  
  structuredLog('INFO', 'my-custom-ui', 'Initializing custom UI');
  
  // Example: Add click handler with automatic tracing
  const button = DOM.myButton;
  if (button) {
    button.addEventListener('click', handleClick);
  }
  
  function handleClick() {
    const traceId = generateTraceId();
    structuredLog('INFO', 'my-custom-ui', 'Button clicked', { traceId });
    engine.dispatch('myCommand', { data: 'value' }, { traceId });
  }
  
  // Return cleanup function
  return function dispose() {
    if (button) {
      button.removeEventListener('click', handleClick);
    }
    structuredLog('INFO', 'my-custom-ui', 'Disposed custom UI');
  };
}
```

---

## UI Context Contract

All UI modules receive a **standardized context object** with these properties:

| Property | Type | Description |
|----------|------|-------------|
| `engine` | object | Engine instance (`dispatch`, `getState`, `onStateChange`) |
| `DOM` | object | Pre-cached DOM elements from `boot.js` |
| `eventBus` | object | Unified EventBus for logs/commands (`logEvent`, `getEvents`) |
| `generateTraceId` | function | Generate traceIds for user actions |
| `structuredLog` | function | Logging utility (already integrated with EventBus) |
| `settings` | object | Application state (convenience accessor, same as `engine.getState()`) |
| `dispatch` | function | Convenience wrapper for `engine.dispatch(cmd, payload, options)` |
| `getState` | function | Convenience wrapper for `engine.getState()` |
| `onStateChange` | function | Convenience wrapper for `engine.onStateChange(listener)` |
| `basePath` | string | (optional) Base path for dynamic imports |
| `importMetaUrl` | string | (optional) `import.meta.url` for relative paths |

**Example usage:**

```javascript
export function initializeMyUI(uiContext) {
  const {
    engine,      // Required
    DOM,         // Required
    eventBus,    // Required
    generateTraceId,
    structuredLog
  } = uiContext;
  
  // Use directly or via convenience wrappers:
  uiContext.dispatch('myCommand', { foo: 'bar' });
  // Equivalent to:
  engine.dispatch('myCommand', { foo: 'bar' });
}
```

---

## Automatic TraceId Generation

**Why tracing?** TraceIds let you correlate user actions with downstream commands and errors, making debugging much easier.

### Basic Pattern

```javascript
import { withUserActionTrace } from '../ui-trace-helper.js';

export function initializeMyUI(uiContext) {
  const { engine, DOM } = uiContext;
  
  DOM.startButton.addEventListener('click', 
    withUserActionTrace('startCamera', (traceId) => {
      engine.dispatch('startCamera', null, { traceId });
    })
  );
}
```

**What this does:**
1. Generates a unique traceId when the button is clicked
2. Logs the action with the traceId
3. Passes the traceId to your handler
4. Automatically logs errors if the handler throws

### Batch Actions

When a single user action triggers multiple commands:

```javascript
import { createTraceBatch } from '../ui-trace-helper.js';

function handleComplexAction(uiContext) {
  const { engine } = uiContext;
  const batch = createTraceBatch('init-workflow');
  
  engine.dispatch('startCamera', null, { traceId: batch.child('camera') });
  engine.dispatch('initAudio', null, { traceId: batch.child('audio') });
  engine.dispatch('loadPreferences', null, { traceId: batch.child('prefs') });
}
```

This creates a parent trace with three child traces:
- `1730368747051-a4f3-001-1` (camera)
- `1730368747051-a4f3-001-2` (audio)
- `1730368747051-a4f3-001-3` (prefs)

You can query all related events in dev-panel using the parent traceId.

---

## EventBus Integration

The EventBus is already wired into your UI via `uiContext.eventBus`. You can:

### Query Events

```javascript
export function initializeMyUI(uiContext) {
  const { eventBus } = uiContext;
  
  // Get recent errors
  const errors = eventBus.getEvents({
    level: 'ERROR',
    limit: 10
  });
  
  // Get events for a specific trace
  const traceEvents = eventBus.getEvents({
    traceId: '1730368747051-a4f3-001'
  });
  
  // Get all children of a parent trace
  const batchEvents = eventBus.getEvents({
    parentTrace: '1730368747051-a4f3-001'
  });
}
```

### Subscribe to New Events

```javascript
export function initializeMyUI(uiContext) {
  const { eventBus } = uiContext;
  
  // Custom event display
  function handleNewEvent(event) {
    if (event.level === 'ERROR') {
      showErrorToast(event.message);
    }
  }
  
  eventBus.subscribe(handleNewEvent);
  
  return function dispose() {
    eventBus.unsubscribe(handleNewEvent);
  };
}
```

---

## Registration & Loading

### Step 1: Register Your UI

In your UI module file, register it with the UI registry:

```javascript
// future/web/ui/my-custom-ui/my-custom-ui.js
import { registerComponent } from '../ui-registry.js';

export function initializeMyCustomUI(uiContext) {
  // ... your UI code ...
}

// Auto-register when loaded
registerComponent('my-custom-ui', initializeMyCustomUI);
```

### Step 2: Load Your UI in main.js

Add your UI to the loading logic in `future/web/main.js`:

```javascript
// In main.js, after creating uiContext:

const uiContext = createUIContext({ engine, DOM, eventBus, settings, basePath, importMetaUrl: import.meta.url });

// Load your custom UI
const customUIEnabled = urlParams.get('customUI') === 'true';
if (customUIEnabled) {
  try {
    await import('./ui/my-custom-ui/my-custom-ui.js');
    const customUIInitializer = getComponent('my-custom-ui');
    if (typeof customUIInitializer === 'function') {
      customUIInitializer(uiContext);
      structuredLog('INFO', 'Custom UI initialized.');
    }
  } catch (e) {
    structuredLog('WARN', 'Failed to load custom UI', { error: e?.message });
  }
}
```

### Step 3: Test

Open your app with `?customUI=true`:

```
http://localhost:8000/?customUI=true&debug=true
```

---

## Complete Example

Here's a complete "grid selector" UI that shows all the patterns:

```javascript
// future/web/ui/grid-selector/grid-selector-ui.js
import { registerComponent } from '../ui-registry.js';
import { withUserActionTrace } from '../ui-trace-helper.js';

/**
 * Initialize grid selector UI.
 * Provides buttons to switch between hex, square, and triangular grids.
 */
export function initializeGridSelectorUI(uiContext) {
  const { engine, DOM, eventBus, structuredLog, generateTraceId } = uiContext;
  
  structuredLog('INFO', 'grid-selector-ui', 'Initializing grid selector');
  
  // Create UI elements
  const container = document.createElement('div');
  container.id = 'grid-selector';
  container.innerHTML = `
    <button id="grid-hex">Hex Grid</button>
    <button id="grid-square">Square Grid</button>
    <button id="grid-triangle">Triangle Grid</button>
  `;
  document.body.appendChild(container);
  
  // Add event listeners with automatic tracing
  const hexBtn = container.querySelector('#grid-hex');
  const squareBtn = container.querySelector('#grid-square');
  const triangleBtn = container.querySelector('#grid-triangle');
  
  hexBtn.addEventListener('click',
    withUserActionTrace('changeGrid-hex', (traceId) => {
      engine.dispatch('updateOrchestration', { gridType: 'hex' }, { traceId });
      structuredLog('INFO', 'grid-selector-ui', 'Switched to hex grid', { traceId });
    })
  );
  
  squareBtn.addEventListener('click',
    withUserActionTrace('changeGrid-square', (traceId) => {
      engine.dispatch('updateOrchestration', { gridType: 'square' }, { traceId });
      structuredLog('INFO', 'grid-selector-ui', 'Switched to square grid', { traceId });
    })
  );
  
  triangleBtn.addEventListener('click',
    withUserActionTrace('changeGrid-triangle', (traceId) => {
      engine.dispatch('updateOrchestration', { gridType: 'triangle' }, { traceId });
      structuredLog('INFO', 'grid-selector-ui', 'Switched to triangle grid', { traceId });
    })
  );
  
  // Query EventBus to highlight active grid
  function updateActiveButton() {
    const state = engine.getState();
    const currentGrid = state.orchestration?.gridType || 'hex';
    
    [hexBtn, squareBtn, triangleBtn].forEach(btn => btn.classList.remove('active'));
    if (currentGrid === 'hex') hexBtn.classList.add('active');
    if (currentGrid === 'square') squareBtn.classList.add('active');
    if (currentGrid === 'triangle') triangleBtn.classList.add('active');
  }
  
  // Subscribe to state changes
  const unsubscribe = engine.onStateChange(updateActiveButton);
  updateActiveButton(); // Initial state
  
  // Return disposal function (required!)
  return function dispose() {
    unsubscribe();
    container.remove();
    structuredLog('INFO', 'grid-selector-ui', 'Disposed grid selector UI');
  };
}

// Auto-register
registerComponent('grid-selector', initializeGridSelectorUI);
```

**Load it in main.js:**

```javascript
// In main.js
const showGridSelector = urlParams.get('gridSelector') === 'true';
if (showGridSelector) {
  await import('./ui/grid-selector/grid-selector-ui.js');
  const gridSelectorInit = getComponent('grid-selector');
  if (gridSelectorInit) gridSelectorInit(uiContext);
}
```

**Test:**

```
http://localhost:8000/?gridSelector=true&debug=true
```

---

## Testing Your UI

### 1. Smoke Test

```bash
cd future/web
python3 -m http.server 8000
```

Open: `http://localhost:8000/?debug=true&myUI=true`

### 2. Check EventBus Integration

Open dev-panel (`?debug=true`), then in console:

```javascript
// Check if your UI logged events
window.eventBus.getEvents({ category: 'my-ui' });

// Check trace correlation
window.eventBus.getEvents({ traceId: '<your-traceId>' });
```

### 3. Test Disposal

```javascript
// In console:
window.disposeUI && window.disposeUI(); // If you exported it
```

Verify no memory leaks (event listeners removed, intervals cleared).

### 4. Test Error Handling

```javascript
// Trigger an error in your UI handler
// Check that it appears in EventBus with correct traceId
window.eventBus.getEvents({ level: 'ERROR', limit: 5 });
```

---

## Best Practices

✅ **DO:**
- Always receive `uiContext` as your first parameter
- Return a `dispose()` function for cleanup
- Use `withUserActionTrace()` for click/gesture handlers
- Use `createTraceBatch()` for multi-command workflows
- Query EventBus for debugging/diagnostics
- Register your UI with `registerComponent()`

❌ **DON'T:**
- Import from `core/` (use `uiContext.engine` instead)
- Put non-JSON-serializable objects in state (e.g., MediaStream, functions)
- Forget to clean up event listeners in `dispose()`
- Generate traceIds manually (use `generateTraceId()` or helpers)
- Log high-frequency events without sampling (use `Math.random() < 0.01`)

---

## Troubleshooting

**Q: My UI doesn't receive `eventBus`**
- Make sure you're using the new signature: `function(uiContext)`
- Check that `main.js` is calling `createUIContext()` and passing it to your UI

**Q: TraceIds aren't showing up in EventBus**
- Verify you're passing `{ traceId }` to `engine.dispatch()`
- Check dev-panel → EventBus tab for your events

**Q: Memory leak warnings**
- Make sure your `dispose()` function removes all event listeners
- Clear any intervals/timeouts in `dispose()`
- Terminate workers in `dispose()`

**Q: Events aren't appearing in dev-panel**
- Check `state.eventCategories` — your category might be disabled
- Verify you're using `structuredLog()` instead of `console.log()`

---

## Next Steps

- Read `future/web/ui/README.md` for disposal patterns
- Read `future/web/core/README.md` for state rules
- Read `docs/ARCHITECTURE_RULES.md` for anti-patterns
- Check existing UIs: `dev-panel/`, `touch-gestures/`

**Happy UI development! 🎨**
