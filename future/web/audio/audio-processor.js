// future/web/audio-processor.js
import { settings } from "../core/state.js";
import { dispatchEvent } from "../core/dispatcher.js";
import { structuredLog } from "../utils/logging.js";  // Add for detailed logging.

let audioContext = null;
let isAudioInitialized = false;
let oscillators = [];
let modulators = [];
let micSource = null;
let micGainNode = null;

export function setAudioContext(newContext) {
  audioContext = newContext;
  isAudioInitialized = false;
}

export async function initializeAudio(context) {
  if (isAudioInitialized || !context) {
    structuredLog('WARN', 'initializeAudio: Already initialized or no context');
    return false;
  }
  try {
    audioContext = context;
    if (audioContext.state === "suspended") {
      structuredLog('INFO', 'initializeAudio: Resuming AudioContext');
      await audioContext.resume();
    }
    if (audioContext.state !== "running") {
      throw new Error(`AudioContext not running, state: ${audioContext.state}`);
    }
    oscillators = Array(24)
      .fill()
      .map(() => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const panner = audioContext.createStereoPanner();
        osc.type = "sine";
        osc.frequency.setValueAtTime(0, audioContext.currentTime);
        gain.gain.setValueAtTime(0, audioContext.currentTime);
        panner.pan.setValueAtTime(0, audioContext.currentTime);
        osc.connect(gain).connect(panner).connect(audioContext.destination);
        osc.start();
        return { osc, gain, panner, active: false };
      });
    isAudioInitialized = true;
    structuredLog('INFO', 'initializeAudio: Audio initialized with 24 oscillators');
    return true;
  } catch (error) {
    structuredLog('ERROR', 'initializeAudio error', { message: error.message });
    dispatchEvent('logError', { message: `Audio init error: ${error.message}` });
    isAudioInitialized = false;
    audioContext = null;
    return false;
  }
}

export async function playAudio(notes) {
  if (!isAudioInitialized || !audioContext || audioContext.state !== "running") {
    structuredLog('WARN', 'playAudio: Audio not initialized or context not running', {
      isAudioInitialized,
      audioContext: !!audioContext,
      state: audioContext?.state,
    });
    // Attempt to resume AudioContext on mobile (requires user gesture).
    if (audioContext && audioContext.state === "suspended") {
      try {
        await audioContext.resume();
        structuredLog('INFO', 'playAudio: Resumed AudioContext');
      } catch (err) {
        structuredLog('ERROR', 'playAudio: Failed to resume AudioContext', { message: err.message });
      }
    }
    return;
  }
  try {
    // Use cached engines loaded at startup
    const availableEngines = settings.availableEngines;
    const engine = availableEngines.find((e) => e.id === settings.synthesisEngine);
    if (!engine) {
      structuredLog('ERROR', `playAudio: Engine not found`, { synthesisEngine: settings.synthesisEngine });
      dispatchEvent('logError', { message: `Engine not found: ${settings.synthesisEngine}` });
      return;
    }
    const engineModule = await import(`./synthesis-engines/${engine.id}.js`);
    // Fix DEF-001: Normalize to camelCase (e.g., fm-synthesis -> playFmSynthesis).
    const engineName = engine.id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('');
    const playFunction = engineModule[`play${engineName}`];
    if (playFunction) {
      playFunction(notes);
      structuredLog('INFO', 'playAudio: Played notes', { engine: engine.id, noteCount: notes.length });
    } else {
      structuredLog('ERROR', `playAudio: Play function not found`, { engine: engine.id });
      dispatchEvent('logError', { message: `Play function for ${engine.id} not found` });
    }
  } catch (err) {
    structuredLog('ERROR', 'playAudio error', { message: err.message });
    dispatchEvent('logError', { message: `Play audio error: ${err.message}` });
  }
}

export async function cleanupAudio() {
  if (isAudioInitialized && audioContext) {
    try {
      oscillators.forEach(({ osc, gain, panner }) => {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
        panner.disconnect();
      });
      if (micSource && micGainNode) {
        micSource.disconnect();
        micGainNode.disconnect();
        micSource = null;
        micGainNode = null;
      }
      oscillators = [];
      // cleanup modulators
      modulators.forEach(({ osc, gain }) => {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
      });
      modulators = [];
      // Fully close AudioContext to release system resources
      await audioContext.close();
      audioContext = null;
      isAudioInitialized = false;
      structuredLog('INFO', 'cleanupAudio: Audio resources cleaned up and context closed');
    } catch (err) {
      structuredLog('ERROR', 'cleanupAudio error', { message: err.message });
      dispatchEvent('logError', { message: `Cleanup audio error: ${err.message}` });
    }
  }
}

export async function stopAudio() {
  await cleanupAudio();
}

export function initializeMicAudio(micStream) {
  if (!audioContext || !isAudioInitialized) {
    structuredLog('WARN', 'initializeMicAudio: Audio context not initialized');
    dispatchEvent('logError', { message: 'Audio context not initialized for microphone' });
    return null;
  }
  try {
    if (micSource && micGainNode) {
      micSource.disconnect();
      micGainNode.disconnect();
      micSource = null;
      micGainNode = null;
    }
    if (micStream) {
      micSource = audioContext.createMediaStreamSource(micStream);
      micGainNode = audioContext.createGain();
      micGainNode.gain.setValueAtTime(0.7, audioContext.currentTime);
      micSource.connect(micGainNode).connect(audioContext.destination);
      structuredLog('INFO', 'initializeMicAudio: Microphone stream connected', { gain: 0.7 });
      return micSource;
    }
    structuredLog('INFO', 'initializeMicAudio: Microphone stream disconnected');
    return null;
  } catch (error) {
    structuredLog('ERROR', 'initializeMicAudio error', { message: error.message });
    dispatchEvent('logError', { message: `Microphone init error: ${error.message}` });
    return null;
  }
}

export { audioContext, isAudioInitialized, oscillators, modulators };