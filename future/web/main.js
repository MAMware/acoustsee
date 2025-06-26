/**
 * Entry point for AcoustSee, initializing UI handlers and event dispatcher.
 */
import { setupRectangleHandlers } from "./ui/rectangle-handlers.js";
import { setupSettingsHandlers } from "./ui/settings-handlers.js";
import { createEventDispatcher } from "./ui/event-dispatcher.js";
import { initDOM } from "./ui/dom.js";
import { setDOM, setDispatchEvent } from "./context.js";

console.log("main.js: Starting initialization");

document.addEventListener("DOMContentLoaded", async () => {
  const DOM = await initDOM();
  setDOM(DOM);
  const { dispatchEvent } = createEventDispatcher(DOM);
  setDispatchEvent(dispatchEvent);
  console.log("DOM loaded, initializing AcoustSee");
  try {
    // Wait for DOM elements to be assigned and get the DOM object
    const DOM = await initDOM();
    console.log("DOM initialized:", DOM);

    // Create event dispatcher with DOM
    const { dispatchEvent } = createEventDispatcher(DOM);
    window.dispatchEvent = dispatchEvent; // For mailto: feature
    console.log("Dispatcher created:", dispatchEvent);

    // Setup handlers with DOM explicitly passed
    setupRectangleHandlers({ dispatchEvent, DOM });
    console.log("Rectangle handlers set up");
    setupSettingsHandlers({ dispatchEvent, DOM });
    console.log("Settings handlers set up");

    // Initial UI update
    dispatchEvent("updateUI", { settingsMode: false, streamActive: false });
    console.log("Initial UI update dispatched");
  } catch (err) {
    console.error("Initialization failed:", err.message);
  }
});

console.log("main.js: Initialization script loaded");
