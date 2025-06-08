import { getDOM, getDispatchEvent } from '../context.js';
import { settings, setStream, setAudioInterval } from '../state.js';
import { initializeAudio, cleanupAudio } from '../audio-processor.js';
import { speak } from './utils.js';

let isAudioContextInitialized = false;
let audioContext = null;

export function setupRectangleHandlers() {
  const DOM = getDOM();
  const dispatchEvent = getDispatchEvent();

  if (!DOM || !DOM.audioToggle || !DOM.videoFeed) {
    console.error('Critical DOM elements missing in rectangle-handlers');
    dispatchEvent('logError', { message: 'Critical DOM elements missing in rectangle-handlers' });
    return;
  }

  const audioToggle = DOM.audioToggle;

  async function audioToggleHandler() {
    try {
      if (!isAudioContextInitialized) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (!audioContext) {
          throw new Error('AudioContext creation failed');
        }

        await initializeAudio(audioContext);
        isAudioContextInitialized = true;

        if (settings.stream) {
          await setStream(settings.stream);
          setAudioInterval(setInterval(() => {
            dispatchEvent('processFrame');
          }, settings.updateInterval));
        }

        audioToggle.textContent = 'Turn Audio Off';
        audioToggle.setAttribute('aria-label', 'Turn audio off');
        await speak('audioToggle', { state: 'on' });
        dispatchEvent('updateUI', { settingsMode: false, streamActive: true });
      } else {
        if (audioContext.state === 'running') {
          await audioContext.suspend();
          audioToggle.textContent = 'Turn Audio On';
          audioToggle.setAttribute('aria-label', 'Turn audio on');
          await speak('audioToggle', { state: 'off' });
        } else if (audioContext.state === 'suspended') {
          await audioContext.resume();
          audioToggle.textContent = 'Turn Audio Off';
          audioToggle.setAttribute('aria-label', 'Turn audio off');
          await speak('audioToggle', { state: 'on' });
        }
        dispatchEvent('updateUI', { settingsMode: false, streamActive: audioContext.state === 'running' });
      }
    } catch (err) {
      console.error('Audio toggle error:', err.message);
      dispatchEvent('logError', { message: `Audio toggle error: ${err.message}` });
      await speak('audioToggle', { state: 'error', message: 'Failed to toggle audio' });

      if (!isAudioContextInitialized && audioContext) {
        try {
          await audioContext.close();
        } catch (closeErr) {
          console.error('Error closing AudioContext:', closeErr.message);
        }
        audioContext = null;
      }

      for (let i = 0; i < 3; i++) {
        await new Promise(resolve => setTimeout(resolve, 1000));
        try {
          audioContext = new (window.AudioContext || window.webkitAudioContext)();
          await initializeAudio(audioContext);
          isAudioContextInitialized = true;
          audioToggle.textContent = 'Turn Audio Off';
          audioToggle.setAttribute('aria-label', 'Turn audio off');
          await speak('audioToggle', { state: 'on' });
          dispatchEvent('updateUI', { settingsMode: false, streamActive: true });
          break;
        } catch (retryErr) {
          console.error(`Retry ${i + 1} failed:`, retryErr.message);
          dispatchEvent('logError', { message: `Audio retry ${i + 1} failed: ${retryErr.message}` });
        }
      }

      if (!isAudioContextInitialized) {
        audioToggle.textContent = 'Turn Audio On';
        audioToggle.setAttribute('aria-label', 'Turn audio on');
        await speak('audioToggle', { state: 'error', message: 'Audio initialization failed' });
      }
    }
  }

  audioToggle.addEventListener('click', async () => {
    if (!isAudioContextInitialized && !navigator.mediaDevices.getUserMedia) {
      console.error('getUserMedia not supported');
      dispatchEvent('logError', { message: 'getUserMedia not supported' });
      await speak('audioToggle', { state: 'error', message: 'Media devices not supported' });
      return;
    }

    try {
      if (!settings.stream) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        DOM.videoFeed.srcObject = stream;
        setStream(stream);
      }
      await audioToggleHandler();
    } catch (err) {
      console.error('Media access error:', err.message);
      dispatchEvent('logError', { message: `Media access error: ${err.message}` });
      await speak('audioToggle', { state: 'error', message: 'Failed to access media' });
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
