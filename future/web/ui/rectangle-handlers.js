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
      audioContext = new (window.AudioContext || window.webkitAudioContext)();
      if (!audioContext) {
        throw new Error('AudioContext creation failed');
      }
      await initializeAudio(audioContext);
      isAudioContextInitialized = true;
      DOM.splashScreen.style.display = 'none';
      DOM.mainContainer.style.display = 'grid';
      await speak('audioOn');
      dispatchEvent('updateUI', { settingsMode: false, streamActive: false });
    } catch (err) {
      console.error('Power on error:', err.message);
      dispatchEvent('logError', { message: `Power on error: ${err.message}` });
      await speak('audioError');
      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          await initializeAudio(audioContext);
          isAudioContextInitialized = true;
          DOM.splashScreen.style.display = 'none';
          DOM.mainContainer.style.display = 'grid';
          await speak('audioOn');
          dispatchEvent('updateUI', { settingsMode: false, streamActive: false });
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
      if (!settings.stream) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        DOM.videoFeed.srcObject = stream;
        setStream(stream);
        setAudioInterval(setInterval(() => {
          dispatchEvent('processFrame');
        }, settings.updateInterval));
        DOM.button1.textContent = 'Stop';
        DOM.button1.setAttribute('aria-label', 'Stop stream');
        await speak('startStop', { state: 'started' });
      } else {
        settings.stream.getTracks().forEach(track => track.stop());
        setStream(null);
        clearInterval(settings.audioInterval);
        setAudioInterval(null);
        DOM.button1.textContent = 'Start';
        DOM.button1.setAttribute('aria-label', 'Start stream');
        await speak('startStop', { state: 'stopped' });
      }
      dispatchEvent('updateUI', { settingsMode: false, streamActive: !!settings.stream });
    } catch (err) {
      console.error('Stream toggle error:', err.message);
      dispatchEvent('logError', { message: `Stream toggle error: ${err.message}` });
      await speak('cameraError');
    }
  });

  // Button 2: Toggle Audio Context
  DOM.button2.addEventListener('click', async () => {
    if (settings.isSettingsMode) return; // Handled in settings-handlers.js
    if (!isAudioContextInitialized) {
      console.error('Audio not initialized');
      dispatchEvent('logError', { message: 'Audio not initialized' });
      await speak('audioNotEnabled');
      return;
    }
    try {
      if (audioContext.state === 'running') {
        await audioContext.suspend();
        DOM.button2.textContent = 'Audio On';
        DOM.button2.setAttribute('aria-label', 'Turn audio on');
        await speak('audioToggle', { state: 'off' });
      } else if (audioContext.state === 'suspended') {
        await audioContext.resume();
        DOM.button2.textContent = 'Audio Off';
        DOM.button2.setAttribute('aria-label', 'Turn audio off');
        await speak('audioToggle', { state: 'on' });
      }
      dispatchEvent('updateUI', { settingsMode: false, streamActive: !!settings.stream });
    } catch (err) {
      console.error('Audio toggle error:', err.message);
      dispatchEvent('logError', { message: `Audio toggle error: ${err.message}` });
      await speak('audioError');
    }
  });

  window.addEventListener('beforeunload', async () => {
    if (settings.stream) {
      settings.stream.getTracks().forEach(track => track.stop());
      setStream(null);
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
