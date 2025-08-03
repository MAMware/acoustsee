// File: web/main.js
import { setupUIController } from './ui/ui-controller.js';
import { createEventDispatcher } from './core/dispatcher.js';
import { loadConfigs, settings } from './core/state.js';
import { structuredLog } from './utils/logging.js';
import { setDOM } from './core/context.js';

let getText, initializeLanguageIfNeeded, speakText, announceMessage;
try {
  ({ getText, initializeLanguageIfNeeded, speakText, announceMessage } = await import('./utils/utils.js'));
  console.log('utils.js imported successfully');  // Confirm import worked
} catch (importErr) {
  console.error('Failed to import utils.js:', importErr.message);
  getText = async (key) => {
    console.warn('TTS fallback for key:', key);
    return key;
  };
  initializeLanguageIfNeeded = () => {
    structuredLog('WARN', 'Language init skipped due to import failure');
    return 'en-US';  // Fallback return
  };
  speakText = () => {
    structuredLog('WARN', 'TTS skipped due to import failure');
  };
  announceMessage = (msg) => {
    structuredLog('WARN', 'Announcement skipped due to import failure', { msg });
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

    // Handle missing configuration gracefully
    if (!settings.gridType || !settings.synthesisEngine || !settings.language) {
      const missing = [];
      if (!settings.gridType) missing.push('grids');
      if (!settings.synthesisEngine) missing.push('engines');
      if (!settings.language) missing.push('languages');
      const msg = await getText('initMissingConfigs', { missing: missing.join(', ') });
      announceMessage(msg);
      if (settings.ttsEnabled) speakText(msg);
      structuredLog('WARN', 'Partial configs; proceeding with limitations', { missing });
    }

    // Ensure language is initialized before translating
    initializeLanguageIfNeeded();

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
    const setupErrors = [];
    for (const { el, baseKey, setText: shouldSetText, setAria } of staticElements) {
      if (!el) continue;  // Validation already threw; no need for warn here
      try {
        if (setAria) {
          const ariaText = await getText(`${baseKey}.aria`, {});
          el.setAttribute('aria-label', ariaText);
          announceMessage(ariaText); // Announce if needed
        }
        if (shouldSetText) {
          const text = await getText(`${baseKey}.text`, {});
          el.textContent = text;
          announceMessage(text);
          speakText(text); // Speak if TTS enabled
        }
      } catch (textErr) {
        setupErrors.push({ baseKey, message: textErr.message });
        // Continue with best-effort: set fallback
        if (setAria) {
          el.setAttribute('aria-label', baseKey);
          announceMessage(baseKey);
        }
        if (shouldSetText) {
          el.textContent = baseKey;
          announceMessage(baseKey);
          speakText(baseKey);
        }
      }
    }
    if (setupErrors.length > 0) {
      structuredLog('WARN', 'UI setup had partial failures', { errors: setupErrors });
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
    let specificMessage = errorMessage;
    if (err.data?.missing) {
      specificMessage = `Missing DOM elements: ${err.data.missing.join(', ')}`;
    } else if (err.data?.language === null) {
      specificMessage = 'Language configuration failed to initialize';
    } // Add more categories as needed
    structuredLog('ERROR', 'init error', { message: specificMessage, data: errorData, stack: err.stack });
    originalConsole.error('init error:', err.message);
    try {
      const errorText = await getText('init.tts.error');
      speakText(errorText);
      announceMessage(`Initialization failed: ${specificMessage}. Check console for details.`);
    } catch (ttsErr) {
      originalConsole.error('TTS error:', ttsErr.message);
      announceMessage(`Initialization failed: ${specificMessage}. Check console for details.`);
    }
  }
}

// Adds uncaught error handler for global contexts
window.onerror = function (message, source, lineno, colno, error) {
  structuredLog('ERROR', 'Uncaught global error', { message, source, lineno, colno, stack: error ? error.stack : 'N/A' });
  if (settings?.debugLogging ?? true) {  // Safe check; default to true if settings null (pre-init)
    console.error(message); // Allow bubbling in debug mode
    return false; // Let browser handle
  }
  return true; // Suppress in production
};

init();