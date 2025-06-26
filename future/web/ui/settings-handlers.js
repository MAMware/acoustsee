import { settings } from "../state.js";
import { speak } from "./utils.js";
import { getDispatchEvent } from "../context.js";

export function setupSettingsHandlers({ dispatchEvent, DOM }) {
  console.log("setupSettingsHandlers: Starting setup");

  if (!DOM) {
    console.error("DOM is undefined in setupSettingsHandlers");
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

  // Button 1: Start/Stop
  if (DOM.button1) {
    DOM.button1.addEventListener("touchstart", async (event) => {
      if (event.cancelable) event.preventDefault();
      console.log("button1 touched");
      tryVibrate(event);
      try {
        dispatchEvent("startStop", { settingsMode: settings.isSettingsMode });
      } catch (err) {
        console.error("button1 error:", err.message);
        dispatchEvent("logError", { message: `button1 error: ${err.message}` });
        await speak("startStop", { state: "error" });
      }
    });
    console.log("button1 event listener attached");
  }

  // Button 2: Audio On/Off (Mic)
  if (DOM.button2) {
    DOM.button2.addEventListener("touchstart", async (event) => {
      if (event.cancelable) event.preventDefault();
      console.log("button2 touched");
      tryVibrate(event);
      try {
        dispatchEvent("toggleAudio", { settingsMode: settings.isSettingsMode });
      } catch (err) {
        console.error("button2 error:", err.message);
        dispatchEvent("logError", { message: `button2 error: ${err.message}` });
        await speak("audioError");
      }
    });
    console.log("button2 event listener attached");
  }

  // Button 3: FPS
  if (DOM.button3) {
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
            fps: settings.autoFPS
              ? "auto"
              : Math.round(1000 / settings.updateInterval),
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
    console.log("button3 event listener attached");
  }

  // Button 4: Save Settings
  if (DOM.button4) {
    DOM.button4.addEventListener("touchstart", async (event) => {
      if (event.cancelable) event.preventDefault();
      console.log("button4 touched");
      tryVibrate(event);
      try {
        dispatchEvent("saveSettings", {
          settingsMode: settings.isSettingsMode,
        });
      } catch (err) {
        console.error("button4 error:", err.message);
        dispatchEvent("logError", { message: `button4 error: ${err.message}` });
        await speak("saveError");
      }
    });
    console.log("button4 event listener attached");
  }

  // Button 5: Load Settings
  if (DOM.button5) {
    DOM.button5.addEventListener("touchstart", async (event) => {
      if (event.cancelable) event.preventDefault();
      console.log("button5 touched");
      tryVibrate(event);
      try {
        dispatchEvent("loadSettings", {
          settingsMode: settings.isSettingsMode,
        });
      } catch (err) {
        console.error("button5 error:", err.message);
        dispatchEvent("logError", { message: `button5 error: ${err.message}` });
        await speak("loadError");
      }
    });
    console.log("button5 event listener attached");
  }

  // Button 6: Settings Toggle
  if (DOM.button6) {
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
    console.log("button6 event listener attached");
  }

  console.log("setupSettingsHandlers: Setup complete");
}
