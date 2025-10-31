// A tiny, central registry for sharing UI component initializers
// to avoid polluting the global `window` object.

const componentRegistry = new Map();

/**
 * Register a UI component initializer with the central UI registry.
 * 
 * **PLUG-AND-PLAY CONTRACT (v0.10.0+):**
 * 
 * All UI initializers MUST accept a standardized `uiContext` object as their
 * first parameter. This context is created by `createUIContext()` from 
 * `ui/ui-context.js` and provides:
 * 
 * - `engine`: Engine instance (dispatch, getState, onStateChange)
 * - `DOM`: Pre-cached DOM elements
 * - `eventBus`: Unified EventBus for logs/commands
 * - `generateTraceId`: Function to generate traceIds for user actions
 * - `structuredLog`: Logging utility
 * - `settings`: Application settings (convenience accessor)
 * - `dispatch`, `getState`, `onStateChange`: Convenience wrappers
 * 
 * **Required signature:**
 * ```javascript
 * function initMyUI(uiContext) {
 *   const { engine, DOM, eventBus, generateTraceId } = uiContext;
 *   // ... initialization code ...
 *   return function dispose() {
 *     // ... cleanup code ...
 *   };
 * }
 * ```
 * 
 * **Return value:**
 * Initializers SHOULD return a `dispose()` function for cleanup (removing
 * event listeners, clearing intervals, terminating workers).
 * 
 * **Error modes:**
 * If `initializer` is not a function, the call is ignored and a warning is logged.
 * 
 * @param {string} name - Unique component identifier (e.g., 'dev-panel', 'accessible-ui')
 * @param {function(uiContext): function|void} initializer - Component initializer function
 */
export function registerComponent(name, initializer) {
  if (typeof initializer !== 'function') {
    console.warn(`ui-registry: Attempted to register non-function for "${name}".`);
    return;
  }
  componentRegistry.set(name, initializer);
}

export function getComponent(name) {
  return componentRegistry.get(name) || null;
}

export function hasComponent(name) {
  return componentRegistry.has(name);
}
