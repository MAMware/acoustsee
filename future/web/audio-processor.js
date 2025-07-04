import { settings } from "./state.js";
import { mapFrame } from "./grid-dispatcher.js";
import { availableEngines } from "./config.js";

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

export async function playAudio(frameData, width, height, prevFrameDataLeft, prevFrameDataRight) {
  if (!isAudioInitialized || !audioContext || audioContext.state !== "running") {
    console.warn("playAudio: Audio not initialized or context not running");
    return { prevFrameDataLeft, prevFrameDataRight };
  }
  try {
    const halfWidth = width / 2;
    const leftFrame = new Uint8ClampedArray(halfWidth * height);
    const rightFrame = new Uint8ClampedArray(halfWidth * height);
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < halfWidth; x++) {
        leftFrame[y * halfWidth + x] = frameData[y * width + x];
        rightFrame[y * halfWidth + x] = frameData[y * width + x + halfWidth];
      }
    }
    const leftResult = mapFrame(leftFrame, halfWidth, height, prevFrameDataLeft, -1);
    const rightResult = mapFrame(rightFrame, halfWidth, height, prevFrameDataRight, 1);
    const allNotes = [...(leftResult.notes || []), ...(rightResult.notes || [])];
    const engine = availableEngines.find((e) => e.id === settings.synthesisEngine);
    if (engine) {
      const module = await import(engine.file);
      const playFunction = module[engine.exportName];
      if (playFunction) {
        playFunction(allNotes, audioContext, oscillators);
      } else {
        console.error(`Play function ${engine.exportName} not found`);
      }
    }
    return {
      prevFrameDataLeft: leftResult.newFrameData,
      prevFrameDataRight: rightResult.newFrameData,
    };
  } catch (err) {
    console.error("playAudio error:", err.message);
    return { prevFrameDataLeft, prevFrameDataRight };
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