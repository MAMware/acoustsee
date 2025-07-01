// ui/debug-controls.js
import { speak } from "./utils.js";
import { getDispatchEvent } from "../context.js";

export function setupDebugControls({ dispatchEvent, DOM }) {
  if (!DOM || !DOM.button4 || !DOM.button5 || !DOM.debug) {
    console.error("Missing DOM elements in debug-controls");
    dispatchEvent("logError", { message: "Missing DOM elements in debug-controls" });
    return;
  }

  function tryVibrate(event) {
    if (event.cancelable && navigator.vibrate) {
      try {
        navigator.vibrate(50);
      } catch (err) {
        console.warn("Vibration blocked:", err.message);
      }
    }
  }

  // Button 4: View Debug (settings mode)
  DOM.button4.addEventListener("touchstart", async (event) => {
    if (event.cancelable) event.preventDefault();
    if (!settings.isSettingsMode) return; // Handled in settings-persistence.js
    console.log("button4 touched (settings mode)");
    tryVibrate(event);
    try {
      dispatchEvent("saveSettings", { settingsMode: true });
    } catch (err) {
      console.error("button4 error:", err.message);
      dispatchEvent("logError", { message: `button4 error: ${err.message}` });
      await speak("saveError");
    }
  });

  // Button 5: Email Debug (settings mode)
  DOM.button5.addEventListener("touchstart", async (event) => {
    if (event.cancelable) event.preventDefault();
    if (!settings.isSettingsMode) return; // Handled in settings-persistence.js
    console.log("button5 touched (settings mode)");
    tryVibrate(event);
    try {
      dispatchEvent("emailDebug");
    } catch (err) {
      console.error("button5 error:", err.message);
      dispatchEvent("logError", { message: `button5 error: ${err.message}` });
      await speak("emailDebug", { state: "error" });
    }
  });

  console.log("setupDebugControls: Setup complete");
}