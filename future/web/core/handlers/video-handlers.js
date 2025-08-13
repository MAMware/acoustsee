// File: web/core/handlers/video-handlers.js

import { settings, setStream, setAudioInterval, setMicStream } from '../state.js';
import { dispatchEvent } from '../dispatcher.js';
import { structuredLog } from '../../utils/logging.js';
import { getText, speakText } from '../../utils/utils.js';
import { cleanupFrameProcessor } from '../../video/frame-processor.js';
import { getDOM } from '../context.js';
import { initializeMicAudio } from '../../audio/audio-processor.js';

// Note: The processFrame logic can remain in the dispatcher for now, as it's tightly coupled
// with the offscreen canvas defined there. We can move it later if needed.

export async function startStop({ settingsMode }) {
  const DOM = getDOM();
  try {
    if (settingsMode) {
      // This is actually GRID selection logic, not video logic.
      // We will move this to grid-handlers.js in a future step.
      // For now, we leave it here to ensure functionality isn't broken.
      const { availableGrids } = settings;
      const currentIndex = availableGrids.findIndex(g => g.id === settings.gridType);
      const nextIndex = (currentIndex + 1) % availableGrids.length;
      settings.gridType = availableGrids[nextIndex].id;
      
      const msg = await getText('button1.tts.gridSelect', { state: settings.gridType });
      speakText(msg);

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