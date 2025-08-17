// File: web/ui/ui-settings.js
import { settings } from '../core/state.js';
import { getText, speakText, hapticCount } from '../utils/utils.js';
import { structuredLog } from '../utils/logging.js';

export function setupUISettings({ dispatchEvent, DOM }) {

  // Helper to resolve an element either from a DOM mapping object (DOM.button1)
  // or from a document (DOM.getElementById('button1')). This keeps the API
  // flexible for tests which pass `document`.
  function resolveEl(name) {
    if (!DOM) return null;
    if (DOM[name]) return DOM[name];
    if (typeof DOM.getElementById === 'function') return DOM.getElementById(name);
    return null;
  }

  // Helper: wire a single pointer event for both touch & click (use only 'pointerdown')
  function wireButton(el, id, { normal, settings: settingsAction }, {
    normalError, settingsError, params = () => ({})
  }) {
    if (!el) {
      console.warn(`setupUISettings: element ${id} not found`);
      return;
    }
    // Create a named handler so we can wire it to multiple event entry points
    const handler = async (event) => {
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
        // Immediately notify UI of state changes synchronously to avoid test
        // races where TTS awaits delay the dispatchEvent call.
        dispatchEvent('updateUI', {
          settingsMode: settings.isSettingsMode,
          streamActive: !!settings.stream,
          micActive: !!settings.micStream,
        });
      } catch (err) {
        console.error(`${id} error:`, err.message);
        dispatchEvent('logError', { message: `${id} error: ${err.message}` });
        const key = !settings.isSettingsMode ? normalError : settingsError;
        const errMsg = await getText(key, params());
        speakText(errMsg);
      }
    };
    el.addEventListener('pointerdown', handler, { passive: false });
    // Ensure touchstart is also wired for environments that dispatch touch events
    try {
      el.addEventListener('touchstart', handler, { passive: false });
    } catch (e) {
      // Some test environments may not support touch events; ignore.
    }
    // Provide legacy touch/click handler hooks for tests and older DOM code
    if (!el.ontouchstart) el.ontouchstart = handler;
    if (!el.onclick) el.onclick = handler;
    console.log(`${id} event listener attached (pointerdown/touchstart/click)`);
  }

  // Button 1
  wireButton(resolveEl('button1'), 'button1',
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
  wireButton(resolveEl('button2'), 'button2',
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
  wireButton(resolveEl('button3'), 'button3',
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
  wireButton(resolveEl('button4'), 'button4',
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
        const fpsMsg = await getText('button4.tts.fpsBtn', {
          fps: settings.autoFPS ? 'auto' : Math.round(1000 / settings.updateInterval)
        });
        speakText(fpsMsg);
      },
      settings: () => dispatchEvent('saveSettings', { settingsMode: true })
    },
    {
      normalError: 'button4.tts.fpsError',
      settingsError: 'button4.tts.saveError'
    }
  );

  // Button 5
  wireButton(resolveEl('button5'), 'button5',
    {
      normal: async () => {
        dispatchEvent('emailDebug');
        const emailMsg = await getText('button5.tts.emailDebug');
        speakText(emailMsg);
      },
      settings: () => dispatchEvent('loadSettings', { settingsMode: true })
    },
    {
      normalError: 'button5.tts.emailDebug',
      settingsError: 'button5.tts.loadError',
      params: () => ({ state: 'error' })
    }
  );

  // Sponsor opt-out flow: when in settings mode, Button5 opens sponsor page and
  // allows user to enter a keyword found on the sponsor page to opt-out of telemetry.
  // This is intentionally simple and visible.
  async function sponsorOptOutFlow() {
    try {
      const sponsorUrl = 'https://github.com/sponsors/MAMware';
      // Open sponsor in a new tab so user can see the keyword.
      window.open(sponsorUrl, '_blank');
      const promptMsg = await getText('sponsor.prompt', {});
      const keyword = prompt(promptMsg + '\n\n(Enter keyword to disable telemetry)');
      if (keyword && keyword.trim().toLowerCase() === 'invisible') {
        settings.ingestEnabled = false;
        try { localStorage.setItem('ingestEnabled', '0'); } catch (e) {}
        const msg = await getText('sponsor.thanks', {});
        speakText(msg);
        structuredLog('INFO', 'User disabled telemetry via sponsor opt-out');
      }
    } catch (e) {
      console.error('Sponsor opt-out failed:', e.message);
    }
  }

  // Button 6
  wireButton(resolveEl('button6'), 'button6',
    {
      normal: async () => {
        settings.isSettingsMode = !settings.isSettingsMode;
        dispatchEvent('toggleDebug', { show: settings.isSettingsMode });
        // Immediately update UI so callers/tests don't race on async TTS
        dispatchEvent('updateUI', {
          settingsMode: settings.isSettingsMode,
          streamActive: !!settings.stream,
          micActive: !!settings.micStream,
        });
        const toggleMsg = await getText('button6.tts.settingsToggle', {
          state: settings.isSettingsMode ? 'on' : 'off'
        });
        speakText(toggleMsg);
      },
      settings: async () => {
        settings.isSettingsMode = !settings.isSettingsMode;
        dispatchEvent('toggleDebug', { show: settings.isSettingsMode });
        // Immediately update UI so callers/tests don't race on async TTS
        dispatchEvent('updateUI', {
          settingsMode: settings.isSettingsMode,
          streamActive: !!settings.stream,
          micActive: !!settings.micStream,
        });
        const toggleMsg2 = await getText('button6.tts.settingsToggle', {
          state: settings.isSettingsMode ? 'on' : 'off'
        });
        speakText(toggleMsg2);
      }
    },
    {
      normalError: 'button6.tts.settingsError',
      settingsError: 'button6.tts.settingsError'
    }
  );

  console.log('setupUISettings: Setup complete');
}