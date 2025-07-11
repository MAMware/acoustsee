// future/web/main.js
// This is the main entry point for the AcoustSee web application.
// It initializes the application, sets up the UI controller, and handles DOM events.

import { createEventDispatcher } from "./ui/event-dispatcher.js";
import { setupStreamControl } from "./ui/stream-control.js";
import { setupUISettings } from "./ui/settings-handlers.js";
import { processFrame } from "./ui/video-capture.js"; // Updated from frame-processor.js
import { initializeAudio, cleanupAudio } from "./audio-processor.js";
import { getDOM } from "./context.js";
import { cleanupFrameProcessor } from "./ui/video-capture.js"; // Updated


console.log("main.js: Starting initialization");

document.addEventListener("DOMContentLoaded", async () => {
  const DOM = await initDOM();
  setDOM(DOM);
  const { dispatchEvent } = createEventDispatcher(DOM);
  setDispatchEvent(dispatchEvent);
  console.log("DOM loaded, initializing AcoustSee");
  try {
    console.log("DOM initialized:", DOM);
    window.dispatchEvent = dispatchEvent; // For mailto: feature
    console.log("Dispatcher created:", dispatchEvent);
    setupUIController({ dispatchEvent, DOM });
    console.log("UI controller set up");
    dispatchEvent("updateUI", { settingsMode: false, streamActive: false });
    console.log("Initial UI update dispatched");
  } catch (err) {
    console.error("Initialization failed:", err.message);
  }
});

console.log("main.js: Initialization script loaded");