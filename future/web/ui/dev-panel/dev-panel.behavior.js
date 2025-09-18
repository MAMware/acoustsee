// Compatibility shim (deprecated).
// This module used to implement layout and behavior for the dev panel.
// It now delegates to `dev-panel-layout.js` and re-exports the old API for
// backward compatibility.

import { applyLayoutAndBehaviors } from './dev-panel-layout.js';

export function initializeDevPanelBehavior(args) {
  console.warn('initializeDevPanelBehavior is deprecated; use applyLayoutAndBehaviors from dev-panel-layout.js');
  return applyLayoutAndBehaviors(args);
}
