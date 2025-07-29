import { structuredLog } from "../utils/logging.js";
import { settings, setAudioInterval } from "../state.js";
import { mapFrameToNotes } from "../frame-processor.js";
import { playAudio } from "../audio-processor.js";
import { dispatchEvent } from "./event-dispatcher.js";
import { getDOM } from "../context.js";

let prevFrameDataLeft = null;
let prevFrameDataRight = null;

let consecutiveErrors = 0;
const maxConsecutiveErrors = 10; // Pause after 10 failed frames

export async function processFrame(width, height) {
  // Retrieve DOM references from shared context
  const DOM = getDOM();
  try {
    const canvas = DOM.frameCanvas;
    structuredLog('DEBUG', 'processFrame dimensions', { rawWidth: width, rawHeight: height });
    const context = canvas.getContext("2d", { willReadFrequently: true });
    // Validate context and dimensions
    if (!context || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      const msg = context ? "Invalid dimensions for frame processing" : "Canvas context not found";
      console.error(msg);
      dispatchEvent("logError", { message: msg });
      consecutiveErrors++;
      if (consecutiveErrors >= maxConsecutiveErrors && settings.stream) {
        structuredLog('WARN', 'Paused frame processing due to repeated invalid dimensions');
        clearInterval(settings.audioTimerId);
        setAudioInterval(null);
        await getText('button1.tts.cameraError');
      }
      return { notes: [], newFrameData: null, avgIntensity: 0 };  // Early return with dummy
    }
    // Reset error counter on valid dimensions
    consecutiveErrors = 0;
    // Use integer dimensions for canvas
    const w = Math.floor(width);
    const h = Math.floor(height);
    canvas.width = w;
    canvas.height = h;
    context.drawImage(DOM.videoFeed, 0, 0, width, height);
    const frameData = context.getImageData(0, 0, width, height).data;
    const { notes, newFrameDataLeft, newFrameDataRight } = await mapFrameToNotes( // Renamed for clarity
      frameData, w, h, prevFrameDataLeft, prevFrameDataRight
    );
    await playAudio(notes);
    prevFrameDataLeft = newLeft;
    prevFrameDataRight = newRight;
    return { notes, newFrameData: frameData, avgIntensity };
  } catch (err) {
    structuredLog('WARN', 'Paused frame processing due to repeated errors', { message: err.message });
    console.error("processFrame error:", err.message);
    dispatchEvent("logError", { message: `Frame processing error: ${err.message}` });
    consecutiveErrors++;
    if (consecutiveErrors >= maxConsecutiveErrors && settings.stream) {
      clearInterval(settings.audioTimerId);
      setAudioInterval(null);
            await getText('button1.tts.cameraError');
    }
    return { notes: [], newFrameData: null, avgIntensity: 0 };
  }
}

export async function cleanupFrameProcessor() {
  prevFrameDataLeft = null;
  prevFrameDataRight = null;
  consecutiveErrors = 0; // Reset on cleanup
  console.log("cleanupFrameProcessor: Frame processor cleaned up");
}
