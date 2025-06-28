import { playAudio } from '../audio-processor.js';
import { frameCount, lastTime, prevFrameDataLeft, prevFrameDataRight, setPrevFrameDataLeft, setPrevFrameDataRight, skipFrame, setSkipFrame, settings, setAudioInterval, setFrameCount } from '../state.js';
import { getDispatchEvent } from '../context.js';

let lastTTSTime = 0;
const ttsCooldown = 2000; // 2 seconds cooldown for TTS

export function processFrame(videoFeed, DOM) {
  if (skipFrame) {
    setSkipFrame(false);
    return;
  }
  if (!videoFeed || !DOM) {
    console.error('Missing required parameters in processFrame:', { videoFeed, DOM });
    if (DOM && getDispatchEvent()) {
      getDispatchEvent()('logError', { message: 'Missing videoFeed or DOM in processFrame' });
    }
    return;
  }
  const currentTime = performance.now();
  const deltaTime = currentTime - lastTime;
  if (deltaTime < settings.updateInterval) {
    setSkipFrame(true);
    return;
  }
  try {
    const frameProcessingStart = performance.now();
    // Create a temporary canvas to process video frame
    const tempCanvas = document.createElement('canvas');
    tempCanvas.width = videoFeed.videoWidth || 640;
    tempCanvas.height = videoFeed.videoHeight || 360;
    const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoFeed, 0, 0, tempCanvas.width, tempCanvas.height);
    const imageData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    const grayData = new Uint8ClampedArray(tempCanvas.width * tempCanvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      grayData[i / 4] = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
    }
    const { prevFrameDataLeft: newLeft, prevFrameDataRight: newRight } = playAudio(
      grayData, tempCanvas.width, tempCanvas.height, prevFrameDataLeft, prevFrameDataRight
    );
    setPrevFrameDataLeft(newLeft);
    setPrevFrameDataRight(newRight);
    setFrameCount(frameCount + 1);
    // Auto FPS adjustment
    if (settings.autoFPS) {
      console.time('autoFPS');
      const frameProcessingTime = performance.now() - frameProcessingStart;
      if (frameProcessingTime > 40) {
        settings.updateInterval = Math.min(settings.updateInterval + 10, 50);
        console.log(`Increased updateInterval to ${settings.updateInterval} due to slow frame processing: ${frameProcessingTime}ms`);
      } else if (frameProcessingTime < 20 && settings.updateInterval > 16) {
        settings.updateInterval = Math.max(settings.updateInterval - 10, 16);
        console.log(`Decreased updateInterval to ${settings.updateInterval} due to fast frame processing: ${frameProcessingTime}ms`);
      }
      if (settings.audioInterval) {
        clearInterval(settings.audioInterval);
        setAudioInterval(setInterval(() => {
          getDispatchEvent()('processFrame');
        }, settings.updateInterval));
      }
      // Throttle TTS for FPS updates
      if (currentTime - lastTTSTime > ttsCooldown) {
        console.log('Triggering updateUI from processFrame for autoFPS');
        getDispatchEvent()('updateUI', { settingsMode: settings.isSettingsMode, streamActive: !!settings.stream });
        lastTTSTime = currentTime;
      }
      console.timeEnd('autoFPS');
    }
    lastTime = currentTime;
  } catch (err) {
    console.error('Frame processing error:', err);
    if (getDispatchEvent()) {
      getDispatchEvent()('logError', { message: `Frame processing error: ${err.message}` });
    }
    setSkipFrame(true);
  }
}
