// A tiny, central registry for sharing UI component initializers
// to avoid polluting the global `window` object.

const componentRegistry = new Map();

/**
 * Register a UI component initializer with the central UI registry.
 * Components registered here should be idempotent initializers that accept an
 * options/context object and return an object with a `dispose()` method when
 * applicable.
 *
 * Contract:
 * - name: unique string key for the component.
 * - initializer: function(ctx?: Object) => { init(), dispose?(): void }
 *
 * Error modes: if `initializer` is not a function the call is ignored and a
 * warning is logged.
 *
 * @param {string} name - Unique component identifier.
 * @param {Function} initializer - Component initializer function.
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
