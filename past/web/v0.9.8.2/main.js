/**
 * Entry point for AcoustSee, initializing UI handlers and event dispatcher.
 */
import { setupRectangleHandlers } from './ui/rectangle-handlers.js';
import { setupSettingsHandlers } from './ui/settings-handlers.js';
import { createEventDispatcher } from './ui/event-dispatcher.js';

// Wait for DOM to load before initializing
document.addEventListener('DOMContentLoaded', () => {
    const dispatcher = createEventDispatcher();

    // Initialize handlers
    setupRectangleHandlers({ dispatchEvent: dispatcher.dispatchEvent });
    setupSettingsHandlers({ dispatchEvent: dispatcher.dispatchEvent });

    // Update button labels and video state based on settings mode
    function updateUIState({ settingsMode }) {
        const languageBtn = document.getElementById('languageBtn');
        const video = document.getElementById('videoFeed');
        languageBtn.textContent = settingsMode ? 'Select Engine' : 'Language';
        languageBtn.setAttribute('aria-label', settingsMode ? 'Select synthesis engine' : 'Cycle languages');
        if (settingsMode) {
            video.pause();
        } else {
            video.play().catch((err) => console.error('Video play failed:', err));
        }
    }

    // Handle debug panel
    function toggleDebug({ show }) {
        const debug = document.getElementById('debug');
        debug.style.display = show ? 'block' : 'none';
    }

    // Register event listeners
    dispatcher.addEventListener('updateUI', updateUIState);
    dispatcher.addEventListener('toggleDebug', toggleDebug);

    // Initial UI state
    dispatcher.dispatchEvent('updateUI', { settingsMode: false });
});