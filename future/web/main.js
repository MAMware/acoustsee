import { setupUIController } from "./ui/ui-controller.js";
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