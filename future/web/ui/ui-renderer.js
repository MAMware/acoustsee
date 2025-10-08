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
      const text = await getText('button3.normal.text', { languageName }, state).catch(() => `Language: ${languageName}`);
      const aria = await getText('button3.normal.aria', { languageName }, state).catch(() => text || `Language: ${languageName}`);
      const span = DOM.button3.querySelector('.button-text') || DOM.button3;
      if (span) span.textContent = text;
      DOM.button3.setAttribute('aria-label', aria || text);
    } catch (e) {
      // best-effort: do not throw
      console.warn('updateLanguageButton failed', e);
    }
  }

  async function updateGridButton(state) {
    try {
      if (!DOM.button1) return; // grid may be shown on button1 in settings mode
      const grid = state.gridType || (state.availableGrids && state.availableGrids[0] && state.availableGrids[0].id) || 'default';
      const span = DOM.button1.querySelector('.button-text') || DOM.button1;
      const text = await getText('button1.normal.gridText', { grid }, state).catch(() => `Grid: ${grid}`);
      if (span) span.textContent = text;
      DOM.button1.setAttribute('data-grid', grid);
    } catch (e) {
      console.warn('updateGridButton failed', e);
    }
  }

  async function updateCameraButton(state) {
    try {
      if (!DOM.button1) return;
  const isProcessing = !!state.isProcessing;
  DOM.button1.setAttribute('aria-pressed', isProcessing ? 'true' : 'false');
  const span = DOM.button1.querySelector('.button-text') || DOM.button1;
  const key = isProcessing ? 'button1.normal.stop.text' : 'button1.normal.start.text';
  const text = await getText(key, {}, state).catch(() => (isProcessing ? 'Stop' : 'Start'));
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
      if (enabled) {
        const text = await getText('button4.normal.auto.on.text', {}, state).catch(() => 'Auto');
        if (span) span.textContent = text;
        DOM.button4.setAttribute('aria-pressed', 'true');
      } else {
        // show numeric FPS derived from updateInterval
        const fps = Math.round(1000 / (Number(state.updateInterval) || 1000 / 20));
        const text = await getText('button4.normal.fps.text', { fps }, state).catch(() => `${fps} FPS`);
        if (span) span.textContent = text;
        DOM.button4.setAttribute('aria-pressed', 'false');
      }
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
      const text = await getText(key, {}, state).catch(() => (active ? 'Mic On' : 'Mic Off'));
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
  updateGridButton(state).catch(() => {});
  updateAutoFpsButton(state).catch(() => {});
  updateMicButton(state).catch(() => {});
  });
}
