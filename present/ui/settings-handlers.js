import { settings } from '../state.js';
import { speak } from './utils.js';

/**
 * Sets up handlers for settings-related actions (e.g., FPS selection).
 * Currently minimal, as settings are handled by rectangle buttons.
 * @param {Object} options - Configuration options.
 * @param {Function} options.dispatchEvent - Event dispatcher function.
 */
export function setupSettingsHandlers({ dispatchEvent }) {
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
}
