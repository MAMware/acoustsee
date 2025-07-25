export let settings = {
  debugLogging: true,
  stream: null,
  audioInterval: null,
  updateInterval: 30, 
  autoFPS: true,
  gridType: null, 
  synthesisEngine: null, 
  language: null, 
  isSettingsMode: false,
  micStream: null,
  ttsEnabled: false,
  dayNightMode: 'day'
};

export const loadConfigs = (async () => {
  try {
    const [grids, engines, languages, intervals] = await Promise.all([
      fetch('./synthesis-methods/grids/availableGrids.json').then(res => res.json()),
      fetch('./synthesis-methods/engines/availableEngines.json').then(res => res.json()),
      fetch('./languages/availableLanguages.json').then(res => res.json()),
      Promise.resolve([50, 33, 16])
    ]);
    availableLanguages = languages;
    settings.gridType = grids[0]?.id || settings.gridType;
    settings.synthesisEngine = engines[0]?.id || settings.synthesisEngine;
    settings.language = languages[0]?.id || settings.language;
    settings.updateInterval = intervals[0] || settings.updateInterval;
  } catch (err) {
    console.error('Failed to load configurations:', err.message);
    addLog(`ERROR: Failed to load configurations: ${err.message}`);
  }
})();

export let availableLanguages = [];

const logs = [];

export function addLog(message) {
  logs.push(`[${new Date().toISOString()}] ${message}`);
  if (logs.length > 1000) logs.shift(); // Limit to 1000 entries
}

export function getLogs() {
  return logs.join('\n');
}

export function setStream(stream) {
  settings.stream = stream;
  if (settings.debugLogging) {
    console.log('setStream', stream);
    addLog(`setStream: ${stream ? 'Stream set' : 'Stream cleared'}`);
  }
}

export function setAudioInterval(interval) {
  settings.audioInterval = interval;
  if (settings.debugLogging) {
    console.log('setAudioInterval', settings.updateInterval);  // Log actual ms instead of ID.
    addLog(`setAudioInterval: ${settings.updateInterval ? `Interval set to ${settings.updateInterval}ms` : 'Interval cleared'}`);
  }
}

export function setMicStream(stream) {
  settings.micStream = stream;
  if (settings.debugLogging) {
    console.log('setMicStream', stream);
    addLog(`setMicStream: ${stream ? 'Mic stream set' : 'Mic stream cleared'}`);
  }
}

// Override console methods to collect logs (conditional for non-errors)
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = (...args) => {
  if (settings.debugLogging) originalConsoleLog(...args);  // Conditional for log
  if (settings.debugLogging) {  // Already conditional, but consistent
    addLog(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' '));
  }
};

console.warn = (...args) => {
  if (settings.debugLogging) originalConsoleWarn(...args);  // Conditional for warn
  if (settings.debugLogging) {
    addLog(`WARN: ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`);
  }
};

console.error = (...args) => {
  originalConsoleError(...args);  // Always show errors in console
  addLog(`ERROR: ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`);  // But internal addLog unconditional for errors
};
