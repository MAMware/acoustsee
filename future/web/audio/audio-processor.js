import { settings } from "../core/state.js";
import { dispatchEvent } from "../core/dispatcher.js";
import { structuredLog } from "../utils/logging.js";  // Add for detailed logging.

// New helper to resize oscillator pool based on grid maxNotes, capped at 100
export function resizeOscillatorPool(newMax) {
  const cap = Math.min(newMax, 100);
  const current = oscillatorPool.length;
  if (cap > current) {
    for (let i = current; i < cap; i++) {
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
    structuredLog('INFO', 'resizeOscillatorPool: Expanded osc pool', { from: current, to: cap });
  } else if (cap < current) {
    for (let i = current - 1; i >= cap; i--) {
      const { osc, gain, panner } = oscillatorPool[i];
      osc.stop();
      osc.disconnect();
      gain.disconnect();
      panner.disconnect();
      oscillatorPool.pop();
    }
    structuredLog('INFO', 'resizeOscillatorPool: Shrunk osc pool', { from: current, to: cap });
  }
}

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

// Bind a shared AudioManager instance so this module can react to unlock/resume events.
export function bindAudioManager(audioManager) {
  if (!audioManager) return;
  try {
    // If audioManager already has a context, use it
    if (audioManager.context) setAudioContext(audioManager.context);
    // When the manager emits 'unlocked' or 'resumed', attempt initialization
    audioManager.on && audioManager.on('unlocked', async () => {
      try { await initializeAudio(audioManager.context); } catch(e) { /* handled below */ }
    });
    audioManager.on && audioManager.on('resumed', async () => {
      try { await initializeAudio(audioManager.context); } catch(e) { /* handled below */ }
    });
  } catch (e) {
    structuredLog('WARN', 'bindAudioManager failed', { message: e?.message || String(e) });
  }
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
      structuredLog('INFO', 'initializeAudio: AudioContext resumed');
    }
    if (audioContext.state !== "running") {
      throw new Error(`AudioContext not running, state: ${audioContext.state}`);
    }
    // --- THIS IS THE CORRECTED LOGIC ---
    // Initialize the oscillator pool based on the global, decoupled setting.
    resizeOscillatorPool(settings.maxNotes);
    oscillators = oscillatorPool; // Ensure the legacy 'oscillators' array is also updated.
    isAudioInitialized = true;
    structuredLog('INFO', `initializeAudio: Audio initialized with a pool size of ${settings.maxNotes}.`);
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
  // Ensure AudioContext is running, with configurable resume attempts
  const maxAttempts = settings.audioResumeAttempts || 2;
  const resumeDelay = settings.audioResumeDelayMs || 100;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (!audioContext) {
      structuredLog('WARN', 'playAudio: No AudioContext available');
      return;
    }
    if (audioContext.state === 'running') {
      if (!isAudioInitialized) {
        structuredLog('WARN', 'playAudio: Audio not initialized', { isAudioInitialized });
        return;
      }
      break; // ready to play
    }
    if (audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        structuredLog('INFO', 'playAudio: Resumed suspended AudioContext');
        break;
      } catch (err) {
        structuredLog('ERROR', 'playAudio: Failed to resume AudioContext', { message: err.message });
        dispatchEvent('logError', { message: `Audio resume failed: ${err.message}` });
        if (attempt < maxAttempts) {
          await new Promise(r => setTimeout(r, resumeDelay));
          continue;
        }
        // Final failure fallback
        structuredLog('ERROR', 'playAudio: Unable to resume AudioContext after retries');
        dispatchEvent('audioError', { message: 'Audio unavailable—tap to retry' });
        return;
      }
    }
    // Unexpected state (closed/interrupted)
    structuredLog('WARN', 'playAudio: Invalid AudioContext state', { state: audioContext.state });
    return;
  }
  try {
    // --- REFACTOR: Replace dynamic import with a simple, synchronous find ---
    const engine = settings.availableEngines.find((e) => e.id === settings.synthesisEngine);
    if (!engine || typeof engine.playFunction !== 'function') {
      structuredLog('ERROR', `playAudio: Engine or playFunction not found`, { synthesisEngine: settings.synthesisEngine });
      dispatchEvent('logError', { message: `Engine not found: ${settings.synthesisEngine}` });
      return;
    }
   
    const playFunction = engine.playFunction; // Directly access the function
    const contextObj = {
      audioContext,
      getOscillator,
      oscillatorPool,
      modulators
    };

    playFunction(notes, contextObj);
    structuredLog('INFO', 'playAudio: Played notes', { engine: engine.id, noteCount: notes.length, poolSize: oscillatorPool.length });

  } catch (err) {
    structuredLog('ERROR', 'playAudio error', { message: err.message });
    dispatchEvent('logError', { message: `Play audio error: ${err.message}` });
  }
}

export async function cleanupAudio() {
  if (isAudioInitialized && audioContext) {
    try {
      oscillatorPool.forEach(({ osc, gain, panner }) => {
        osc.stop();
        osc.disconnect();
        gain.disconnect();
        panner.disconnect();
      });
      oscillatorPool = [];
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

/**
 * Get an oscillator from the pool, reusing inactive or recycling the oldest if the pool exceeds the cap.
 */
export function getOscillator() {
  const cap = 100; // Define a cap for the oscillator pool
  let oscObj = oscillatorPool.find(o => !o.active);

  if (!oscObj && audioContext) {
    if (oscillatorPool.length >= cap) {
      // Pool exhausted: recycle oldest inactive or oldest overall
      oscObj = oscillatorPool.find(o => !o.active) || oscillatorPool[0];
      if (oscObj) {
        oscObj.osc.frequency.setValueAtTime(0, audioContext.currentTime);
        oscObj.gain.gain.setValueAtTime(0, audioContext.currentTime);
        oscObj.panner.pan.setValueAtTime(0, audioContext.currentTime);
        oscObj.active = true;
        structuredLog('WARN', 'getOscillator: Pool exhausted, recycled oscillator', { poolSize: oscillatorPool.length });
        return oscObj;
      } else {
        structuredLog('ERROR', 'getOscillator: Pool exhausted, no oscillator available', { poolSize: oscillatorPool.length });
        return null;
      }
    } else {
      // Create a new oscillator if under the cap
      const osc = audioContext.createOscillator();
      const gain = audioContext.createGain();
      const panner = audioContext.createStereoPanner();
      osc.type = "sine";
      osc.connect(gain).connect(panner).connect(audioContext.destination);
      osc.start();
      oscObj = { osc, gain, panner, active: true };
      oscillatorPool.push(oscObj);
      structuredLog('INFO', 'getOscillator: Created new oscillator', { poolSize: oscillatorPool.length });
      return oscObj;
    }
  }

  if (oscObj) {
    oscObj.active = true;
    structuredLog('INFO', 'getOscillator: Retrieved oscillator from pool', { poolSize: oscillatorPool.length });
    return oscObj;
  } else {
    structuredLog('WARN', 'getOscillator: No available oscillator found');
    return null;
  }
}

/**
 * Release an oscillator back to the pool, marking it as inactive.
 */
export function releaseOscillator(oscObj) {
  if (oscObj) {
    oscObj.active = false;
    structuredLog('INFO', 'releaseOscillator: Oscillator released back to pool', { poolSize: oscillatorPool.length });
  }
}