// web/core/handlers/video-handlers.js
//this is an example file starting the Milestone 6 to SRP adherence of /core/dispatcher.js 
import { settings, setStream, setAudioInterval } from '../state.js';
import { getText } from '../../utils/utils.js';
import { processFrameWithState, cleanupFrameProcessor } from '../../video/frame-processor.js';
import { structuredLog } from '../../utils/logging.js';
import { withErrorBoundary } from '../../utils/async.js';

let offscreenCanvas = null;
let offscreenCtx = null;

export const videoHandlers = {
  processFrame: async ({ domElements }) => {
    try {
      if (!offscreenCanvas || offscreenCanvas.width !== domElements.videoFeed.videoWidth) {
        offscreenCanvas = document.createElement('canvas');
        offscreenCanvas.width = domElements.videoFeed.videoWidth;
        offscreenCanvas.height = domElements.videoFeed.videoHeight;
        offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
        structuredLog('INFO', 'processFrame: Created/Resized offscreen canvas', {
          width: offscreenCanvas.width,
          height: offscreenCanvas.height
        });
      }
      offscreenCtx.drawImage(domElements.videoFeed, 0, 0, offscreenCanvas.width, offscreenCanvas.height);
      let frameData;
      try {
        frameData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height).data;
      } catch (err) {
        structuredLog('ERROR', 'processFrame getImageData failed', { message: err.message });
        frameData = new Uint8ClampedArray(offscreenCanvas.width * offscreenCanvas.height * 4);
      }
      const { data: result, error } = await withErrorBoundary(
        processFrameWithState,
        frameData,
        domElements.videoFeed.videoWidth,
        domElements.videoFeed.videoHeight
      );
      if (error) throw new Error(`Frame processing failed: ${error.message}`);
      structuredLog('DEBUG', 'processFrame result', {
        notesCount: result?.notes?.length || 0,
        avgIntensity: result?.avgIntensity
      });
    } catch (err) {
      structuredLog('ERROR', 'processFrame error', { message: err.message });
    }
  },

  startStop: async ({ settingsMode, domElements }) => {
    try {
      if (settingsMode) {
        const { availableGrids } = settings;
        const currentIndex = availableGrids.findIndex(g => g.id === settings.gridType);
        settings.gridType = availableGrids[(currentIndex + 1) % availableGrids.length].id;
        await getText('button1.tts.gridSelect', { state: settings.gridType });
      } else {
        if (!settings.stream) {
          let stream;
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
          } catch (err) {
            stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
          }
          domElements.videoFeed.srcObject = stream;
          await new Promise((resolve, reject) => {
            domElements.videoFeed.addEventListener('loadedmetadata', resolve, { once: true });
            domElements.videoFeed.addEventListener('error', reject, { once: true });
          });
          setStream(stream);
          const frameLoop = () => {
            dispatchEvent('processFrame', { domElements });
            settings.frameTimerId = requestAnimationFrame(frameLoop);
          };
          frameLoop();
          await getText('button1.tts.startStop', { state: 'starting' });
        } else {
          settings.stream.getVideoTracks().forEach(track => track.stop());
          setStream(null);
          await cleanupFrameProcessor();
          if (settings.micStream) {
            settings.micStream.getTracks().forEach(track => track.stop());
            setMicStream(null);
          }
          cancelAnimationFrame(settings.frameTimerId);
          setAudioInterval(null);
          await getText('button1.tts.startStop', { state: 'stopping' });
        }
      }
    } catch (err) {
      structuredLog('ERROR', 'startStop error', { message: err.message });
      await getText('button1.tts.cameraError');
    }
  },

  toggleVideoSource: async ({ domElements }) => {
    try {
      const oldStream = domElements.videoFeed?.srcObject;
      if (oldStream) {
        const currentVideoTrack = oldStream.getVideoTracks()[0];
        const newFacingMode = currentVideoTrack.getSettings().facingMode === 'user' ? 'environment' : 'user';
        oldStream.getTracks().forEach(track => track.stop());
        await cleanupFrameProcessor();
        const newStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: newFacingMode },
          audio: !!settings.micStream
        });
        domElements.videoFeed.srcObject = newStream;
        await domElements.videoFeed.play();
        await new Promise((resolve, reject) => {
          domElements.videoFeed.onloadedmetadata = resolve;
          domElements.videoFeed.onerror = reject;
        });
        setStream(newStream);
        if (settings.micStream) setMicStream(newStream);
        await getText('button3.tts.videoSourceSelect', { state: newFacingMode });
      } else {
        structuredLog('WARN', 'toggleVideoSource: No video track');
        await getText('button3.tts.videoSourceError');
      }
    } catch (err) {
      structuredLog('ERROR', 'toggleVideoSource error', { message: err.message });
      await getText('button3.tts.videoSourceError');
    }
  }
};