export let settings = {
  audioInterval: null,
  updateInterval: 50,
  autoFPS: false,
  language: 'en-US',
  synthesisEngine: 'sine-wave',
  stream: null,
  micStream: null,
  gridType: 'circle-of-fifths',
  dayNightMode: 'day',
  isSettingsMode: false
};

export let skipFrame = false;
export let frameCount = 0;
export let lastTime = 0;
export let prevFrameDataLeft = null;
export let prevFrameDataRight = null;

export function setStream(stream) {
  settings.stream = stream;
}

export function setAudioInterval(interval) {
  settings.audioInterval = interval;
}

export function setSkipFrame(value) {
  skipFrame = value;
}

export function setFrameCount(value) {
  console.log(`Setting frameCount to ${value} (was ${frameCount})`);
  frameCount = value;
}

export function setPrevFrameDataLeft(data) {
  prevFrameDataLeft = data;
}

export function setPrevFrameDataRight(data) {
  prevFrameDataRight = data;
}
