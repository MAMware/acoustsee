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
  const ctx = DOM.imageCanvas.getContext('2d', { willReadFrequently: true });
  // ... rest unchanged
}
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
