// A tiny, central registry for sharing UI component initializers
// to avoid polluting the global `window` object.

const componentRegistry = new Map();

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
