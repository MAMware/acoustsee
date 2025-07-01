// ui/ui-settings.js
import { settings } from "../state.js";
import { speak } from "./utils.js";
import { getDispatchEvent } from "../context.js";

export function setupUISettings({ dispatchEvent, DOM }) {
  if (!DOM || !DOM.button1 || !DOM.button2 || !DOM.button3 || !DOM.button6) {
    console.error("Missing DOM elements in ui-settings");
    dispatchEvent("logError", { message: "Missing DOM elements in ui-settings" });
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

  // Button 1: Grid Toggle (settings mode)
  DOM.button1.addEventListener("touchstart", async (event) => {
    if (event.cancelable) event.preventDefault();
    if (!settings.isSettingsMode) return; // Handled in stream-control.js
    console.log("button1 touched (settings mode)");
    tryVibrate(event);
    try {
      dispatchEvent("startStop", { settingsMode: true });
    } catch (err) {
      console.error("button1 error:", err.message);
      dispatchEvent("logError", { message: `button1 error: ${err.message}` });
      await speak("startStop", { state: "error" });
    }
  });

  // Button 2: Synthesis Toggle (settings mode)
  DOM.button2.addEventListener("touchstart", async (event) => {
    if (event.cancelable) event.preventDefault();
    if (!settings.isSettingsMode) return; // Handled in audio-controls.js
    console.log("button2 touched (settings mode)");
    tryVibrate(event);
    try {
      dispatchEvent("toggleMic", { settingsMode: true });
    } catch (err) {
      console.error("button2 error:", err.message);
      dispatchEvent("logError", { message: `button2 error: ${err.message}` });
      await speak("audioError");
    }
  });

  // Button 3: FPS or Language Toggle
  DOM.button3.addEventListener("touchstart", async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log("button3 touched");
    tryVibrate(event);
    try {
      if (settings.isSettingsMode) {
        dispatchEvent("toggleInput");
      } else {
        if (settings.autoFPS) {
          settings.autoFPS = false;
          settings.updateInterval = 1000 / 20;
        } else {
          const fpsOptions = [20, 30, 60];
          const currentFps = 1000 / settings.updateInterval;
          const currentIndex = fpsOptions.indexOf(currentFps);
          if (currentIndex === fpsOptions.length - 1) {
            settings.autoFPS = true;
          } else {
            const nextFps = fpsOptions[currentIndex + 1];
            settings.updateInterval = 1000 / nextFps;
          }
        }
        dispatchEvent("updateFrameInterval", {
          interval: settings.updateInterval,
        });
        await speak("fpsBtn", {
          fps: settings.autoFPS ? "auto" : Math.round(1000 / settings.updateInterval),
        });
      }
      dispatchEvent("updateUI", {
        settingsMode: settings.isSettingsMode,
        streamActive: !!settings.stream,
      });
    } catch (err) {
      console.error("button3 error:", err.message);
      dispatchEvent("logError", { message: `button3 error: ${err.message}` });
      await speak("fpsError");
    }
  });

  // Button 6: Settings Toggle
  DOM.button6.addEventListener("touchstart", async (event) => {
    if (event.cancelable) event.preventDefault();
    console.log("button6 touched");
    tryVibrate(event);
    try {
      settings.isSettingsMode = !settings.isSettingsMode;
      dispatchEvent("updateUI", {
        settingsMode: settings.isSettingsMode,
        streamActive: !!settings.stream,
      });
      dispatchEvent("toggleDebug", { show: settings.isSettingsMode });
    } catch (err) {
      console.error("button6 error:", err.message);
      dispatchEvent("logError", { message: `button6 error: ${err.message}` });
      await speak("settingsError");
    }
  });

  console.log("setupUISettings: Setup complete");
}