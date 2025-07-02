// ui/audio-controls.js
import { settings } from "../state.js";
import { speak } from "./utils.js";
import { initializeAudio, cleanupAudio, initializeMicAudio } from "../audio-processor.js";
import { getDispatchEvent } from "../context.js";

let isAudioContextInitialized = false;
let audioContext = null;

export function setupAudioControls({ dispatchEvent, DOM }) {
  if (!DOM || !DOM.powerOn || !DOM.button2 || !DOM.splashScreen || !DOM.mainContainer) {
    console.error("Missing DOM elements in audio-controls");
    dispatchEvent("logError", { message: "Missing DOM elements in audio-controls" });
    return;
  }

  // Power On: Initialize Audio Context
  DOM.powerOn.addEventListener("touchstart", async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log("powerOn touched");
    try {
      // Create AudioContext
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (!audioContext) throw new Error("AudioContext creation failed");

      // Ensure AudioContext is running
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
      await speak("audioOn");
      dispatchEvent("updateUI", { settingsMode: false, streamActive: false, micActive: false });
      console.log("powerOn: AudioContext initialized, UI updated");
    } catch (err) {
      console.error("Power on error:", err.message);
      dispatchEvent("logError", { message: `Power on error: ${err.message}` });
      await speak("audioError");
      // Retry logic
      for (let i = 0; i < 3; i++) {
        await new Promise((resolve) => setTimeout(resolve, 1000));
        try {
          console.log(`PowerOn: Retry ${i + 1} for AudioContext`);
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          if (audioContext.state === "suspended") {
            await audioContext.resume();
          }
          if (audioContext.state !== "running") {
            throw new Error(`AudioContext retry failed, state: ${audioContext.state}`);
          }
          await initializeAudio(audioContext);
          isAudioContextInitialized = true;
          DOM.splashScreen.style.display = "none";
          DOM.mainContainer.style.display = "grid";
          await speak("audioOn");
          dispatchEvent("updateUI", { settingsMode: false, streamActive: false, micActive: false });
          console.log("PowerOn: AudioContext initialized on retry");
          break;
        } catch (retryErr) {
          console.error(`Retry ${i + 1} failed:`, retryErr.message);
          dispatchEvent("logError", { message: `Audio retry ${i + 1} failed: ${retryErr.message}` });
        }
      }
      if (!isAudioContextInitialized) {
        await speak("audioError");
        DOM.powerOn.textContent = "Audio Failed - Retry";
        DOM.powerOn.setAttribute("aria-label", "Retry audio initialization");
      }
    }
  });

  // Button 2: Toggle Microphone (non-settings mode)
  DOM.button2.addEventListener("touchstart", async (event) => {
    if (event.cancelable) event.preventDefault();
    if (settings.isSettingsMode) return; // Handled in ui-settings.js
    if (!isAudioContextInitialized) {
      console.error("Audio not initialized");
      dispatchEvent("logError", { message: "Audio not initialized" });
      await speak("audioNotEnabled");
      return;
    }
    try {
      console.log("button2: Dispatching toggleMic");
      dispatchEvent("toggleMic", { settingsMode: false });
    } catch (err) {
      console.error("Mic toggle error:", err.message);
      dispatchEvent("logError", { message: `Mic toggle error: ${err.message}` });
      await speak("micError");
    }
  });

  console.log("setupAudioControls: Setup complete");
}