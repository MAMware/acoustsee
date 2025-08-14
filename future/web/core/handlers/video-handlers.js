// File: web/core/handlers/video-handlers.js

import { settings, setStream, setAudioInterval, setMicStream } from '../state.js';
import { dispatchEvent } from '../dispatcher.js';
import { structuredLog } from '../../utils/logging.js';
import { getText, speakText } from '../../utils/utils.js';
import { cleanupFrameProcessor } from '../../video/frame-processor.js';
import { getDOM } from '../context.js';
import { initializeMicAudio } from '../../audio/audio-processor.js';
import { toggleGrid } from './grid-handlers.js';
import { processFrameWithState } from '../../video/frame-processor.js'; 
import { withErrorBoundary } from '../../utils/async.js'; 

let offscreenCanvas = null;
let offscreenCtx = null;
let fpsSamplerInterval = null;
let frameCount = 0;

// Note: The processFrame logic is handled via dispatched events and is not directly tied to this function.
// The toggleGrid handler is now responsible for managing grid-related settings.

export async function startStop({ settingsMode }) {
  const DOM = getDOM();
  try {
    if (settingsMode) {
      await toggleGrid();
      // Returning here does not skip the finally block; it will still execute as expected
      return; 
    } else {
      // This is the core video start/stop logic
      if (!settings.stream) {
        let stream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        } catch (err) {
          structuredLog('WARN', 'getUserMedia(user) failed, retrying default video', { message: err.message });
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }
        DOM.videoFeed.srcObject = stream;

        await new Promise((resolve, reject) => {
          DOM.videoFeed.addEventListener('loadedmetadata', () => {
            if (DOM.videoFeed.videoWidth <= 0 || DOM.videoFeed.videoHeight <= 0) {
              return reject(new Error('Invalid video dimensions after metadata'));
            }
            structuredLog('INFO', 'Video metadata loaded', { width: DOM.videoFeed.videoWidth, height: DOM.videoFeed.videoHeight });
            resolve();
          }, { once: true });
          DOM.videoFeed.addEventListener('error', (e) => reject(e.target.error), { once: true });
        });
        
        setStream(stream);
        const timerId = setInterval(() => dispatchEvent('processFrame'), settings.updateInterval);
        setAudioInterval(timerId);
        
        const msg = await getText('button1.tts.startStop', { state: 'starting' });
        speakText(msg);
        if (settings.debugLogging && !fpsSamplerInterval) {
          fpsSamplerInterval = setInterval(() => {
            const avgFPS = frameCount / 10;
            structuredLog('DEBUG', 'Average FPS sample', { avgFPS, overSeconds: 10 });
            frameCount = 0;
          }, 10000);
        }
      } else {
        settings.stream.getTracks().forEach(track => track.stop());
        setStream(null);
        await cleanupFrameProcessor();
        
        if (settings.micStream) {
          settings.micStream.getTracks().forEach(track => track.stop());
          setMicStream(null);
          initializeMicAudio(null);
        }
        
        clearInterval(settings.audioTimerId);
        setAudioInterval(null);
        
        const msg = await getText('button1.tts.startStop', { state: 'stopping' });
        speakText(msg);
        if (fpsSamplerInterval) {
          clearInterval(fpsSamplerInterval);
          fpsSamplerInterval = null;
          structuredLog('INFO', 'FPS sampler cleared on stream stop');
        }
      }
    }
  } catch (err) {
    structuredLog('ERROR', 'startStop error', { message: err.message, stack: err.stack });
    const errorMsg = await getText('button1.tts.cameraError');
    speakText(errorMsg);
  } finally {
    dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream, micActive: !!settings.micStream });
  }
}

export async function toggleVideoSource() {
    const DOM = getDOM();
    try {
        const oldStream = DOM.videoFeed?.srcObject;
        if (!oldStream) {
            structuredLog('WARN', 'toggleVideoSource: No video stream available to toggle.');
            const errorMsg = await getText('button3.tts.videoSourceError');
            speakText(errorMsg);
            return;
        }

        const currentVideoTrack = oldStream.getVideoTracks()[0];
        const currentFacingMode = currentVideoTrack.getSettings().facingMode || 'user';
        const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';

        oldStream.getTracks().forEach(track => track.stop());
        await cleanupFrameProcessor();

        const newStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: newFacingMode },
            audio: false // We don't want to re-request audio here
        });

        DOM.videoFeed.srcObject = newStream;
        await DOM.videoFeed.play();

        await new Promise((resolve, reject) => {
            DOM.videoFeed.addEventListener('loadedmetadata', resolve, { once: true });
            DOM.videoFeed.addEventListener('error', (e) => reject(e.target.error), { once: true });
        });

        if (DOM.videoFeed.videoWidth <= 0 || DOM.videoFeed.videoHeight <= 0) {
            throw new Error('Invalid video dimensions after source toggle');
        }
        
        setStream(newStream);

        const msg = await getText('button3.tts.videoSourceSelect', { state: newFacingMode });
        speakText(msg);

    } catch (err) {
        structuredLog('ERROR', 'toggleVideoSource error', { message: err.message, stack: err.stack });
        const errorMsg = await getText('button3.tts.videoSourceError');
        speakText(errorMsg);
    }
}

export async function processFrame() {
  const DOM = getDOM();
  try {
    if (!DOM.videoFeed || DOM.videoFeed.videoWidth <= 0) {
      // Don't process if video isn't ready
      return;
    }

    // Create or resize offscreen canvas if needed
    if (!offscreenCanvas ||
        offscreenCanvas.width !== DOM.videoFeed.videoWidth ||
        offscreenCanvas.height !== DOM.videoFeed.videoHeight) {
      offscreenCanvas = document.createElement('canvas');
      offscreenCanvas.width = DOM.videoFeed.videoWidth;
      offscreenCanvas.height = DOM.videoFeed.videoHeight;
      offscreenCtx = offscreenCanvas.getContext('2d', { willReadFrequently: true });
      structuredLog('INFO', 'video-handler: Created/Resized offscreen canvas', {
        width: offscreenCanvas.width,
        height: offscreenCanvas.height
      });
    }

    // Draw current video frame into offscreen canvas
    offscreenCtx.drawImage(DOM.videoFeed, 0, 0, offscreenCanvas.width, offscreenCanvas.height);

    // Read pixel data
    const frameData = offscreenCtx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height).data;

    const { data: result, error } = await withErrorBoundary(
      processFrameWithState,
      frameData,
      offscreenCanvas.width,
      offscreenCanvas.height
    );

    if (error) {
      structuredLog('ERROR', 'processFrame handler error', { message: error.message });
      dispatchEvent('logError', { message: `Frame processing handler error: ${error.message}` });
      return;
    }

    frameCount++;
  } catch (err) {
    structuredLog('ERROR', 'processFrame error', { message: err.message });
    dispatchEvent('logError', { message: `Frame processing error: ${err.message}` });
  }
}