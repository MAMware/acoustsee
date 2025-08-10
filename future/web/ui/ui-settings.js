// File: web/ui/ui-settings.js
import { settings } from '../core/state.js';
import { getText, hapticCount } from '../utils/utils.js';
import { structuredLog } from '../utils/logging.js';

export function setupUISettings({ dispatchEvent, DOM }) {

  // Helper: wire a single pointer event for both touch & click
  function wireButton(el, id, { normal, settings: settingsAction }, {
    normalError, settingsError, params = () => ({})
  }) {
    el.addEventListener('pointerdown', async (event) => {
      if (event.cancelable) event.preventDefault();
      console.log(`${id} event`, { settingsMode: settings.isSettingsMode });
      if (event.cancelable && navigator.vibrate) {
        try {
          navigator.vibrate(50);
        } catch (err) {
          console.warn('Vibration blocked:', err.message);
        }
      }
      hapticCount(Number(id.replace('button', '')));
      try {
        if (!settings.isSettingsMode) {
          await normal();
        } else {
          await settingsAction();
        }
        dispatchEvent('updateUI', {
          settingsMode: settings.isSettingsMode,
          streamActive: !!settings.stream,
          micActive: !!settings.micStream,
        });
      } catch (err) {
        console.error(`${id} error:`, err.message);
        dispatchEvent('logError', { message: `${id} error: ${err.message}` });
        const key = !settings.isSettingsMode ? normalError : settingsError;
        await getText(key, params());
      }
    }, { passive: false });
    console.log(`${id} event listeners attached`);
  }

  // Button 1
  wireButton(DOM.button1, 'button1',
    {
      normal: () => dispatchEvent('startStop', { settingsMode: settings.isSettingsMode }),
      settings: () => dispatchEvent('startStop', { settingsMode: settings.isSettingsMode })
    },
    {
      normalError: 'button1.tts.startStop',
      settingsError: 'button1.tts.startStop',
      params: () => ({ state: 'error' })
    }
  );

  // Button 2
  wireButton(DOM.button2, 'button2',
    {
      normal: () => dispatchEvent('toggleAudio', { settingsMode: settings.isSettingsMode }),
      settings: () => dispatchEvent('toggleAudio', { settingsMode: settings.isSettingsMode })
    },
    {
      normalError: 'button2.tts.micError',
      settingsError: 'button2.tts.micError'
    }
  );

  // Button 3
  wireButton(DOM.button3, 'button3',
    {
      normal: () => dispatchEvent('toggleLanguage'),
      settings: () => dispatchEvent('toggleVideoSource')
    },
    {
      normalError: 'button3.tts.languageError',
      settingsError: 'button3.tts.videoSourceError'
    }
  );

  // Button 4
  wireButton(DOM.button4, 'button4',
    {
      normal: async () => {
        if (settings.autoFPS) {
          settings.autoFPS = false;
          settings.updateInterval = 1000 / 20;
        } else {
          const fpsOptions = [20, 30, 60];
          const currentFps = 1000 / settings.updateInterval;
          const idx = fpsOptions.indexOf(currentFps);
          settings.autoFPS = idx === fpsOptions.length - 1;
          if (!settings.autoFPS) {
            settings.updateInterval = 1000 / fpsOptions[idx + 1];
          }
        }
        dispatchEvent('updateFrameInterval', { interval: settings.updateInterval });
        await getText('button4.tts.fpsBtn', {
          fps: settings.autoFPS ? 'auto' : Math.round(1000 / settings.updateInterval)
        });
      },
      settings: () => dispatchEvent('saveSettings', { settingsMode: true })
    },
    {
      normalError: 'button4.tts.fpsError',
      settingsError: 'button4.tts.saveError'
    }
  );

  // Button 5
  wireButton(DOM.button5, 'button5',
    {
      normal: async () => {
        dispatchEvent('emailDebug');
        await getText('button5.tts.emailDebug');
      },
      settings: () => dispatchEvent('loadSettings', { settingsMode: true })
    },
    {
      normalError: 'button5.tts.emailDebug',
      settingsError: 'button5.tts.loadError',
      params: () => ({ state: 'error' })
    }
  );

  // Button 6
  wireButton(DOM.button6, 'button6',
    {
      normal: async () => {
        settings.isSettingsMode = !settings.isSettingsMode;
        dispatchEvent('toggleDebug', { show: settings.isSettingsMode });
        await getText('button6.tts.settingsToggle', {
          state: settings.isSettingsMode ? 'on' : 'off'
        });
      },
      settings: async () => {
        settings.isSettingsMode = !settings.isSettingsMode;
        dispatchEvent('toggleDebug', { show: settings.isSettingsMode });
        await getText('button6.tts.settingsToggle', {
          state: settings.isSettingsMode ? 'on' : 'off'
        });
      }
    },
    {
      normalError: 'button6.tts.settingsError',
      settingsError: 'button6.tts.settingsError'
    }
  );

  console.log('setupUISettings: Setup complete');
}