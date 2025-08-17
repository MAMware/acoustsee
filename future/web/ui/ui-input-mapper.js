// Thin UI input mapper: maps DOM events to engine commands.

/**
 * Setup DOM -> engine mappings. This module should not contain business logic.
 * @param {object} DOM - collection of DOM elements (main.js already assembles this)
 * @param {object} engine - engine instance created from core/engine.js
 */
import { getText, speakText } from '../utils/utils.js';

export function setupInputMapper(DOM, engine) {
  if (!DOM || !engine) return;

  // Button 6: toggle settings mode and announce it via engine commands
  if (DOM.button6) {
    DOM.button6.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      // explicit, headless-intent commands
      engine.dispatch('toggleSettingsMode');
      engine.dispatch('announceSettingsMode');
    });
  }

  // Button 3: language cycling
  if (DOM.button3) {
    DOM.button3.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      const state = engine.getState ? engine.getState() : {};
      if (!state.isSettingsMode) {
        engine.dispatch('cycleLanguage');
      } else {
        // In settings mode, button3 may map to video source in legacy UI; keep no-op for now
      }
    });
  }

  // Button 1: camera toggle (pass video element so engine can start/stop)
  if (DOM.button1) {
    DOM.button1.addEventListener('pointerdown', async (ev) => {
      ev.preventDefault();
      try {
        const state = engine.getState ? engine.getState() : {};
        if (state.isProcessing) {
          await engine.dispatch('stopProcessing', { videoEl: DOM.videoFeed });
        } else {
          const res = await engine.dispatch('startProcessing', { videoEl: DOM.videoFeed, canvasEl: DOM.frameCanvas });
          // If camera started, inform engine listeners that camera did start
          if (res && res.result && (res.result.started === true || res.started === true || res.timerId)) {
            engine.dispatch('cameraDidStart', { videoEl: DOM.videoFeed });
          }
        }
      } catch (e) {
        // best-effort
      }
    });
  }

  // Button 4: toggle Auto FPS (normal) or save settings (settings mode)
  if (DOM.button4) {
    DOM.button4.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      const state = engine.getState ? engine.getState() : {};
      if (!state.isSettingsMode) {
  engine.dispatch('cycleFramerate');
      } else {
        engine.dispatch('saveSettings');
      }
    });
  }

  // Button 5: load settings in settings mode, otherwise email debug
  if (DOM.button5) {
    DOM.button5.addEventListener('pointerdown', async (ev) => {
      ev.preventDefault();
      const state = engine.getState ? engine.getState() : {};
      if (!state.isSettingsMode) {
        engine.dispatch('emailDebug');
        const emailMsg = await getText('button5.tts.emailDebug').catch(() => null);
        if (emailMsg && typeof speakText === 'function') speakText(emailMsg);
      } else {
        engine.dispatch('loadSettings');
      }
    });
  }

  // Button 2: toggle microphone
  if (DOM.button2) {
    DOM.button2.addEventListener('pointerdown', async (ev) => {
      ev.preventDefault();
      try { await engine.dispatch('toggleMicrophone'); } catch (e) { /* best-effort */ }
    });
  }

  // Other button mappings can be added incrementally here.
}
