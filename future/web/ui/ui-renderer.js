import { getText } from '../utils/utils.js';

/**
 * UI renderer: subscribes to engine state and updates DOM accordingly.
 * Keep this module free of business logic; it only maps state -> presentation.
 */
export function setupUIRenderer(DOM, engine) {
  if (!DOM || !engine) return;

  // Language label updater
  async function updateLanguageButton(state) {
    try {
      if (!DOM.button3) return;
      const langId = state.language || (state.availableLanguages && state.availableLanguages[0] && state.availableLanguages[0].id) || 'en-US';
      const languageName = (typeof Intl !== 'undefined' && typeof Intl.DisplayNames === 'function')
        ? (new Intl.DisplayNames([state.language || 'en-US'], { type: 'language' }).of(langId.split('-')[0]) || langId)
        : langId;
      const text = await getText('button3.normal.text', { languageName }).catch(() => `Language: ${languageName}`);
      const aria = await getText('button3.normal.aria', { languageName }).catch(() => text || `Language: ${languageName}`);
      const span = DOM.button3.querySelector('.button-text') || DOM.button3;
      if (span) span.textContent = text;
      DOM.button3.setAttribute('aria-label', aria || text);
    } catch (e) {
      // best-effort: do not throw
      console.warn('updateLanguageButton failed', e);
    }
  }

  async function updateCameraButton(state) {
    try {
      if (!DOM.button1) return;
      const active = !!state.stream;
      DOM.button1.setAttribute('aria-pressed', active ? 'true' : 'false');
      const span = DOM.button1.querySelector('.button-text') || DOM.button1;
      const key = active ? 'button1.normal.stop.text' : 'button1.normal.start.text';
      const text = await getText(key).catch(() => (active ? 'Stop' : 'Start'));
      if (span) span.textContent = text;
    } catch (e) {
      console.warn('updateCameraButton failed', e);
    }
  }

  async function updateAutoFpsButton(state) {
    try {
      if (!DOM.button4) return;
      const enabled = !!state.autoFPS;
      const span = DOM.button4.querySelector('.button-text') || DOM.button4;
      const key = enabled ? 'button4.normal.auto.on.text' : 'button4.normal.auto.off.text';
      const text = await getText(key).catch(() => (enabled ? 'Auto FPS' : 'Fixed FPS'));
      if (span) span.textContent = text;
      DOM.button4.setAttribute('aria-pressed', enabled ? 'true' : 'false');
    } catch (e) {
      console.warn('updateAutoFpsButton failed', e);
    }
  }

  async function updateMicButton(state) {
    try {
      if (!DOM.button2) return;
      const active = !!state.micStream;
      const span = DOM.button2.querySelector('.button-text') || DOM.button2;
      const key = active ? 'button2.normal.on.text' : 'button2.normal.off.text';
      const text = await getText(key).catch(() => (active ? 'Mic On' : 'Mic Off'));
      if (span) span.textContent = text;
      DOM.button2.setAttribute('aria-pressed', active ? 'true' : 'false');
    } catch (e) {
      console.warn('updateMicButton failed', e);
    }
  }

  // Subscribe to engine state changes
  engine.onStateChange((state) => {
    // Render only the parts we own
  updateLanguageButton(state).catch(() => {});
  updateCameraButton(state).catch(() => {});
  updateAutoFpsButton(state).catch(() => {});
  updateMicButton(state).catch(() => {});
  });
}
