import { setupDebugPanelLongPress } from './debug-panel.js';

export function setupUIController({ DOM }) {
  console.log('setupUIController: Starting setup');

  // Most UI control setup has been moved to the specific UI modules
  // (debug-ui.js and accessible-ui.js). Keep shared, UI-independent
  // setups here so we have a single place for cross-cutting UI hooks.
  setupDebugPanelLongPress(DOM);

  console.log('setupUIController: Setup complete');
}