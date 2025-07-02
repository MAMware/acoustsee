// state.js
import { availableGrids, availableEngines, availableLanguages } from "./config.js";

export let settings = {
  gridType: availableGrids[0].id, // Default to first grid
  synthesisEngine: availableEngines[0].id, // Default to first engine
  language: availableLanguages[0].id, // Default to first language
  isSettingsMode: false,
  stream: null,
  micStream: null,
  autoFPS: true,
  updateInterval: 1000 / 30,
  audioInterval: null,
  dayNightMode: "day"
};

export let frameCount = 0;
export let prevFrameDataLeft = null;
export let prevFrameDataRight = null;
export let skipFrame = false;

export function setStream(stream) {
  settings.stream = stream;
}

export function setAudioInterval(interval) {
  settings.audioInterval = interval;
}

export function setFrameCount(count) {
  frameCount = count;
}

export function setPrevFrameDataLeft(data) {
  prevFrameDataLeft = data;
}

export function setPrevFrameDataRight(data) {
  prevFrameDataRight = data;
}

export function setSkipFrame(value) {
  skipFrame = value;
}