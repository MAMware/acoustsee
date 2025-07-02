// audio-processor.js
import { settings } from "./state.js";
import { mapFrame } from "./grid-dispatcher.js";
import { availableEngines } from "./config.js";

let audioContext = null;
let isAudioInitialized = false;
let oscillators = [];
let micSource = null;

function setAudioContext(newContext) {
  audioContext = newContext;
  isAudioInitialized = false;
}

async function initializeAudio(context) {
  if (isAudioInitialized || !context) {
    console.warn("initializeAudio: Already initialized or no context provided");
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
        osc.type = "sine";
        osc.frequency.setValueAtTime(0, audioContext.currentTime);
        gain.gain.setValueAtTime(0, audioContext.currentTime);
        panner.pan.setValueAtTime(0, audioContext.currentTime);
        osc.connect(gain).connect(panner).connect(audioContext.destination);
        osc.start();
        return { osc, gain, panner, active: false };
      });
    isAudioInitialized = true;
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance("Audio initialized");
      utterance.lang = settings.language || "en-US";
      window.speechSynthesis.speak(utterance);
    }
    console.log("initializeAudio: Audio initialized successfully");
    return true;
  } catch (error) {
    console.error("Audio Initialization Error:", error.message);
    if (window.dispatchEvent) {
      window.dispatchEvent("logError", {
        message: `Audio init error: ${error.message}`,
      });
    }
    isAudioInitialized = false;
    audioContext = null;
    if (window.speechSynthesis) {
      const utterance = new SpeechSynthesisUtterance("Failed to initialize audio");
      utterance.lang = settings.language || "en-US";
      window.speechSynthesis.speak(utterance);
    }
    return false;
  }
}

async function playAudio(frameData, width, height, prevFrameDataLeft, prevFrameDataRight) {
  if (!isAudioInitialized || !audioContext || audioContext.state !== "running") {
    console.warn("playAudio: Audio not initialized or context not running", {
      isAudioInitialized,
      audioContext: !!audioContext,
      state: audioContext?.state,
    });
    return { prevFrameDataLeft, prevFrameDataRight };
  }

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
    try {
      const module = await import(engine.file);
      const playFunction = module[engine.exportName];
      if (playFunction) {
        playFunction(allNotes);
      } else {
        console.error(`Play function ${engine.exportName} not found in ${engine.file}`);
      }
    } catch (err) {
      console.error(`Failed to load synthesis engine ${engine.id}:`, err.message);
    }
  } else {
    console.warn(`No synthesis engine found for ${settings.synthesisEngine}, falling back to sine-wave`);
    const module = await import("./synthesis-methods/engines/sine-wave.js");
    module.playSineWave(allNotes);
  }

  return {
    prevFrameDataLeft: leftResult.newFrameData,
    prevFrameDataRight: rightResult.newFrameData,
  };
}

async function cleanupAudio() {
  if (!isAudioInitialized || !audioContext) {
    console.warn("cleanupAudio: No audio context to clean up");
    return;
  }
  try {
    oscillators.forEach(({ osc, gain, panner }) => {
      gain.gain.setValueAtTime(0, audioContext.currentTime);
      osc.stop(audioContext.currentTime + 0.1);
      osc.disconnect();
      gain.disconnect();
      panner.disconnect();
      if (osc.frequency?.connectedNodes) {
        osc.frequency.connectedNodes.forEach((node) => {
          if (node instanceof OscillatorNode) {
            node.stop(audioContext.currentTime + 0.1);
            node.disconnect();
          }
        });
      }
    });
    if (micSource) {
      micSource.disconnect();
      micSource = null;
    }
    oscillators = [];
    isAudioInitialized = false;
    audioContext = null;
    console.log("cleanupAudio: Audio resources cleaned up successfully");
  } catch (error) {
    console.error("Audio Cleanup Error:", error.message);
    if (window.dispatchEvent) {
      window.dispatchEvent("logError", {
        message: `Audio cleanup error: ${error.message}`,
      });
    }
  }
}

async function stopAudio() {
  await cleanupAudio();
}

function initializeMicAudio(micStream) {
  if (!audioContext || !isAudioInitialized) {
    console.warn("initializeMicAudio: Audio context not initialized");
    if (window.dispatchEvent) {
      window.dispatchEvent("logError", {
        message: "Audio context not initialized for microphone",
      });
    }
    return null;
  }
  try {
    if (micStream) {
      micSource = audioContext.createMediaStreamSource(micStream);
      const gain = audioContext.createGain();
      gain.gain.setValueAtTime(1, audioContext.currentTime);
      micSource.connect(gain).connect(audioContext.destination);
      console.log("initializeMicAudio: Microphone stream connected to output");
      return micSource;
    } else {
      if (micSource) {
        micSource.disconnect();
        micSource = null;
      }
      console.log("initializeMicAudio: No microphone stream provided, disconnected");
      return null;
    }
  } catch (error) {
    console.error("initializeMicAudio: Error initializing microphone:", error.message);
    if (window.dispatchEvent) {
      window.dispatchEvent("logError", {
        message: `Microphone init error: ${error.message}`,
      });
    }
    return null;
  }
}

export {
  setAudioContext,
  initializeAudio,
  playAudio,
  cleanupAudio,
  stopAudio,
  initializeMicAudio,
  audioContext,
  isAudioInitialized,
  oscillators
};