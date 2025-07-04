import { settings, setFrameCount, setPrevFrameDataLeft, setPrevFrameDataRight, setSkipFrame } from '../state.js';
import { playAudio } from '../audio-processor.js';
import { getDispatchEvent } from '../context.js';

export async function processFrame(videoElement, { context }) {
  if (!videoElement || !context) {
    console.error('Invalid video element or context');
    return;
  }
  const dispatchEvent = getDispatchEvent();
  let lastTime = 0;
  async function process(timestamp) {
    if (settings.skipFrame) {
      if (settings.debugLogging) console.log('Skipping frame');
      return requestAnimationFrame(process);
    }
    const deltaTime = timestamp - lastTime;
    const targetInterval = settings.autoFPS ? 1000 / 30 : settings.updateInterval;
    if (deltaTime < targetInterval) {
      return requestAnimationFrame(process);
    }
    lastTime = timestamp - (deltaTime % targetInterval);
    try {
      setFrameCount(frameCount + 1);
      if (settings.debugLogging) console.log('Processing frame:', frameCount);
      const width = videoElement.videoWidth;
      const height = videoElement.videoHeight;
      if (!width || !height) {
        if (settings.debugLogging) console.log('Invalid video dimensions');
        return requestAnimationFrame(process);
      }
      context.drawImage(videoElement, 0, 0, width, height);
      const frameData = context.getImageData(0, 0, width, height).data;
      if (settings.debugLogging) console.log('Frame data captured:', frameData.length);
      const { prevFrameDataLeft, prevFrameDataRight } = await playAudio(
        frameData,
        width,
        height,
        prevFrameDataLeft,
        prevFrameDataRight
      );
      setPrevFrameDataLeft(prevFrameDataLeft);
      setPrevFrameDataRight(prevFrameDataRight);
      if (settings.debugLogging) console.log('Frame processed:', { prevFrameDataLeft, prevFrameDataRight });
      setSkipFrame(false);
    } catch (err) {
      console.error('Frame processing error:', err.message);
      dispatchEvent('logError', { message: `Frame processing error: ${err.message}` });
      setSkipFrame(true);
    }
    return requestAnimationFrame(process);
  }
  return processFrameInner(process);
}

function processFrameInner(process) {
  let animationFrameId = null;
  const startProcessing = () => {
    animationFrameId = requestAnimationFrame(process);
  };
  startProcessing();
  return () => {
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
  };
}