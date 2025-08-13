// video-handlers.js
// Handles video frame processing and grid/capture logic

import { settings, setStream, setAudioInterval, setSettings, saveConfigs } from "../state.js";
import { getText, speakText } from "../../utils/utils.js";
import {
  processFrameWithState,
  cleanupFrameProcessor,
} from "../../video/frame-processor.js";
import { structuredLog } from "../../utils/logging.js";
import { withErrorBoundary } from "../../utils/async.js";

let offscreenCanvas = null;
let offscreenCtx = null;

/**
 * Validates required DOM elements for video processing.
 * Throws an error if any required property is missing.
 */
function validateDomElements(domElements) {
  if (!domElements || typeof domElements !== "object") {
    throw new Error("Missing domElements parameter");
  }
  if (
    !domElements.videoFeed ||
    !(domElements.videoFeed instanceof HTMLVideoElement)
  ) {
    throw new Error("domElements.videoFeed must be an HTMLVideoElement");
  }
}

/**
 * Processes a video frame and logs results. Returns result or throws on error.
 */
export async function processFrame(domElements) {
  try {
    validateDomElements(domElements);
    if (
      !offscreenCanvas ||
      offscreenCanvas.width !== domElements.videoFeed.videoWidth
    ) {
      offscreenCanvas = document.createElement("canvas");
      offscreenCanvas.width = domElements.videoFeed.videoWidth;
      offscreenCanvas.height = domElements.videoFeed.videoHeight;
      offscreenCtx = offscreenCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      structuredLog(
        "INFO",
        "videoHandlers.processFrame: Created/Resized offscreen canvas",
        {
          width: offscreenCanvas.width,
          height: offscreenCanvas.height,
        },
      );
    }
    offscreenCtx.drawImage(
      domElements.videoFeed,
      0,
      0,
      offscreenCanvas.width,
      offscreenCanvas.height,
    );
    let frameData;
    try {
      frameData = offscreenCtx.getImageData(
        0,
        0,
        offscreenCanvas.width,
        offscreenCanvas.height,
      ).data;
    } catch (err) {
      structuredLog(
        "ERROR",
        "videoHandlers.processFrame: getImageData failed",
        { message: err.message },
      );
      frameData = new Uint8ClampedArray(
        offscreenCanvas.width * offscreenCanvas.height * 4,
      );
    }
    const { data: result, error } = await withErrorBoundary(
      processFrameWithState,
      frameData,
      domElements.videoFeed.videoWidth,
      domElements.videoFeed.videoHeight,
    );
    if (error) throw new Error(`Frame processing failed: ${error.message}`);
    structuredLog("DEBUG", "videoHandlers.processFrame: result", {
      notesCount: result?.notes?.length || 0,
      avgIntensity: result?.avgIntensity,
    });
    return result;
  } catch (err) {
    structuredLog("ERROR", "videoHandlers.processFrame: error", {
      message: err.message,
    });
    throw err;
  }
}

/**
 * Handles grid switching and video stream start/stop logic.
 */
export async function startStop(settingsMode, domElements) {
  try {
    if (settingsMode) {
      const { availableGrids } = settings;
      const currentIndex = availableGrids.findIndex(
        (g) => g.id === settings.gridType,
      );
      const newGridType = availableGrids[(currentIndex + 1) % availableGrids.length].id;
      setSettings({ ...settings, gridType: newGridType });
      saveConfigs(); // Save user preferences after updating grid type
      const msg = await getText("button1.tts.gridSelect", { state: settings.gridType });
      speakText(msg);
      structuredLog("INFO", "videoHandlers.startStop: Grid switched", {
        gridType: settings.gridType,
      });
    } else {
      validateDomElements(domElements);
      if (!settings.stream) {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false,
          });
        } catch (err) {
          structuredLog(
            "ERROR",
            "videoHandlers.startStop: getUserMedia failed",
            { message: err.message },
          );
          throw err;
        }
        setStream(stream);
        structuredLog("INFO", "videoHandlers.startStop: Video stream started");
      } else {
        // Stop stream
        settings.stream.getTracks().forEach((track) => track.stop());
        setStream(null);
        structuredLog("INFO", "videoHandlers.startStop: Video stream stopped");
      }
    }
  } catch (err) {
    structuredLog("ERROR", "videoHandlers.startStop: error", {
      message: err.message,
    });
    throw err;
  }
}
