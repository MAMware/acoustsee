import { setupUIController } from './ui/ui-controller.js';
import { createEventDispatcher } from './core/dispatcher.js';
import { loadConfigs, settings } from './core/state.js';
import { structuredLog } from './utils/logging.js';
import { setDOM } from './core/context.js';
import { getText } from './utils/utils.js';

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

// Initialize shared DOM context for modules that need it
setDOM(DOM);

async function init() {
  try {
    await loadConfigs;
    let getText;
    try {
      ({ getText } = await import('./ui/utils.js'));
      console.log('utils.js imported successfully');  // Confirm import worked
    } catch (importErr) {
      console.error('Failed to import utils.js:', importErr.message);
      getText = async (key) => {  // Make async for consistency with await calls
        console.warn('TTS fallback for key:', key);
        return key;  // Return key as fallback string (better than '')
      };
    }
    // Set aria and text for all relevant elements deriving from ID
    const staticElements = [
      DOM.splashScreen,
      DOM.mainContainer,
      DOM.powerOn,
      DOM.videoFeed,
      DOM.frameCanvas,
      DOM.debugPanel,
      DOM.button1,
      DOM.button2,
      DOM.button3,
      DOM.button4,
      DOM.button5,
      DOM.button6,
    ];
    for (const el of staticElements) {
      if (!el) {
        console.warn(`Skipping null element in staticElements`);
        continue;
      }
      const baseKey = el.id;
      el.setAttribute('aria-label', await getText(`${baseKey}.aria`, {}, 'aria'));
      // Set text content only for elements that need it (e.g., powerOn, buttons)
      if (['powerOn'].includes(el.id) || el.tagName === 'BUTTON') {
        el.textContent = await getText(`${baseKey}.text`, {}, 'text');
      }
    }
    if (!DOM.videoFeed || !DOM.button1 || !DOM.button2 || !DOM.button3 || 
        !DOM.button4 || !DOM.button5 || !DOM.button6 || !DOM.powerOn || 
        !DOM.splashScreen || !DOM.mainContainer || !DOM.debugPanel || !DOM.frameCanvas) {
      throw new Error('Missing DOM elements in main.js');
    }
    const { dispatchEvent } = await createEventDispatcher(DOM);
    setupUIController({ dispatchEvent, DOM });
    // Console overrides moved here to break circular dependency
    const originalConsole = {
      log: console.log,
      warn: console.warn,
      error: console.error
    };
    const oldStructuredLog = structuredLog;
    window.structuredLog = async (level, message, data = {}, persist = true, sample = true) => {
      const backup = { log: console.log, warn: console.warn, error: console.error };
      console.log = originalConsole.log;
      console.warn = originalConsole.warn;
      console.error = originalConsole.error;
      await oldStructuredLog(level, message, data, persist, sample);
      console.log = backup.log;
      console.warn = backup.warn;
      console.error = backup.error;
    };
    console.log = (...args) => {
      originalConsole.log.apply(console, args);
      if (settings.debugLogging) window.structuredLog('INFO', 'Console log', { args }, false);
    };
    console.warn = (...args) => {
      originalConsole.warn.apply(console, args);
      if (settings.debugLogging) window.structuredLog('WARN', 'Console warn', { args }, false);
    };
    console.error = (...args) => {
      originalConsole.error.apply(console, args);
      window.structuredLog('ERROR', 'Console error', { args }, false);
    };
    // Force initial UI update for dynamic content
    dispatchEvent('updateUI', { settingsMode: false, streamActive: false, micActive: false });
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

// Adds uncaught error handler for global contexts (e.g., hangs/OOM).
window.onerror = function (message, source, lineno, colno, error) {
  structuredLog('ERROR', 'Uncaught global error', { message, source, lineno, colno, stack: error ? error.stack : 'N/A' });
  return true;  // Prevent default browser error logging.
};

init();
