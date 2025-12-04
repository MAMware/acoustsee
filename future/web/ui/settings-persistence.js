// ui/settings-persistence.js
import { settings } from "../state.js";
import { speak } from "./utils.js";
import { getDispatchEvent } from "../context.js";

export function setupSettingsPersistence({ dispatchEvent, DOM }) {
  if (!DOM || !DOM.button4 || !DOM.button5) {
    console.error("Missing DOM elements in settings-persistence");
    dispatchEvent("logError", { message: "Missing DOM elements in settings-persistence" });
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

  // Button 4: Save Settings (non-settings mode)
  DOM.button4.addEventListener("touchstart", async (event) => {
    if (event.cancelable) event.preventDefault();
    if (settings.isSettingsMode) return; // Handled in debug-controls.js
    console.log("button4 touched");
    tryVibrate(event);
    try {
      dispatchEvent("saveSettings", { settingsMode: false });
    } catch (err) {
      console.error("button4 error:", err.message);
      dispatchEvent("logError", { message: `button4 error: ${err.message}` });
      await speak("saveError");
    }
  });

  // Button 5: Load Settings (non-settings mode)
  DOM.button5.addEventListener("touchstart", async (event) => {
    if (event.cancelable) event.preventDefault();
    if (settings.isSettingsMode) return; // Handled in debug-controls.js
    console.log("button5 touched");
    tryVibrate(event);
    try {
      dispatchEvent("loadSettings", { settingsMode: false });
    } catch (err) {
      console.error("button5 error:", err.message);
      dispatchEvent("logError", { message: `button5 error: ${err.message}` });
      await speak("loadError");
    }
  });

  console.log("setupSettingsPersistence: Setup complete");
}