// File: web/audio/audio-controls.js

import { getText, speakText } from "../utils/utils.js"; 
import { initializeAudio } from "./audio-processor.js";
import { structuredLog } from "../utils/logging.js";
import { AudioManager } from "./audio-manager.js";

const audioManager = new AudioManager();

export function setupAudioControls({ dispatchEvent: dispatch, DOM }) {
  if (!DOM || !DOM.powerOn) {
    // Missing elements; abort.
    return;
  }

  const handlePowerOn = (event) => {
    // Prevent the button from being clicked multiple times.
    DOM.powerOn.disabled = true;
    DOM.powerOn.textContent = 'Initializing...';

    // Call the synchronous unlock function. This returns a promise.
    audioManager.unlockAudio()
      .then(async () => {
        // SUCCESS: The context is now running.
        await audioManager.initialize(); // Now we can initialize the rest.
        await initializeAudio(audioManager.context);

        DOM.splashScreen.style.display = "none";
        DOM.mainContainer.style.display = "grid";
        const onMsg = await getText("audioOn");
        speakText(onMsg);
        dispatch("updateUI", { settingsMode: false, streamActive: false, micActive: false });
        console.log("powerOn: AudioContext unlocked and initialized.");
      })
      .catch(async (err) => {
        // FAILURE: The user's browser blocked the resume.
        structuredLog('ERROR', 'AudioContext unlock failed', { message: err.message });
        const errorMsg = await getText("audioError");
        speakText(errorMsg);
        DOM.powerOn.textContent = await getText("powerOn.failed.text");
        DOM.powerOn.setAttribute("aria-label", await getText("powerOn.failed.aria"));
        // Re-enable the button so the user can try again.
        DOM.powerOn.disabled = false;
      });
  };

  // We use `pointerdown` for responsiveness, but also add `once: true`.
  DOM.powerOn.addEventListener("pointerdown", handlePowerOn, { once: true });

  // Fallback: if the splash button doesn't receive the gesture (some overlays
  // or OS behaviours can swallow it), capture the first document-level
  // gesture and call the same handler. This is safe because the handler is
  // idempotent and `pointerdown` on the button will remove this listener.
  const docFallback = (ev) => {
    try {
      // Only call handler if button still present and not disabled.
      if (DOM.powerOn && !DOM.powerOn.disabled) handlePowerOn(ev);
    } finally {
      document.removeEventListener('pointerdown', docFallback, { passive: true });
      document.removeEventListener('touchstart', docFallback, { passive: true });
    }
  };
  document.addEventListener('pointerdown', docFallback, { passive: true });
  document.addEventListener('touchstart', docFallback, { passive: true });

  console.log("setupAudioControls: Initialized with one-time unlock listener.");
}