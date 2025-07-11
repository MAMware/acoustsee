// File: web/state.js
// future/web/state.js

export let settings = {
  debugLogging: false,
  stream: null,
  audioInterval: null,
  updateInterval: 50, // Default to 20 FPS
  autoFPS: true,
  gridType: 'circle-of-fifths', // Fallback
  synthesisEngine: 'sine-wave', // Fallback
  language: 'en-US', // Fallback
  isSettingsMode: false,
  micStream: null,
  ttsEnabled: true,
  dayNightMode: 'day'
};

// Load configurations at startup
(async () => {
  try {
    const [grids, engines, languages, intervals] = await Promise.all([
      fetch('./synthesis-methods/grids/availableGrids.json').then(res => res.json()),
      fetch('./synthesis-methods/engines/availableEngines.json').then(res => res.json()),
      fetch('./languages/availableLanguages.json').then(res => res.json()),
      Promise.resolve([50, 33, 16]) // Hardcoded intervals for now
    ]);
    settings.gridType = grids[0]?.id || settings.gridType;
    settings.synthesisEngine = engines[0]?.id || settings.synthesisEngine;
    settings.language = languages[0]?.id || settings.language;
    settings.updateInterval = intervals[0] || settings.updateInterval;
  } catch (err) {
    console.error('Failed to load configurations:', err.message);
    addLog(`ERROR: Failed to load configurations: ${err.message}`);
  }
})();

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
    console.log('setAudioInterval', interval);
    addLog(`setAudioInterval: ${interval ? `Interval set to ${interval}ms` : 'Interval cleared'}`);
  }
}

export function setMicStream(stream) {
  settings.micStream = stream;
  if (settings.debugLogging) {
    console.log('setMicStream', stream);
    addLog(`setMicStream: ${stream ? 'Mic stream set' : 'Mic stream cleared'}`);
  }
}

// Override console methods to collect logs
const originalConsoleLog = console.log;
const originalConsoleWarn = console.warn;
const originalConsoleError = console.error;

console.log = (...args) => {
  originalConsoleLog(...args);
  addLog(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' '));
};

console.warn = (...args) => {
  originalConsoleWarn(...args);
  addLog(`WARN: ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`);
};

console.error = (...args) => {
  originalConsoleError(...args);
  addLog(`ERROR: ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : arg).join(' ')}`);
};