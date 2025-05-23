// web/ui-handlers.js
import { settings, stream, audioInterval, prevFrameDataLeft, prevFrameDataRight } from './state.js';
import { initializeAudio, playAudio } from './audio-processor.js';
import { mapFrameToTonnetz } from './tonnetz-grid.js';

export const settings = {
    updateInterval: 50,
    dayNightMode: 'day',
    autoMode: true
};
let stream = null;
let audioInterval = null;
let prevFrameDataLeft = null, prevFrameDataRight = null;

export function setupUI() {
    const fpsBtn = document.getElementById('fpsBtn');
    const modeBtn = document.getElementById('modeBtn');
    const autoModeBtn = document.getElementById('autoModeBtn');
    const startStopBtn = document.getElementById('startStopBtn');

    fpsBtn.addEventListener('dblclick', () => {
        // ... debug toggle logic ...
    });
    fpsBtn.addEventListener('touchstart', (event) => {
        // ... FPS interval logic ...
    });
    modeBtn.addEventListener('touchstart', (event) => {
        // ... day/night mode logic ...
    });
    autoModeBtn.addEventListener('touchstart', (event) => {
        // ... auto mode logic ...
    });
    startStopBtn.addEventListener('touchstart', async (event) => {
        // ... start/stop navigation logic ...
    });
}

export function processFrame() {
    const videoFeed = document.getElementById('videoFeed');
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoFeed, 0, 0, 64, 48);
    const imageData = ctx.getImageData(0, 0, 64, 48);
    const grayData = new Uint8ClampedArray(64 * 48);
    for (let i = 0; i < imageData.data.length; i += 4) {
        grayData[i / 4] = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
    }
    const { prevFrameDataLeft: newLeft, prevFrameDataRight: newRight } = playAudio(
        grayData, 64, 48, prevFrameDataLeft, prevFrameDataRight, settings
    );
    prevFrameDataLeft = newLeft;
    prevFrameDataRight = newRight;
}
