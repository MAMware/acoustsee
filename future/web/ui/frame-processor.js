/**
 * Processes video frames for audio synthesis, converting video input to grayscale data.
 * Placed in ui/ due to interaction with videoFeed and imageCanvas elements.
 */
import { playAudio } from "../audio-processor.js";
import {
  skipFrame,
  setSkipFrame,
  prevFrameDataLeft,
  prevFrameDataRight,
  setPrevFrameDataLeft,
  setPrevFrameDataRight,
  frameCount,
  lastTime,
  settings,
  setAudioInterval,
} from "../state.js";
import { getDispatchEvent } from "../context.js";
/**
 * Processes a single video frame, converting it to grayscale and passing to audio synthesis.
 * @param {HTMLVideoElement} videoFeed - The video element providing frames.
 * @param {HTMLCanvasElement} canvas - The canvas for drawing frames.
 */
export function processFrame(videoFeed, canvas, DOM) {
  if (skipFrame) {
    setSkipFrame(false);
    return;
  }
  if (!videoFeed || !canvas || !DOM) {
    console.error("Missing required parameters in processFrame:", {
      videoFeed,
      canvas,
      DOM,
    });
    if (DOM && window.dispatchEvent) {
      window.dispatchEvent("logError", {
        message: "Missing videoFeed, canvas, or DOM in processFrame",
      });
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
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    ctx.drawImage(videoFeed, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const grayData = new Uint8ClampedArray(canvas.width * canvas.height);
    for (let i = 0; i < imageData.data.length; i += 4) {
      grayData[i / 4] =
        (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
    }
    const { prevFrameDataLeft: newLeft, prevFrameDataRight: newRight } =
      playAudio(
        grayData,
        canvas.width,
        canvas.height,
        prevFrameDataLeft,
        prevFrameDataRight,
      );
    setPrevFrameDataLeft(newLeft);
    setPrevFrameDataRight(newRight);
    frameCount++;
    // Auto FPS adjustment
    if (settings.autoFPS) {
      console.time("autoFPS");
      const frameProcessingTime = performance.now() - frameProcessingStart;
      // Adjust updateInterval: target 16ms (60 FPS) to 50ms (20 FPS)
      if (frameProcessingTime > 40) {
        settings.updateInterval = Math.min(settings.updateInterval + 10, 50); // Lower FPS
      } else if (frameProcessingTime < 20 && settings.updateInterval > 16) {
        settings.updateInterval = Math.max(settings.updateInterval - 10, 16); // Raise FPS
      }
      // Update audio interval
      if (settings.audioInterval) {
        clearInterval(settings.audioInterval);
        setAudioInterval(
          setInterval(() => {
            dispatchEvent("processFrame");
          }, settings.updateInterval),
        );
      }
      console.timeEnd("autoFPS");
    }
    lastTime = currentTime;
  } catch (err) {
    console.error("Frame processing error:", err);
    if (window.dispatchEvent) {
      window.dispatchEvent("logError", {
        message: `Frame processing error: ${err.message}`,
      });
    }
    setSkipFrame(true);
  }
}
