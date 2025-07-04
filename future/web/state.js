import { availableGrids, availableEngines, availableLanguages, availableUpdateIntervals } from './config.js';

export let settings = {
  debugLogging: false,
  stream: null,
  audioInterval: null,
  updateInterval: availableUpdateIntervals[0] || 50,
  autoFPS: true,
  gridType: availableGrids[0]?.id || 'circle-of-fifths',
  synthesisEngine: availableEngines[0]?.id || 'sine-wave',
  language: availableLanguages[0]?.id || 'en-US',
  isSettingsMode: false,
  micStream: null,
  ttsEnabled: true,
  dayNightMode: 'day'
};

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