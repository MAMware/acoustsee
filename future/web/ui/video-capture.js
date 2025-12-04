import { settings } from "../state.js";
import { mapFrameToNotes } from "../frame-processor.js";
import { playAudio } from "../audio-processor.js";
import { dispatchEvent } from "./event-dispatcher.js";

let prevFrameDataLeft = null;
let prevFrameDataRight = null;

export async function processFrame(DOM, width, height) {
  try {
    const canvas = DOM.frameCanvas;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) {
      console.error("Canvas context not found");
      dispatchEvent("logError", { message: "Canvas context not found" });
      return;
    }
    canvas.width = width;
    canvas.height = height;
    context.drawImage(DOM.videoFeed, 0, 0, width, height);
    const frameData = context.getImageData(0, 0, width, height).data;
    const { notes, prevFrameDataLeft: newLeft, prevFrameDataRight: newRight } = await mapFrameToNotes(
      frameData,
      width,
      height,
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