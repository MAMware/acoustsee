// Update web/ui/audio-controls.js: Remove { passive: true } from touchstart listener to ensure it counts as a user gesture for AudioContext

import { getText } from "../utils/utils.js";
import { initializeAudio } from "./audio-processor.js";
import { structuredLog } from "../utils/logging.js";
import { AudioManager } from "./audio-manager.js";

const audioManager = new AudioManager();
let isAudioContextInitialized = false;

export function setupAudioControls({ dispatchEvent: dispatch, DOM }) {
  if (!DOM || !DOM.powerOn) {
    console.error("setupAudioControls: Missing DOM elements");
    dispatch("logError", { message: "Missing DOM elements in audio-controls" });
    return;
  }

  const initializeAudioContext = async (event) => {
    console.log(`powerOn: ${event.type} event`);
    try {
      const success = await audioManager.initialize();
      if (success) {
        await initializeAudio(audioManager.context);
        isAudioContextInitialized = true;
        DOM.splashScreen.style.display = "none";
        DOM.mainContainer.style.display = "grid";
        await getText("audioOn");
        dispatch("updateUI", { settingsMode: false, streamActive: false, micActive: false });
        console.log("powerOn: AudioContext initialized, UI updated");
        return;
      }
    } catch (err) {
      if (err.message.includes("Permission denied")) {
        structuredLog('ERROR', 'Audio init permission denied', { message: err.message });
        await getText('button2.tts.micError');
      }
      console.error(`Audio init failed: ${err.message}`);
      dispatch("logError", { message: `Audio init failed: ${err.message}` });
    }
    await getText("audioError");
    DOM.powerOn.textContent = await getText("powerOn.failed.text", {}, 'text');
    DOM.powerOn.setAttribute("aria-label", await getText("powerOn.failed.aria", {}, 'aria'));
  };

  const handlePowerOn = async (event) => {
    if (!isAudioContextInitialized) {
      await initializeAudioContext(event);
    } else {
      console.log("powerOn: Audio already initialized, cleaning up");
      await audioManager.cleanup();
      isAudioContextInitialized = false;
      DOM.splashScreen.style.display = "flex";
      DOM.mainContainer.style.display = "none";
      await getText("audioOff");
      dispatch("updateUI", { settingsMode: false, streamActive: false, micActive: false });
    }
  };

  DOM.powerOn.addEventListener("pointerdown", handlePowerOn);

  console.log("setupAudioControls: Audio controls initialized");
}
