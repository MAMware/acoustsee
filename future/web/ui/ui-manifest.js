// ui-manifest.js
// Central manifest of pluggable UI modules. This avoids hardcoding logic
// in main.js and supports dynamic selection via splash screen or URL param.
// All listed UIs MUST self-register with ui-registry.js under their `id`.

export const AVAILABLE_UIS = [
  {
    id: 'dev-panel',
    label: 'Developer Panel',
    module: './dev-panel/dev-panel.js', // corrected path (was ./ui/dev-panel/...)
    description: 'Advanced diagnostics and development tooling'
  },
  {
    id: 'dev-panel-v2',
    label: 'Developer Panel v2',
    module: './dev-panel-v2/dev-panel-v2.js',
    description: 'Phase 1 Telemetry Dashboard (modular UI architecture)'
  },
  {
    id: 'touch-gestures',
    label: 'Touch / Gestures UI',
    module: './touch-gestures/touch-gestures-ui.js', // corrected path (was ./ui/touch-gestures/...)
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
