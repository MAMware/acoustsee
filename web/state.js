export const settings = {
    updateInterval: 50,
    dayNightMode: 'day',
    gridType: 'hex-tonnetz',
    synthesisEngine: 'sine-wave',
    language: 'en-US'
};
export let stream = null;
export let audioInterval = null;
export let prevFrameDataLeft = null;
export let prevFrameDataRight = null;

export function setStream(newStream) {
    stream = newStream;
}

export function setAudioInterval(newInterval) {
    audioInterval = newInterval;
}
