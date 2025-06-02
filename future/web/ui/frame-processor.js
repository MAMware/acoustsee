 /**
 * Processes video frames for audio synthesis, converting video input to grayscale data.
 * Placed in ui/ due to interaction with videoFeed and imageCanvas elements.
 */
import { playAudio } from '../audio-processor.js';
import { skipFrame, setSkipFrame, prevFrameDataLeft, prevFrameDataRight, setPrevFrameDataLeft, setPrevFrameDataRight, frameCount, lastTime } from '../state.js';
import { DOM } from './dom.js';

/**
 * Processes a single video frame, converting it to grayscale and passing to audio synthesis.
 * @param {HTMLVideoElement} videoFeed - The video element providing frames.
 * @param {HTMLCanvasElement} canvas - The canvas for drawing frames.
 */
export function processFrame(videoFeed = DOM.videoFeed, canvas = DOM.imageCanvas) {
  if (skipFrame) {
    setSkipFrame(false);
    return;
  }
  if (!videoFeed || !canvas) {
    console.error('Missing videoFeed or canvas elements');
    return;
  }
  const currentTime = performance.now();
  const deltaTime = currentTime - lastTime;
  if (deltaTime < settings.updateInterval) {
    setSkipFrame(true);
    return;
  }
  try {
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);
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
    frameCount++;
    lastTime = currentTime;
  } catch (err) {
    console.error('Frame processing error:', err);
    // Use dispatchEvent from rectangle-handlers.js if available
    if (window.dispatchEvent) {
      window.dispatchEvent('logError', { message: `Frame processing error: ${err.message}` });
    }
    setSkipFrame(true);
  }
}
