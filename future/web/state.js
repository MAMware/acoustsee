export const settings = {
  audioInterval: null,
  updateInterval: 50,
  autoFPS: false, // Auto FPS mode
  language: 'en-US',
  synthesisEngine: 'sine-wave',
  stream: null,
  gridType: 'circle-of-fifths',
  dayNightMode: 'day',
  isSettingsMode: false
};

export let skipFrame = false;
export let prevFrameDataLeft = null;
export let prevFrameDataRight = null;
export let frameCount = 0;
export let lastTime = performance.now();

export function setStream(stream) {
  settings.stream = stream;
}

export function setAudioInterval(interval) {
  settings.audioInterval = interval;
}

export function setSkipFrame(skip) {
  skipFrame = skip;
}

export function setPrevFrameDataLeft(data) {
  prevFrameDataLeft = data;
}

export function setPrevFrameDataRight(data) {
  prevFrameDataRight = data;
}
