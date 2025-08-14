// File: web/audio/audio-controls.js

import { getText, speakText } from "../utils/utils.js"; 
import { initializeAudio } from "./audio-processor.js";
import { structuredLog } from "../utils/logging.js";
import { AudioManager } from "./audio-manager.js";

const audioManager = new AudioManager();
let isAudioContextInitialized = false;
let isInitializing = false;

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
        const onMsg = await getText("audioOn");
        speakText(onMsg);
        dispatch("updateUI", { settingsMode: false, streamActive: false, micActive: false });
        console.log("powerOn: AudioContext initialized, UI updated");
        return;
      }
    } catch (err) {
      structuredLog('ERROR', 'Audio init permission denied', { message: err.message });
      const errorMsg = await getText("audioError");
      speakText(errorMsg);
      DOM.powerOn.textContent = await getText("powerOn.failed.text");
      DOM.powerOn.setAttribute("aria-label", await getText("powerOn.failed.aria"));
    }
  };

  const handlePowerOn = async (event) => {
    if (isInitializing) {
      console.log("Initialization in progress – ignoring extra tap.");
      return;
    }

    isInitializing = true;
    DOM.powerOn.disabled = true; // <<< VISUAL FEEDBACK

    try {
      if (!isAudioContextInitialized) {
        await initializeAudioContext(event);
      } else {
        console.log("powerOn: Audio already initialized, cleaning up");
        await audioManager.cleanup();
        isAudioContextInitialized = false;
        DOM.splashScreen.style.display = "flex";
        DOM.mainContainer.style.display = "none";
        const offMsg = await getText("audioOff");
        speakText(offMsg); 
        dispatch("updateUI", { settingsMode: false, streamActive: false, micActive: false });
      }
    } finally {
      isInitializing = false;
      DOM.powerOn.disabled = false; // <<< GUARANTEE RE-ENABLING
    }
  };

  DOM.powerOn.addEventListener("pointerdown", handlePowerOn);

  console.log("setupAudioControls: Audio controls initialized with async lock and UX feedback.");
}