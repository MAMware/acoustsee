/**
 * Processes video frames for audio synthesis, converting video input to grayscale data.
 * Placed in ui/ due to tight coupling with videoFeed and imageCanvas elements.
 */
import { playAudio } from '../audio-processor.js';
import { skipFrame, setSkipFrame, prevFrameDataLeft, prevFrameDataRight, setPrevFrameDataLeft, setPrevFrameDataRight } from '../state.js';

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
    ctx.drawImage(videoFeed, 0, 0, 64, 48);
    const imageData = ctx.getImageData(0, 0, 64, 48);
    const grayData = new Uint8ClampedArray(64 * 48);
    for (let i = 0; i < imageData.data.length; i += 4) {
        grayData[i / 4] = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
    }
    const { prevFrameDataLeft: newLeft, prevFrameDataRight: newRight } = playAudio(
        grayData, 64, 48, prevFrameDataLeft, prevFrameDataRight
    );
    setPrevFrameDataLeft(newLeft);
    setPrevFrameDataRight(newRight);
}
