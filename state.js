export const settings = {
    updateInterval: 50,
    dayNightMode: 'day',
    gridType: 'hex-tonnetz', // Default grid layout
    synthesisEngine: 'sine-wave' // Default synthesis engine
};
export let stream = null;
export let audioInterval = null;
export let prevFrameDataLeft = null;
export let prevFrameDataRight = null;
