// future/web/audio-processor.js
import { settings } from "./state.js";
import { dispatchEvent } from "./ui/event-dispatcher.js";

let audioContext = null;
let isAudioInitialized = false;
let oscillators = [];
let micSource = null;
let micGainNode = null;

export function setAudioContext(newContext) {
  audioContext = newContext;
  isAudioInitialized = false;
}

export async function initializeAudio(context) {
  if (isAudioInitialized || !context) {
    console.warn("initializeAudio: Already initialized or no context");
    return false;
  }
  try {
    audioContext = context;
    if (audioContext.state === "suspended") {
      console.log("initializeAudio: Resuming AudioContext");
      await audioContext.resume();
    }
    if (audioContext.state !== "running") {
      throw new Error(`AudioContext is not running, state: ${audioContext.state}`);
    }
    oscillators = Array(24)
      .fill()
      .map(() => {
        const osc = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const panner = audioContext.createStereoPanner();
        osc.connect(gain).connect(panner).connect(audioContext.destination);
        osc.start();
        return { osc, gain, panner, active: false };
      });
    isAudioInitialized = true;
    console.log("initializeAudio: Audio initialized successfully");
    return true;
  } catch (error) {
    console.error("Audio Initialization Error:", error.message);
    dispatchEvent("logError", { message: `Audio init error: ${error.message}` });
    isAudioInitialized = false;
    audioContext = null;
    return false;
  }
}

export async function playAudio(notes) {
  if (!isAudioInitialized || !audioContext || audioContext.state !== "running") {
    console.warn("playAudio: Audio not initialized or context not running");
    return;
  }
  try {
    const enginesResponse = await fetch("./synthesis-methods/engines/availableEngines.json");
    if (!enginesResponse.ok) throw new Error(`Failed to load availableEngines.json: ${enginesResponse.status}`);
    const availableEngines = await enginesResponse.json();
    const engine = availableEngines.find((e) => e.id === settings.synthesisEngine);
    if (!engine) {
      console.error(`Engine not found: ${settings.synthesisEngine}`);
      return;
    }
    const engineModule = await import(`./synthesis-methods/engines/${engine.id}.js`);
    const playFunction = engineModule[`play${engine.id.split('-').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join('')}`];
    if (playFunction) {
      playFunction(notes, audioContext, oscillators);
    } else {
      console.error(`Play function for ${engine.id} not found`);
    }
  } catch (err) {
    console.error("playAudio error:", err.message);
    dispatchEvent("logError", { message: `Play audio error: ${err.message}` });
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
      }
      oscillators = [];
      micSource = null;
      micGainNode = null;
      isAudioInitialized = false;
      console.log("cleanupAudio: Audio resources cleaned up");
    } catch (err) {
      console.error("cleanupAudio error:", err.message);
      dispatchEvent("logError", { message: `Cleanup audio error: ${err.message}` });
    }
  }
}

export async function stopAudio() {
  await cleanupAudio();
}

export function initializeMicAudio(micStream) {
  if (!audioContext || !isAudioInitialized) {
    console.warn("initializeMicAudio: Audio context not initialized");
    dispatchEvent("logError", { message: "Audio context not initialized for microphone" });
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
      console.log("initializeMicAudio: Microphone stream connected");
      return micSource;
    }
    console.log("initializeMicAudio: No microphone stream provided");
    return null;
  } catch (error) {
    console.error("initializeMicAudio error:", error.message);
    dispatchEvent("logError", { message: `Microphone init error: ${error.message}` });
    return null;
  }
}

export { audioContext, isAudioInitialized, oscillators };