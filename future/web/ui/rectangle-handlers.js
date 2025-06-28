import { getDOM, getDispatchEvent } from '../context.js';
import { settings, setStream, setAudioInterval } from '../state.js';
import { initializeAudio, cleanupAudio } from '../audio-processor.js';
import { speak } from './utils.js';

let isAudioContextInitialized = false;
let audioContext = null;

export function setupRectangleHandlers() {
  const DOM = getDOM();
  const dispatchEvent = getDispatchEvent();

  if (!DOM || !DOM.powerOn || !DOM.splashScreen || !DOM.mainContainer || !DOM.button1 || !DOM.button2 || !DOM.videoFeed) {
    console.error('Critical DOM elements missing in rectangle-handlers');
    dispatchEvent('logError', { message: 'Critical DOM elements missing in rectangle-handlers' });
    return;
  }

  // Power On: Initialize Audio Context
  DOM.powerOn.addEventListener('click', async () => {
    try {
      console.log('PowerOn: Initializing AudioContext');
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (!audioContext) {
        throw new Error('AudioContext creation failed');
      }
      await initializeAudio(audioContext);
      isAudioContextInitialized = true;
      DOM.splashScreen.style.display = 'none';
      DOM.mainContainer.style.display = 'grid';
      await speak('audioOn');
      dispatchEvent('updateUI', { settingsMode: false, streamActive: false, micActive: false });
      console.log('PowerOn: AudioContext initialized, UI updated');
    } catch (err) {
      console.error('Power on error:', err.message);
      dispatchEvent('logError', { message: `Power on error: ${err.message}` });
      await speak('audioError');
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          console.log(`PowerOn: Retry ${i + 1} for AudioContext`);
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          await initializeAudio(audioContext);
          isAudioContextInitialized = true;
          DOM.splashScreen.style.display = 'none';
          DOM.mainContainer.style.display = 'grid';
          await speak('audioOn');
          dispatchEvent('updateUI', { settingsMode: false, streamActive: false, micActive: false });
          console.log('PowerOn: AudioContext initialized on retry');
          break;
        } catch (retryErr) {
          console.error(`Retry ${i + 1} failed:`, retryErr.message);
          dispatchEvent('logError', { message: `Audio retry ${i + 1} failed: ${retryErr.message}` });
        }
      }
      if (!isAudioContextInitialized) {
        await speak('audioError', { message: 'Audio initialization failed' });
      }
    }
  });

  // Button 1: Toggle Stream
  DOM.button1.addEventListener('click', async () => {
    if (settings.isSettingsMode) return; // Handled in settings-handlers.js
    if (!isAudioContextInitialized) {
      console.error('Audio not initialized');
      dispatchEvent('logError', { message: 'Audio not initialized' });
      await speak('audioNotEnabled');
      return;
    }
    try {
      console.log('Button 1: Dispatching toggleStream');
      dispatchEvent('toggleStream');
      dispatchEvent('updateUI', { settingsMode: false, streamActive: !!settings.stream, micActive: !!settings.micStream });
    } catch (err) {
      console.error('Button 1 error:', err.message);
      dispatchEvent('logError', { message: `Button 1 error: ${err.message}` });
      await speak('cameraError');
    }
  });

  // Button 2: Toggle Microphone
  DOM.button2.addEventListener('click', async () => {
    if (settings.isSettingsMode) return; // Handled in settings-handlers.js
    if (!isAudioContextInitialized) {
      console.error('Audio not initialized');
      dispatchEvent('logError', { message: 'Audio not initialized' });
      await speak('audioNotEnabled');
      return;
    }
    try {
      console.log('Button 2: Dispatching toggleMic');
      dispatchEvent('toggleMic', { settingsMode: false });
    } CTS
      console.error('Mic toggle error:', err.message);
      dispatchEvent('logError', { message: `Mic toggle error: ${err.message}` });
      await speak('micError');
    }
  });

  window.addEventListener('beforeunload', async () => {
    if (settings.stream) {
      settings.stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
    if (settings.micStream) {
      settings.micStream.getTracks().forEach(track => track.stop());
      settings.micStream = null;
    }
    if (settings.audioInterval) {
      clearInterval(settings.audioInterval);
      setAudioInterval(null);
    }
    if (isAudioContextInitialized && audioContext) {
      await cleanupAudio();
      await audioContext.close();
      isAudioContextInitialized = false;
      audioContext = null;
    }
  });
}
