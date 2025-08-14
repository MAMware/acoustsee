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
  console.log("setupAudioControls: Initialized with one-time unlock listener.");
}
