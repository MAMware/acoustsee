import { settings } from "../state.js";
import { mapFrameToNotes } from "../frame-processor.js";
import { playAudio } from "../audio-processor.js";
import { dispatchEvent } from "./event-dispatcher.js";
import { getDOM } from "../context.js";

let prevFrameDataLeft = null;
let prevFrameDataRight = null;

export async function processFrame(width, height) {
  // Retrieve DOM references from shared context
  const DOM = getDOM();
  try {
    const canvas = DOM.frameCanvas;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    // Validate context and dimensions
    if (!context || width <= 0 || height <= 0) {
      const msg = context ? "Invalid dimensions for frame processing" : "Canvas context not found";
      console.error(msg);
      dispatchEvent("logError", { message: msg });
      return { notes: [], newFrameData: null, avgIntensity: 0 };  // Early return with dummy
    }
    // Use integer dimensions for canvas
    const w = Math.floor(width);
    const h = Math.floor(height);
    canvas.width = w;
    canvas.height = h;
    context.drawImage(DOM.videoFeed, 0, 0, width, height);
    const frameData = context.getImageData(0, 0, width, height).data;
    const { notes, prevFrameDataLeft: newLeft, prevFrameDataRight: newRight } = await mapFrameToNotes(
      frameData,
      width,
      h,
      prevFrameDataLeft,
      prevFrameDataRight
    );
    await playAudio(notes);
    prevFrameDataLeft = newLeft;
    prevFrameDataRight = newRight;
  } catch (err) {
    console.error("processFrame error:", err.message);
    dispatchEvent("logError", { message: `Frame processing error: ${err.message}` });
  }
}

export async function cleanupFrameProcessor() {
  prevFrameDataLeft = null;
  prevFrameDataRight = null;
  console.log("cleanupFrameProcessor: Frame processor cleaned up");
}