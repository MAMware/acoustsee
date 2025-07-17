// future/web/main.js
// This is the main entry point for the AcoustSee web application.
// It initializes the application, sets up the UI controller, and handles DOM events.
import { setupUIController } from './ui/ui-controller.js';
import { createEventDispatcher } from './ui/event-dispatcher.js';  // Add this import

const DOM = {
  videoFeed: document.getElementById('videoFeed'),
  button1: document.getElementById('button1'),
  button2: document.getElementById('button2'),
  button3: document.getElementById('button3'),
  button4: document.getElementById('button4'),
  button5: document.getElementById('button5'),
  button6: document.getElementById('button6'),
  powerOn: document.getElementById('powerOn'),
  splashScreen: document.getElementById('splashScreen'),
  mainContainer: document.getElementById('mainContainer'),
  debugPanel: document.getElementById('debugPanel'),
};

async function init() {
  try {
    await loadConfigs;
    if (!DOM.videoFeed || !DOM.button1 || !DOM.button2 || !DOM.button3 || 
        !DOM.button4 || !DOM.button5 || !DOM.button6 || !DOM.powerOn || 
        !DOM.splashScreen || !DOM.mainContainer || !DOM.debugPanel) {
      throw new Error('Missing DOM elements in main.js');
    }
    const { dispatchEvent } = await createEventDispatcher(DOM);  // Create the dispatcher here
    setupUIController({ dispatchEvent, DOM });
    console.log('init: UI setup complete');
  } catch (err) {
    console.error('init error:', err.message);
    // Removed dispatchEvent('logError', ...) to avoid reference issues during init failure
    try {
      const { getText } = await import('./ui/utils.js');
      await getText('init.tts.error');
    } catch (ttsErr) {
      console.error('TTS error:', ttsErr.message);
    }
  }
}

init();