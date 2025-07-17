import { getText } from "./utils.js";
import { initializeAudio, cleanupAudio } from "../audio-processor.js";
import { dispatchEvent } from "./event-dispatcher.js";  // This import is already present but unused; kept for consistency if needed

let isAudioContextInitialized = false;
let audioContext = null;

export function setupAudioControls({ dispatchEvent: dispatch, DOM }) {
  if (!DOM || !DOM.powerOn) {
    console.error("setupAudioControls: Missing DOM elements");
    dispatch("logError", { message: "Missing DOM elements in audio-controls" });  // Changed to dispatch
    return;
  }

  const initializeAudioContext = async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log(`powerOn: ${event.type} event`);
    const maxRetries = 3;
    for (let i = 0; i <= maxRetries; i++) {
      try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 44100 });
        if (!audioContext) throw new Error("AudioContext creation failed");
        if (audioContext.state === "suspended") {
          console.log("AudioContext is suspended, attempting to resume");
          await audioContext.resume();
        }
        if (audioContext.state !== "running") {
          throw new Error(`AudioContext failed to start, state: ${audioContext.state}`);
        }
        await initializeAudio(audioContext);
        isAudioContextInitialized = true;
        DOM.splashScreen.style.display = "none";
        DOM.mainContainer.style.display = "grid";
        await getText("audioOn");
        dispatch("updateUI", { settingsMode: false, streamActive: false, micActive: false });  // Changed to dispatch
        console.log("powerOn: AudioContext initialized, UI updated");
        return;
      } catch (err) {
        console.error(`Attempt ${i + 1} failed: ${err.message}`);
        dispatch("logError", { message: `Audio init attempt ${i + 1} failed: ${err.message}` });  // Changed to dispatch
      }
    }
    await getText("audioError");
    DOM.powerOn.textContent = "Audio Failed - Retry";
    DOM.powerOn.setAttribute("aria-label", "Retry audio initialization");
  };

  const handlePowerOn = async (event) => {
    if (!isAudioContextInitialized) {
      await initializeAudioContext(event);
    } else {
      console.log("powerOn: Audio already initialized, cleaning up");
      await cleanupAudio();
      isAudioContextInitialized = false;
      DOM.splashScreen.style.display = "flex";
      DOM.mainContainer.style.display = "none";
      await getText("audioOff");
      dispatch("updateUI", { settingsMode: false, streamActive: false, micActive: false });  // Changed to dispatch
    }
  };

  DOM.powerOn.addEventListener("click", handlePowerOn);
  DOM.powerOn.addEventListener("touchstart", handlePowerOn);

  console.log("setupAudioControls: Audio controls initialized");
}