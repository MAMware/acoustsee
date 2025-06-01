/**
 * Processes video frames for audio synthesis, converting video input to grayscale data.
 * Placed in ui/ due to tight coupling with videoFeed and imageCanvas elements.
 */
import { playAudio } from '../audio-processor.js';
import { skipFrame, setSkipFrame, prevFrameDataLeft, prevFrameDataRight, setPrevFrameDataLeft, setPrevFrameDataRight, frameCount, lastTime } from '../state.js';

/**
 * Processes a single video frame, converting it to grayscale and passing to audio synthesis.
 */
export function processFrame() {
    if (skipFrame) {
        setSkipFrame(false);
        return;
    }
    const videoFeed = document.getElementById('videoFeed');
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    const currentTime = performance.now();
    ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height); // Use dynamic canvas size
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const grayData = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
        grayData[i / 4] = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
    }
    const { prevFrameDataLeft: newLeft, prevFrameDataRight: newRight } = playAudio(
        grayData, canvas.width, canvas.height, prevFrameDataLeft, prevFrameDataRight
    );
    setPrevFrameDataLeft(newLeft);
    setPrevFrameDataRight(newRight);
    // Update frame count and last time for performance tracking
    frameCount++;
    lastTime = currentTime;
}