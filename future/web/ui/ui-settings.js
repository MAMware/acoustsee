import { settings } from '../state.js';
import { getText } from './utils.js';
import { getDispatchEvent } from '../context.js';

export function setupUISettings({ dispatchEvent, DOM }) {
  if (!DOM || !DOM.button1 || !DOM.button2 || !DOM.button3 || !DOM.button4 || !DOM.button5 || !DOM.button6) {
    console.error('Missing DOM elements in ui-settings');
    dispatchEvent('logError', { message: 'Missing DOM elements in ui-settings' });
    return;
  }

  function tryVibrate(event) {
    if (event.cancelable && navigator.vibrate) {
      try {
        navigator.vibrate(50);
      } catch (err) {
        console.warn('Vibration blocked:', err.message);
      }
    }
  }

  // Button 1: Stream Toggle (Main Mode), Grid Toggle (Settings Mode)
  DOM.button1.addEventListener('touchstart', async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log('button1 touched', { settingsMode: settings.isSettingsMode });
    tryVibrate(event);
    try {
      dispatchEvent('startStop', { settingsMode: settings.isSettingsMode });
    } catch (err) {
      console.error('button1 error:', err.message);
      dispatchEvent('logError', { message: `button1 error: ${err.message}` });
      await getText('button1.tts.startStop', { state: 'error' });
    }
  });
  DOM.button1.addEventListener('click', async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log('button1 clicked', { settingsMode: settings.isSettingsMode });
    tryVibrate(event);
    try {
      dispatchEvent('startStop', { settingsMode: settings.isSettingsMode });
    } catch (err) {
      console.error('button1 error:', err.message);
      dispatchEvent('logError', { message: `button1 error: ${err.message}` });
      await getText('button1.tts.startStop', { state: 'error' });
    }
  });

  // Button 2: Mic Toggle (Main Mode), Synthesis Toggle (Settings Mode)
  DOM.button2.addEventListener('touchstart', async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log('button2 touched', { settingsMode: settings.isSettingsMode });
    tryVibrate(event);
    try {
      dispatchEvent('toggleAudio', { settingsMode: settings.isSettingsMode });
    } catch (err) {
      console.error('button2 error:', err.message);
      dispatchEvent('logError', { message: `button2 error: ${err.message}` });
      await getText('button2.tts.micError');
    }
  });
  DOM.button2.addEventListener('click', async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log('button2 clicked', { settingsMode: settings.isSettingsMode });
    tryVibrate(event);
    try {
      dispatchEvent('toggleAudio', { settingsMode: settings.isSettingsMode });
    } catch (err) {
      console.error('button2 error:', err.message);
      dispatchEvent('logError', { message: `button2 error: ${err.message}` });
      await getText('button2.tts.micError');
    }
  });

  // Button 3: Language Toggle (Main Mode), No-op (Settings Mode)
  DOM.button3.addEventListener('touchstart', async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log('button3 touched', { settingsMode: settings.isSettingsMode });
    tryVibrate(event);
    try {
      if (!settings.isSettingsMode) {
        dispatchEvent('toggleInput');
      }
      dispatchEvent('updateUI', {
        settingsMode: settings.isSettingsMode,
        streamActive: !!settings.stream,
        micActive: !!settings.micStream,
      });
    } catch (err) {
      console.error('button3 error:', err.message);
      dispatchEvent('logError', { message: `button3 error: ${err.message}` });
      await getText('button3.tts.fpsError');
    }
  });
  DOM.button3.addEventListener('click', async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log('button3 clicked', { settingsMode: settings.isSettingsMode });
    tryVibrate(event);
    try {
      if (!settings.isSettingsMode) {
        dispatchEvent('toggleInput');
      }
      dispatchEvent('updateUI', {
        settingsMode: settings.isSettingsMode,
        streamActive: !!settings.stream,
        micActive: !!settings.micStream,
      });
    } catch (err) {
      console.error('button3 error:', err.message);
      dispatchEvent('logError', { message: `button3 error: ${err.message}` });
      await getText('button3.tts.fpsError');
    }
  });

  // Button 4: FPS Toggle (Main Mode), Save Settings (Settings Mode)
  DOM.button4.addEventListener('touchstart', async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log('button4 touched', { settingsMode: settings.isSettingsMode });
    tryVibrate(event);
    try {
      if (settings.isSettingsMode) {
        dispatchEvent('saveSettings', { settingsMode: true });
      } else {
        if (settings.autoFPS) {
          settings.autoFPS = false;
          settings.updateInterval = 1000 / 20;
        } else {
          const fpsOptions = [20, 30, 60];
          const currentFps = 1000 / settings.updateInterval;
          const currentIndex = fpsOptions.indexOf(currentFps);
          if (currentIndex === fpsOptions.length - 1) {
            settings.autoFPS = true;
          } else {
            const nextFps = fpsOptions[currentIndex + 1];
            settings.updateInterval = 1000 / nextFps;
          }
        }
        dispatchEvent('updateFrameInterval', {
          interval: settings.updateInterval,
        });
        await getText('button4.tts.fpsBtn', {
          fps: settings.autoFPS ? 'auto' : Math.round(1000 / settings.updateInterval),
        });
      }
      dispatchEvent('updateUI', {
        settingsMode: settings.isSettingsMode,
        streamActive: !!settings.stream,
        micActive: !!settings.micStream,
      });
    } catch (err) {
      console.error('button4 error:', err.message);
      dispatchEvent('logError', { message: `button4 error: ${err.message}` });
      await getText(settings.isSettingsMode ? 'button4.tts.saveError' : 'button4.tts.fpsError');
    }
  });
  DOM.button4.addEventListener('click', async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log('button4 clicked', { settingsMode: settings.isSettingsMode });
    tryVibrate(event);
    try {
      if (settings.isSettingsMode) {
        dispatchEvent('saveSettings', { settingsMode: true });
      } else {
        if (settings.autoFPS) {
          settings.autoFPS = false;
          settings.updateInterval = 1000 / 20;
        } else {
          const fpsOptions = [20, 30, 60];
          const currentFps = 1000 / settings.updateInterval;
          const currentIndex = fpsOptions.indexOf(currentFps);
          if (currentIndex === fpsOptions.length - 1) {
            settings.autoFPS = true;
          } else {
            const nextFps = fpsOptions[currentIndex + 1];
            settings.updateInterval = 1000 / nextFps;
          }
        }
        dispatchEvent('updateFrameInterval', {
          interval: settings.updateInterval,
        });
        await getText('button4.tts.fpsBtn', {
          fps: settings.autoFPS ? 'auto' : Math.round(1000 / settings.updateInterval),
        });
      }
      dispatchEvent('updateUI', {
        settingsMode: settings.isSettingsMode,
        streamActive: !!settings.stream,
        micActive: !!settings.micStream,
      });
    } catch (err) {
      console.error('button4 error:', err.message);
      dispatchEvent('logError', { message: `button4 error: ${err.message}` });
      await getText(settings.isSettingsMode ? 'button4.tts.saveError' : 'button4.tts.fpsError');
    }
  });

  // Button 5: Email Console Log (Main Mode), Load Settings (Settings Mode)
  DOM.button5.addEventListener('touchstart', async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log('button5 touched', { settingsMode: settings.isSettingsMode });
    tryVibrate(event);
    try {
      if (settings.isSettingsMode) {
        dispatchEvent('loadSettings', { settingsMode: true });
      } else {
        dispatchEvent('emailDebug');
        await getText('button5.tts.emailDebug');
      }
    } catch (err) {
      console.error('button5 error:', err.message);
      dispatchEvent('logError', { message: `button5 error: ${err.message}` });
      await getText(settings.isSettingsMode ? 'button5.tts.loadError' : 'button5.tts.emailDebug', { state: 'error' });
    }
  });
  DOM.button5.addEventListener('click', async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log('button5 clicked', { settingsMode: settings.isSettingsMode });
    tryVibrate(event);
    try {
      if (settings.isSettingsMode) {
        dispatchEvent('loadSettings', { settingsMode: true });
      } else {
        dispatchEvent('emailDebug');
        await getText('button5.tts.emailDebug');
      }
    } catch (err) {
      console.error('button5 error:', err.message);
      dispatchEvent('logError', { message: `button5 error: ${err.message}` });
      await getText(settings.isSettingsMode ? 'button5.tts.loadError' : 'button5.tts.emailDebug', { state: 'error' });
    }
  });

  // Button 6: Settings Toggle
  DOM.button6.addEventListener('touchstart', async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log('button6 touched');
    tryVibrate(event);
    try {
      settings.isSettingsMode = !settings.isSettingsMode;
      dispatchEvent('updateUI', {
        settingsMode: settings.isSettingsMode,
        streamActive: !!settings.stream,
        micActive: !!settings.micStream,
      });
      dispatchEvent('toggleDebug', { show: settings.isSettingsMode });
      await getText('button6.tts.settingsToggle', { state: settings.isSettingsMode ? 'on' : 'off' });
    } catch (err) {
      console.error('button6 error:', err.message);
      dispatchEvent('logError', { message: `button6 error: ${err.message}` });
      await getText('button6.tts.settingsError');
    }
  });
  DOM.button6.addEventListener('click', async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log('button6 clicked');
    tryVibrate(event);
    try {
      settings.isSettingsMode = !settings.isSettingsMode;
      dispatchEvent('updateUI', {
        settingsMode: settings.isSettingsMode,
        streamActive: !!settings.stream,
        micActive: !!settings.micStream,
      });
      dispatchEvent('toggleDebug', { show: settings.isSettingsMode });
      await getText('button6.tts.settingsToggle', { state: settings.isSettingsMode ? 'on' : 'off' });
    } catch (err) {
      console.error('button6 error:', err.message);
      dispatchEvent('logError', { message: `button6 error: ${err.message}` });
      await getText('button6.tts.settingsError');
    }
  });

  console.log('setupUISettings: Setup complete');
}