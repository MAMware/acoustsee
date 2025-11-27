import { getComponent } from './ui-registry.js';
import { getUIEntry, loadUIById } from './ui-manifest.js';
import { structuredLog } from '../utils/logging.js';

let activeUIId = null;
let activeUIDispose = null;
let _inProgress = false;

export async function activateUI(id, uiContext) {
  try {
    // Prevent concurrent activations
    if (_inProgress) {
      structuredLog('WARN', 'activateUI: activation already in progress', { requested: id });
      return;
    }
    _inProgress = true;

    // Dispose currently active UI BEFORE loading the next one to avoid
    // overlapping listeners or DOM collisions.
    if (activeUIDispose) {
      try {
        activeUIDispose();
      } catch (e) {
        structuredLog('WARN', 'Previous UI dispose failed', { error: e?.message });
      }
      activeUIDispose = null;
      activeUIId = null;
    }

    // Clear any leftover UI DOM so new UI starts with a clean root
    try {
      if (uiContext && uiContext.DOM && uiContext.DOM.uiPanelRoot) {
        uiContext.DOM.uiPanelRoot.innerHTML = '';
      }
    } catch (e) { /* best-effort */ }

    const entry = getUIEntry(id);
    if (!entry) {
      structuredLog('WARN', 'activateUI: Unknown UI id', { id });
      _inProgress = false;
      return;
    }
    await loadUIById(id); // dynamic import triggers registration
    const initializer = getComponent(id);
    if (typeof initializer === 'function') {
      activeUIId = id;
      const disposeFn = initializer(uiContext);
      if (typeof disposeFn === 'function') activeUIDispose = disposeFn; else activeUIDispose = null;
      structuredLog('INFO', 'UI activated', { id });
      // Body mode class for styling isolation
      document.body.classList.remove('dev-panel-mode', 'accessible-mode');
      if (id === 'dev-panel') document.body.classList.add('dev-panel-mode');
      if (id === 'touch-gestures') document.body.classList.add('accessible-mode');
    } else {
      structuredLog('ERROR', 'UI module did not register initializer', { id });
    }
    _inProgress = false;
  } catch (e) {
    structuredLog('ERROR', 'Failed to activate UI', { id, error: e?.message || String(e) });
    _inProgress = false;
  }
}

export function getActiveUI() {
  return activeUIId;
}

export function disposeActiveUI() {
  if (activeUIDispose) {
    try {
      activeUIDispose();
    } catch (e) {
      structuredLog('WARN', 'disposeActiveUI failed', { error: e?.message });
    }
    activeUIDispose = null;
    activeUIId = null;
  }
}
