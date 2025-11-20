// ui-manifest.js
// Central manifest of pluggable UI modules. This avoids hardcoding logic
// in main.js and supports dynamic selection via splash screen or URL param.
// All listed UIs MUST self-register with ui-registry.js under their `id`.

export const AVAILABLE_UIS = [
  {
    id: 'dev-panel',
    label: 'Developer Panel',
    module: './ui/dev-panel/dev-panel.js',
    description: 'Advanced diagnostics and development tooling'
  },
  {
    id: 'touch-gestures',
    label: 'Touch / Gestures UI',
    module: './ui/touch-gestures/touch-gestures-ui.js',
    description: 'Accessible interaction layer with gesture & tap controls'
  }
];

/**
 * Resolve a UI manifest entry by id.
 */
export function getUIEntry(id) {
  return AVAILABLE_UIS.find(u => u.id === id) || null;
}

/**
 * Dynamically import the module for the requested UI id.
 * Returns the registered initializer from ui-registry if available.
 */
export async function loadUIById(id) {
  const entry = getUIEntry(id);
  if (!entry) throw new Error(`UI '${id}' not found in manifest`);
  await import(entry.module);
  return entry;
}
