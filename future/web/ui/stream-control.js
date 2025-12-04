// ui/stream-control.js
import { settings, setStream } from "../state.js";
import { speak } from "./utils.js";
import { getDispatchEvent } from "../context.js";

export function setupStreamControl({ dispatchEvent, DOM }) {
  if (!DOM || !DOM.button1) {
    console.error("Missing DOM elements in stream-control");
    dispatchEvent("logError", { message: "Missing DOM elements in stream-control" });
    return;
  }

  // Button 1: Toggle Stream (non-settings mode)
  DOM.button1.addEventListener("touchstart", async (event) => {
    if (event.cancelable) event.preventDefault();
    if (settings.isSettingsMode) return; // Handled in ui-settings.js
    try {
      console.log("button1: Dispatching toggleStream");
      dispatchEvent("toggleStream");
    } catch (err) {
      console.error("Stream toggle error:", err.message);
      dispatchEvent("logError", { message: `Stream toggle error: ${err.message}` });
      await speak("cameraError");
    }
  });

  console.log("setupStreamControl: Setup complete");
}