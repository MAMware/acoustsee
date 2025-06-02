  import { DOM } from './dom.js';
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
  if (!DOM.videoFeed || !DOM.imageCanvas) {
    console.error('Missing videoFeed or imageCanvas elements');
    return;
  }
  const currentTime = performance.now();
  const deltaTime = currentTime - lastTime;
  if (deltaTime < settings.updateInterval) {
    setSkipFrame(true);
    return;
  }
  try {
    const ctx = DOM.imageCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(DOM.videoFeed, 0, 0, DOM.imageCanvas.width, DOM.imageCanvas.height);
    const imageData = ctx.getImageData(0, 0, DOM.imageCanvas.width, DOM.imageCanvas.height);
    const grayData = new Uint8ClampedArray(DOM.imageCanvas.width * DOM.imageCanvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      grayData[i / 4] = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
    }
    const { prevFrameDataLeft: newLeft, prevFrameDataRight: newRight } = playAudio(
      grayData, DOM.imageCanvas.width, DOM.imageCanvas.height, prevFrameDataLeft, prevFrameDataRight
    );
    setPrevFrameDataLeft(newLeft);
    setPrevFrameDataRight(newRight);
    frameCount++;
    lastTime = currentTime;
  } catch (err) {
    console.error('Frame processing error:', err);
    dispatchEvent('logError', { message: `Frame processing error: ${err.message}` });
    setSkipFrame(true);
  }
}
