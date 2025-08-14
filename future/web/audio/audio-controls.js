// File: web/audio/audio-controls.js

import { getText, speakText } from "../utils/utils.js"; 
import { initializeAudio, bindAudioManager } from "./audio-processor.js";
import { structuredLog } from "../utils/logging.js";
import { AudioManager } from "./audio-manager.js";

export function setupAudioControls({ dispatchEvent: dispatch, DOM }) {
  if (!DOM || !DOM.powerOn) {
    // Missing elements; abort.
    return;
  }

  // Prefer using a shared AudioManager provided on DOM by main.js. If not
  // present, create a local one and attach the gesture handler here.
  const audioManager = DOM.audioManager || new AudioManager();

  // Let audio-processor bind to the manager so it can initialize on unlock/resume.
  try { bindAudioManager(audioManager); } catch (e) { structuredLog('WARN', 'Failed to bind audio manager', { message: e?.message || String(e) }); }

  // If main already provided a shared audio manager, avoid installing a
  // duplicate startup gesture to prevent conflicting handlers. Main.js will
  // manage the powerOn flow in that case.
  if (DOM.audioManager) {
    console.log('setupAudioControls: Using shared AudioManager from DOM; skipping local gesture handler.');
    return;
  }

  // Local handler (only used when we created our own audioManager)
  const handlePowerOn = (event) => {
    // Prevent the button from being clicked multiple times.
    DOM.powerOn.disabled = true;
    DOM.powerOn.textContent = 'Initializing...';

    audioManager.unlockAudio()
      .then(async () => {
        await audioManager.initialize();
        await initializeAudio(audioManager.context);

        DOM.splashScreen && (DOM.splashScreen.style.display = "none");
        DOM.mainContainer && (DOM.mainContainer.style.display = "grid");
        const onMsg = await getText("audioOn");
        speakText(onMsg);
        dispatch("updateUI", { settingsMode: false, streamActive: false, micActive: false });
        console.log("powerOn: AudioContext unlocked and initialized.");
      })
      .catch(async (err) => {
        structuredLog('ERROR', 'AudioContext unlock failed', { message: err.message });
        const errorMsg = await getText("audioError");
        speakText(errorMsg);
        DOM.powerOn.textContent = await getText("powerOn.failed.text");
        DOM.powerOn.setAttribute("aria-label", await getText("powerOn.failed.aria"));
        DOM.powerOn.disabled = false;
      });
  };

  DOM.powerOn.addEventListener("pointerdown", handlePowerOn, { once: true });

  const docFallback = (ev) => {
    try {
      if (DOM.powerOn && !DOM.powerOn.disabled) handlePowerOn(ev);
    } finally {
      document.removeEventListener('pointerdown', docFallback, { passive: true });
      document.removeEventListener('touchstart', docFallback, { passive: true });
    }
  };
  document.addEventListener('pointerdown', docFallback, { passive: true });
  document.addEventListener('touchstart', docFallback, { passive: true });

  console.log("setupAudioControls: Initialized (local manager if no DOM audio manager present).");
}