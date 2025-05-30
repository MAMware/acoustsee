/**
 * Entry point for AcoustSee, initializing UI handlers and event dispatcher.
 */
import { setupRectangleHandlers } from './ui/rectangle-handlers.js';
import { setupSettingsHandlers } from './ui/settings-handlers.js';
import { createEventDispatcher } from './ui/event-dispatcher.js';

// Wait for DOM to load before initializing
document.addEventListener('DOMContentLoaded', () => {
    const dispatcher = createEventDispatcher();
    setupRectangleHandlers({ dispatchEvent: dispatcher.dispatchEvent });
    setupSettingsHandlers({ dispatchEvent: dispatcher.dispatchEvent });
    dispatcher.dispatchEvent('updateUI', { settingsMode: false });
});
