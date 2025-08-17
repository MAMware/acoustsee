// Thin UI input mapper: maps DOM events to engine commands.

/**
 * Setup DOM -> engine mappings. This module should not contain business logic.
 * @param {object} DOM - collection of DOM elements (main.js already assembles this)
 * @param {object} engine - engine instance created from core/engine.js
 */
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
      engine.dispatch('cycleLanguage');
    });
  }

  // Button 1: camera toggle (pass video element so engine can start/stop)
  if (DOM.button1) {
    DOM.button1.addEventListener('pointerdown', async (ev) => {
      ev.preventDefault();
      try {
        const res = await engine.dispatch('toggleCamera', { videoEl: DOM.videoFeed });
        // If camera started, inform engine listeners that camera did start
        if (res && res.result && (res.result.started === true || res.started === true)) {
          // dispatch cameraDidStart so UI effects (benchmark) can run
          engine.dispatch('cameraDidStart', { videoEl: DOM.videoFeed });
        }
      } catch (e) {
        // best-effort
      }
    });
  }

  // Button 4: toggle Auto FPS
  if (DOM.button4) {
    DOM.button4.addEventListener('pointerdown', (ev) => {
      ev.preventDefault();
      engine.dispatch('toggleAutoFps');
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
