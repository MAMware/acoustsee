import { structuredLog } from "../utils/logging.js";
import { settings, setAudioInterval } from "../state.js";
import { getText } from "./utils.js";
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
    const context = canvas.getContext("2d", { willReadFrequently: true });
    structuredLog('DEBUG', 'processFrame dimensions', { rawWidth: width, rawHeight: height });
    if (!context || !Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
      const msg = context ? "Invalid dimensions for frame processing" : "Canvas context not found";
      console.error(msg);
      dispatchEvent("logError", { message: msg });
      consecutiveErrors++;
      if (consecutiveErrors >= maxConsecutiveErrors && settings.audioTimerId) {
        structuredLog('WARN', 'Paused frame processing due to repeated invalid dimensions');
        clearInterval(settings.audioTimerId);
        setAudioInterval(null);
        dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: false, micActive: !!settings.micStream });
        await getText('button1.tts.cameraError');
      }
      return { notes: [], newFrameData: null, avgIntensity: 0 };  // Early return with dummy
    }
    // Reset counter on valid dimensions
    consecutiveErrors = 0;
    // Use integer dimensions for canvas
    const w = Math.floor(width);
    const h = Math.floor(height);
    canvas.width = w;
    canvas.height = h;
    context.drawImage(DOM.videoFeed, 0, 0, w, h);
    const frameData = context.getImageData(0, 0, w, h).data;
    const { notes, prevFrameDataLeft: newLeft, prevFrameDataRight: newRight } = await mapFrameToNotes(
      frameData, w, h, prevFrameDataLeft, prevFrameDataRight
    );
    await playAudio(notes);
    prevFrameDataLeft = newLeft;
    prevFrameDataRight = newRight;
    return { notes, newFrameData: frameData, avgIntensity: 0 };
  } catch (err) {
    structuredLog('ERROR', 'processFrame error', { message: err.message });
    console.error("processFrame error:", err.message);
    dispatchEvent("logError", { message: `Frame processing error: ${err.message}` });
    consecutiveErrors++;
    if (consecutiveErrors >= maxConsecutiveErrors && settings.audioTimerId) {
      structuredLog('WARN', 'Paused frame processing due to repeated errors', { message: err.message });
      clearInterval(settings.audioTimerId);
      setAudioInterval(null);
      dispatchEvent('updateUI', { settingsMode: settings.isSettingsMode, streamActive: false, micActive: !!settings.micStream });
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
