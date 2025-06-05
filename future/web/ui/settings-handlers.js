import { settings } from '../state.js';
import { speak } from './utils.js';

/**
 * Sets up handlers for settings-related actions (e.g., FPS selection).
 * Currently minimal, as settings are handled by rectangle buttons.
 * @param {Object} options - Configuration options.
 * @param {Function} options.dispatchEvent - Event dispatcher function.
 * @param {Object} options.DOM - DOM elements object.
 */
export function setupSettingsHandlers({ dispatchEvent, DOM }) {
    console.log('setupSettingsHandlers: Starting setup');
    let settingsMode = false;

    // Ensure DOM is defined
    if (!DOM) {
        console.error('DOM is undefined in setupSettingsHandlers');
        return;
    }

    // FPS selection (optional, can be reintroduced if needed)
    const fpsSelect = document.createElement('select');
    fpsSelect.id = 'fpsSelect';
    [50, 100, 250].forEach(interval => {
        const option = document.createElement('option');
        option.value = interval;
        option.text = `${1000 / interval} FPS`;
        fpsSelect.appendChild(option);
    });
    // Not appended, as UI uses buttons; kept for future use
    fpsSelect.addEventListener('touchstart', (event) => {
        event.preventDefault();
        settings.updateInterval = parseInt(event.target.value);
        speak('fpsBtn', { fps: 1000 / settings.updateInterval });
        dispatchEvent('updateFrameInterval', { interval: settings.updateInterval });
    });

    // settingsToggle handler
    if (DOM.settingsToggle) {
        DOM.settingsToggle.addEventListener('touchstart', (event) => {
            console.log('settingsToggle touched');
            event.preventDefault();
            if (navigator.vibrate) navigator.vibrate(50);
            settingsMode = !settingsMode;
            dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream });
            dispatchEvent('toggleDebug', { show: settingsMode });
        });
        console.log('settingsToggle event listener attached');
    } else {
        console.error('settingsToggle element not found');
    }

    // modeBtn handler
    if (DOM.modeBtn) {
        DOM.modeBtn.addEventListener('touchstart', async (event) => {
            console.log('modeBtn touched');
            event.preventDefault();
            if (navigator.vibrate) navigator.vibrate(50);
            if (settingsMode) {
                settings.gridType = settings.gridType === 'circle-of-fifths' ? 'hex-tonnetz' : 'circle-of-fifths';
                await speak('modeBtn', { mode: settings.gridType });
            } else {
                settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
                await speak('modeBtn', { mode: settings.dayNightMode });
            }
            dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream });
        });
        console.log('modeBtn event listener attached');
    } else {
        console.error('modeBtn element not found');
    }

    console.log('setupSettingsHandlers: Setup complete');
}
