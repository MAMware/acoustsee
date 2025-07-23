import { setupUIController } from './ui/ui-controller.js';
import { createEventDispatcher } from './ui/event-dispatcher.js';
import { loadConfigs } from './state.js';  

const DOM = {
  videoFeed: document.getElementById('videoFeed'),
  frameCanvas: document.getElementById('frameCanvas'),  
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
    const { getText } = await import('./ui/utils.js');
    // Set aria and text for all relevant elements deriving from ID
    const staticElements = [
      DOM.powerOn,
      DOM.videoFeed,
      DOM.frameCanvas,
      DOM.debugPanel,
      
    ];
    for (const el of staticElements) {
      if (el) {
        const baseKey = el.id;
        // Set aria-label
        el.setAttribute('aria-label', await getText(`${baseKey}.aria`, {}, 'aria'));
        // Set text content only for elements that need it (e.g., powerOn, buttons)
        if (['powerOn', ].includes(el.id)) {
          el.textContent = await getText(`${baseKey}.text`, {}, 'text');
        }
      }
    }
    if (!DOM.videoFeed || !DOM.button1 || !DOM.button2 || !DOM.button3 || 
        !DOM.button4 || !DOM.button5 || !DOM.button6 || !DOM.powerOn || 
        !DOM.splashScreen || !DOM.mainContainer || !DOM.debugPanel || !DOM.frameCanvas) {
      throw new Error('Missing DOM elements in main.js');
    }
    const { dispatchEvent } = await createEventDispatcher(DOM);
    setupUIController({ dispatchEvent, DOM });
    console.log('init: UI setup complete');
  } catch (err) {
    console.error('init error:', err.message);
    try {
      await getText('init.tts.error');
    } catch (ttsErr) {
      console.error('TTS error:', ttsErr.message);
    }
  }
}

init();