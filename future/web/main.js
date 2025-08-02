// File: web/main.js
import { setupUIController } from './ui/ui-controller.js';
import { createEventDispatcher } from './core/dispatcher.js';
import { loadConfigs, settings } from './core/state.js';
import { structuredLog } from './utils/logging.js';
import { setDOM } from './core/context.js';

let getText;
try {
  ({ getText } = await import('./utils/utils.js'));
  console.log('utils.js imported successfully');
} catch (importErr) {
  structuredLog('ERROR', 'Failed to import utils.js', { message: importErr.message });
  getText = async (key) => {
    structuredLog('WARN', 'TTS fallback for key', { key });
    return key;
  };
}

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

// Custom Error class to attach metadata
class CustomError extends Error {
  constructor(message, data = {}) {
    super(message);
    this.data = data;
  }
}

// Helper to validate DOM elements
function validateDOM() {
  const requiredIds = ['videoFeed', 'button1', 'button2', 'button3', 'button4', 'button5', 'button6', 'powerOn', 'splashScreen', 'mainContainer', 'debugPanel', 'frameCanvas'];
  const missing = requiredIds.filter(id => !DOM[id]);
  if (missing.length > 0) {
    throw new CustomError('Missing DOM elements', { missing });
  }
}

async function init() {
  const originalConsole = {
    log: console.log,
    warn: console.warn,
    error: console.error
  };
  try {
    // Validate DOM early
    validateDOM();

    // Wait for configs to fully load and defaults to be set
    await loadConfigs;
    structuredLog('INFO', 'init: Configurations loaded', {
      gridType: settings.gridType,
      synthesisEngine: settings.synthesisEngine,
      language: settings.language
    });

    // Validate critical settings before proceeding
    if (!settings.language || !settings.gridType || !settings.synthesisEngine) {
      throw new CustomError('Critical settings not initialized', {
        language: settings.language,
        gridType: settings.gridType,
        synthesisEngine: settings.synthesisEngine
      });
    }

    // Set aria and text for all relevant elements deriving from ID
    const staticElements = [
      { el: DOM.splashScreen, baseKey: 'splashScreen', setText: false, setAria: false }, // Non-interactive, no aria/text
      { el: DOM.mainContainer, baseKey: 'mainContainer', setText: false, setAria: false },
      { el: DOM.powerOn, baseKey: 'powerOn', setText: true, setAria: true },
      { el: DOM.videoFeed, baseKey: 'videoFeed', setText: false, setAria: true },
      { el: DOM.frameCanvas, baseKey: 'frameCanvas', setText: false, setAria: false }, // Hidden, no aria
      { el: DOM.debugPanel, baseKey: 'debugPanel', setText: false, setAria: true },
      { el: DOM.button1, baseKey: 'button1', setText: true, setAria: true },
      { el: DOM.button2, baseKey: 'button2', setText: true, setAria: true },
      { el: DOM.button3, baseKey: 'button3', setText: true, setAria: true },
      { el: DOM.button4, baseKey: 'button4', setText: true, setAria: true },
      { el: DOM.button5, baseKey: 'button5', setText: true, setAria: true },
      { el: DOM.button6, baseKey: 'button6', setText: true, setAria: true },
    ];
    for (const { el, baseKey, setText: shouldSetText, setAria } of staticElements) {
      if (!el) {
        structuredLog('WARN', `Skipping null element in staticElements`, { id: baseKey });
        continue;
      }
      try {
        if (setAria) {
          el.setAttribute('aria-label', await getText(`${baseKey}.aria`, {}, 'aria'));
        }
        if (shouldSetText) {
          el.textContent = await getText(`${baseKey}.text`, {}, 'text');
        }
      } catch (textErr) {
        structuredLog('WARN', 'Failed to set text/aria for element', { baseKey, message: textErr.message });
        // Continue with best-effort: set fallback if needed
        if (setAria) el.setAttribute('aria-label', baseKey);
        if (shouldSetText) el.textContent = baseKey;
      }
    }

    const { dispatchEvent } = await createEventDispatcher(DOM);
    setupUIController({ dispatchEvent, DOM });

    // Console overrides moved here to break circular dependency
    function safeStructuredLog(level, message, data = {}, persist = true, sample = true) {
      const tempLog = console.log;
      const tempWarn = console.warn;
      const tempError = console.error;
      try {
        console.log = originalConsole.log;
        console.warn = originalConsole.warn;
        console.error = originalConsole.error;

        structuredLog(level, message, data, persist, sample);
      } finally {
        console.log = tempLog;
        console.warn = tempWarn;
        console.error = tempError;
      }
    }

    console.log = (...args) => {
      originalConsole.log.apply(console, args);
      if (settings.debugLogging) safeStructuredLog('INFO', 'Console log', { args }, false);
    };
    console.warn = (...args) => {
      originalConsole.warn.apply(console, args);
      if (settings.debugLogging) safeStructuredLog('WARN', 'Console warn', { args }, false);
    };
    console.error = (...args) => {
      originalConsole.error.apply(console, args);
      safeStructuredLog('ERROR', 'Console error', { args }, false);
    };

    // Force initial UI update for dynamic content
    dispatchEvent('updateUI', { settingsMode: false, streamActive: false, micActive: false });
    structuredLog('INFO', 'init: UI setup complete');
  } catch (err) {
    let errorMessage = err.message;
    let errorData = err instanceof CustomError ? err.data : {};
    structuredLog('ERROR', 'init error', { message: errorMessage, data: errorData, stack: err.stack });
    originalConsole.error('init error:', err.message);
    try {
      await getText('init.tts.error');
    } catch (ttsErr) {
      originalConsole.error('TTS error:', ttsErr.message);
    }
    // Display specific error to user
    const announcements = document.getElementById('announcements');
    if (announcements) {
      announcements.textContent = `Initialization failed: ${errorMessage}. Check console for details.`;
    }
  }
}

// Adds uncaught error handler for global contexts
window.onerror = function (message, source, lineno, colno, error) {
  structuredLog('ERROR', 'Uncaught global error', { message, source, lineno, colno, stack: error ? error.stack : 'N/A' });
  if (settings.debugLogging) {
    console.error(message); // Allow bubbling in debug mode
    return false; // Let browser handle
  }
  return true; // Suppress in production
};

init();
