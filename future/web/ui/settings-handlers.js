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

  if (!DOM) {
    console.error('DOM is undefined in setupSettingsHandlers');
    return;
  }

  function tryVibrate(event) {
    if (event.cancelable && navigator.vibrate) {
      try {
        navigator.vibrate(50); // Line 43: Handle vibration safely
      } catch (err) {
        console.warn('Vibration blocked:', err.message);
      }
    }
  }

  if (DOM.settingsToggle) {
    DOM.settingsToggle.addEventListener('touchstart', async (event) => {
      if (event.cancelable) event.preventDefault();
      console.log('settingsToggle touched');
      tryVibrate(event);
      try {
        settings.isSettingsMode = !settings.isSettingsMode;
        dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream });
        dispatchEvent('toggleDebug', { show: settings.isSettingsMode });
      } catch (err) {
        console.error('settingsToggle error:', err.message);
        dispatchEvent('logError', { message: `settingsToggle error: ${err.message}` });
        await speak('settingsError');
      }
    });
    console.log('settingsToggle event listener attached');
  } else {
    console.error('settingsToggle element not found');
  }

  if (DOM.modeBtn) {
    DOM.modeBtn.addEventListener('touchstart', async (event) => {
      if (event.cancelable) event.preventDefault();
      console.log('modeBtn touched');
      tryVibrate(event);
      try {
        if (settings.isSettingsMode) {
          settings.gridType = settings.gridType === 'circle-of-fifths' ? 'hex-tonnetz' : 'circle-of-fifths';
        } else {
          settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
          document.body.className = settings.dayNightMode;
        }
        dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream });
      } catch (err) {
        console.error('modeBtn error:', err.message);
        dispatchEvent('logError', { message: `modeBtn error: ${err.message}` });
        await speak('modeError');
      }
    });
    console.log('modeBtn event listener attached');
  } else {
    console.error('modeBtn element not found');
  }
  if (DOM.fpsBtn) {
    DOM.fpsBtn.addEventListener('touchstart', async (event) => {
      if (event.cancelable) event.preventDefault();
      console.log('fpsBtn touched');
      tryVibrate(event);
      try {
        if (settings.autoFPS) {
          settings.autoFPS = false;
          settings.updateInterval = 1000 / 20; // Default to 20 FPS
        } else {
          const fpsOptions = [20, 30, 60];
          const currentFps = 1000 / settings.updateInterval;
          const currentIndex = fpsOptions.indexOf(currentFps);
          if (currentIndex === fpsOptions.length - 1) {
            settings.autoFPS = true; // Switch to Auto
          } else {
            const nextFps = fpsOptions[currentIndex + 1];
            settings.updateInterval = 1000 / nextFps;
          }
        }
        dispatchEvent('updateFrameInterval', { interval: settings.updateInterval });
        await speak('fpsBtn', { fps: settings.autoFPS ? 'auto' : Math.round(1000 / settings.updateInterval) });
      } catch (err) {
        console.error('fpsBtn error:', err.message);
        dispatchEvent('logError', { message: `fpsBtn error: ${err.message}` });
        await speak('fpsError');
      }
    });
    console.log('fpsBtn event listener attached');
  } else {
    console.error('fpsBtn element not found');
  }
    console.log('setupSettingsHandlers: Setup complete');
}
