/**
 * Entry point for AcoustSee, initializing UI handlers and event dispatcher.
 */
import { setupRectangleHandlers } from './ui/rectangle-handlers.js';
import { setupSettingsHandlers } from './ui/settings-handlers.js';
import { createEventDispatcher, dispatchEvent as dispatcher } from './ui/event-dispatcher.js';
import { initDOM } from './ui/dom.js';

document.addEventListener('DOMContentLoaded', async () => {
  console.log('DOM loaded, initializing AcoustSee');
  await initDOM();
  const dispatcher = createEventDispatcher();
  window.dispatchEvent = dispatcher.dispatchEvent; // For mailto: feature
  console.log('Dispatcher created:', dispatcher);
  setupRectangleHandlers({ dispatchEvent: dispatcher.dispatchEvent });
  setupSettingsHandlers({ dispatchEvent: dispatcher.dispatchEvent });
  dispatcher.dispatchEvent('updateUI', { settingsMode: false, streamActive: false });
});
