// File: web/core/dispatcher.js
/* @ts-nocheck */
import { settings, setAudioInterval, setStream, setMicStream } from './state.js';
import { getText, speakText, translatePage } from '../utils/utils.js';
import { debounce } from '../utils/async.js';
import { structuredLog } from '../utils/logging.js';
import { deviceSummary, computeAnnounceDelay } from '../utils/performance.js';
import { createAudioHandlers } from './handlers/audio-handlers.js';
import { createGridHandlers } from './handlers/grid-handlers.js';
import { createSettingsHandlers } from './handlers/settings-handlers.js';
import { createVideoHandlers } from './handlers/video-handlers.js';
import { createUIHandlers } from './handlers/ui-handlers.js';
import { createDebugHandlers } from './handlers/debug-handlers.js';

// --- 1. SIMPLIFIED DISPATCHER STATE ---
// This will hold the actual function that does the work.
let dispatchFunction = null;

// --- 2. A CLEANER, SIMPLER dispatchEvent ---
export function dispatchEvent(eventName, payload) {
  if (dispatchFunction) {
    structuredLog('DEBUG', `dispatchEvent: ${eventName}`, { payload });
    dispatchFunction(eventName, payload);
  } else {
    structuredLog('ERROR', 'dispatchEvent called before dispatcher is initialized', { eventName, payload });
  }
}

export async function createEventDispatcher(domElements) {
  structuredLog('INFO', 'createEventDispatcher: Initializing event dispatcher', { domExists: !!domElements });
  if (!domElements) {
    structuredLog('ERROR', 'domElements is undefined in createEventDispatcher');
    return { dispatchEvent: () => structuredLog('ERROR', 'dispatchEvent not initialized due to undefined domElements') };
  }

  structuredLog('DEBUG', 'DOM elements received', {
    hasButton1: !!domElements.button1,
    hasButton2: !!domElements.button2,
    hasButton3: !!domElements.button3,
    hasButton4: !!domElements.button4,
    hasButton5: !!domElements.button5,
    hasButton6: !!domElements.button6,
    hasVideoFeed: !!domElements.videoFeed,
  });
  
  // Use the centrally loaded configurations from the settings object.
  const { availableGrids, availableEngines, availableLanguages } = settings;

  const ds = deviceSummary();
  const browserInfo = {
    // include full device summary for richer telemetry downstream
    device: ds,
    parsedBrowserVersion: (() => {
      const browserVersionRegex = /Chrome\/([0-9.]+)|Firefox\/([0-9.]+)|Safari\/([0-9.]+)|Edg\/([0-9.]+)/;
      const m = ds.userAgent.match(browserVersionRegex);
      return (m && (m[1] || m[2] || m[3] || m[4])) || 'Unknown';
    })(),
    hardwareConcurrency: ds.hardwareConcurrency || 'N/A',
    deviceMemory: ds.deviceMemory ? `${ds.deviceMemory} GB` : 'N/A',
    screen: (typeof screen !== 'undefined' && screen.width && screen.height) ? `${screen.width}x${screen.height}` : 'N/A',
    audioContextState: (typeof audioContext !== 'undefined' && audioContext && audioContext.state) ? audioContext.state : 'Not initialized',
    streamActive: !!settings.stream,
    micActive: !!settings.micStream,
    currentFPSInterval: settings.updateInterval,
    announceDelayMs: computeAnnounceDelay()
  };
  structuredLog('INFO', 'Enhanced browser and app debug info', browserInfo);

  // Debounced version of updateUI to prevent rapid consecutive UI updates
  const debouncedUpdateUI = debounce(async ({ settingsMode, streamActive, micActive }) => {
    try {
      if (!domElements.button1 || !domElements.button2 || !domElements.button3 || !domElements.button4 || !domElements.button5 || !domElements.button6) {
        const missing = [
          !domElements.button1 && 'button1',
          !domElements.button2 && 'button2',
          !domElements.button3 && 'button3',
          !domElements.button4 && 'button4',
          !domElements.button5 && 'button5',
          !domElements.button6 && 'button6'
        ].filter(Boolean);
        structuredLog('ERROR', 'Missing critical DOM elements for UI update', { missing });
        dispatchEvent('logError', { message: 'Missing critical DOM elements for UI update' });
        return;
      }

      const currentTime = performance.now();
      const grid = availableGrids.find(g => g.id === settings.gridType);
      const engine = availableEngines.find(e => e.id === settings.synthesisEngine);
      const language = availableLanguages.find(l => l.id === settings.language);

      const button1Text = settingsMode
        ? await getText('button1.settings.text', { gridName: grid?.id || 'Grid' }, 'text')
        : await getText(`button1.normal.${streamActive ? 'stop' : 'start'}.text`, {}, 'text');
      const button1Aria = settingsMode
        ? await getText('button1.settings.aria', { gridType: settings.gridType }, 'aria')
        : await getText(`button1.normal.${streamActive ? 'stop' : 'start'}.aria`, {}, 'aria');
      if (settings.ttsEnabled) {
        const ttsMsg = await getText(
          `button1.tts.${settingsMode ? 'gridSelect' : 'startStop'}`,
          { state: settingsMode ? settings.gridType : (streamActive ? 'stopping' : 'starting') }
        );
        speakText(ttsMsg);
      }
      if (domElements.button1) {
        domElements.button1.textContent = button1Text;
        domElements.button1.setAttribute('aria-label', button1Aria);
      }
    } catch (err) {
      structuredLog('ERROR', 'updateUI error', { message: err.message, stack: err.stack });
      handlers.logError({ message: `UI update error: ${err.message}` });
    }
    structuredLog('DEBUG', 'updateUI: UI updated', { settingsMode, streamActive, micActive });
  }, 100);

  // Create a local dispatch that handlers will call to route events through this dispatcher.
  const dispatch = async (eventName, payload = {}) => {
    // Allow handlers to call this same dispatch recursively but guard against missing handlers
    if (handlers && typeof handlers[eventName] === 'function') {
      try {
        return await handlers[eventName](payload);
      } catch (err) {
        structuredLog('ERROR', `Error in handler for event: ${eventName}`, { message: err.message, stack: err.stack });
        if (handlers.logError) {
          handlers.logError({ message: `Handler for ${eventName} threw an error: ${err.message}` });
        }
      }
    } else {
      structuredLog('ERROR', `No handler found for event: ${eventName}`);
      if (handlers && handlers.logError) {
        handlers.logError({ message: `No handler found for event: ${eventName}` });
      }
    }
  };

  // Instantiate handler factories with the local dispatch function to avoid circular imports
  const audioHandlers = createAudioHandlers(dispatch);
  const gridHandlers = createGridHandlers(dispatch);
  const settingsHandlers = createSettingsHandlers(dispatch);
  const videoHandlers = createVideoHandlers(dispatch);
  const uiHandlers = createUIHandlers(dispatch);
  const debugHandlers = createDebugHandlers(dispatch);

  const handlers = {
    updateUI: debouncedUpdateUI,
    // Language change notification: re-translate DOM and request UI update
    languageChanged: async ({ language }) => {
      try {
        // Re-run shared translatePage helper to populate DOM
        translatePage(document);
        // Trigger a UI refresh so stateful labels are updated too
        debouncedUpdateUI({ settingsMode: settings.isSettingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
      } catch (e) {
        structuredLog('WARN', 'languageChanged handler failed', { error: e?.message || String(e) });
      }
    },
  // Pure routing table using instantiated handler functions
  processFrame: videoHandlers.processFrame,
  startStop: videoHandlers.startStop,
  toggleVideoSource: videoHandlers.toggleVideoSource,
  toggleAudio: audioHandlers.toggleAudio,
  toggleGrid: gridHandlers.toggleGrid,
  toggleLanguage: uiHandlers.toggleLanguage,
  updateFrameInterval: uiHandlers.updateFrameInterval,
  toggleDebug: debugHandlers.toggleDebug,
  saveSettings: settingsHandlers.saveSettings,
  loadSettings: settingsHandlers.loadSettings,
  emailDebug: debugHandlers.emailDebug,

    logError: ({ message }) => {
      structuredLog('ERROR', 'Error logged', { message });
    }
  };

  // --- 4. DIRECTLY ASSIGN THE DISPATCH LOGIC ---
  dispatchFunction = (eventName, payload = {}) => {
    // Forward to the local dispatch which calls handlers by name
    dispatch(eventName, payload);
  };

  structuredLog('INFO', 'createEventDispatcher: Dispatcher initialized and ready.');
  return { dispatchEvent };
}