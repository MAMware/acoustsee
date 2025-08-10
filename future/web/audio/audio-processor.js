import { settings } from "../core/state.js";
import { dispatchEvent } from "../core/dispatcher.js";
import { structuredLog } from "../utils/logging.js";  // Add for detailed logging.

let audioContext = null;
let isAudioInitialized = false;
let oscillators = [];
let oscillatorPool = [];
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
    // Determine max notes from grids
    let maxNotes = 24;
    if (settings.availableGrids && Array.isArray(settings.availableGrids)) {
      maxNotes = Math.max(...settings.availableGrids.map(g => g.maxNotes || 24));
    }
    oscillatorPool = [];
    for (let i = 0; i < maxNotes; i++) {
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const panner = audioContext.createStereoPanner();
      osc.type = "sine";
      osc.frequency.setValueAtTime(0, audioContext.currentTime);
      gain.gain.setValueAtTime(0, audioContext.currentTime);
      panner.pan.setValueAtTime(0, audioContext.currentTime);
      osc.connect(gain).connect(panner).connect(audioContext.destination);
      osc.start();
      oscillatorPool.push({ osc, gain, panner, active: false });
    }
    oscillators = oscillatorPool;
    isAudioInitialized = true;
    structuredLog('INFO', `initializeAudio: Audio initialized with ${maxNotes} oscillators`);
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
    }activeCount = 0;
    notes.forEach((note, i) => {
      let oscObj = oscillatorPool.find(o => !o.active);
      if (!oscObj) {
        // If pool exhausted, create new
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const panner = audioContext.createStereoPanner();
        osc.type = "sine";
        osc.connect(gain).connect(panner).connect(audioContext.destination);
        osc.start();
    // --- Oscillator Pool: Reuse inactive oscillators ---
    let 
        oscObj = { osc, gain, panner, active: false };
        oscillatorPool.push(oscObj);
      }
      oscObj.active = true;
      oscObj.osc.frequency.setValueAtTime(note.frequency, audioContext.currentTime);
      oscObj.gain.gain.setValueAtTime(note.velocity || 0.5, audioContext.currentTime);
      oscObj.panner.pan.setValueAtTime(note.pan || 0, audioContext.currentTime);
      activeCount++;
    });
    // Deactivate unused oscillators
    oscillatorPool.forEach((oscObj, i) => {
      if (i >= notes.length && oscObj.active) {
        oscObj.gain.gain.setValueAtTime(0, audioContext.currentTime);
        oscObj.active = false;
      }
    });
    structuredLog('INFO', 'playAudio: Played notes with oscillator pool', { engine: engine.id, noteCount: notes.length, poolSize: oscillatorPool.length });
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