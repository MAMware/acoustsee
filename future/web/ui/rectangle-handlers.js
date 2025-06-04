import { processFrame } from './frame-processor.js';
import { initializeAudio, audioContext, isAudioInitialized } from '../audio-processor.js';
import { settings, setStream, setAudioInterval, setSkipFrame } from '../state.js';
import { speak } from './utils.js';
import { DOM } from './dom.js';

export function setupRectangleHandlers({ dispatchEvent }) {
  let settingsMode = false;
  let touchCount = 0;
  let lastFrameTime = performance.now();
  let audioEnabled = false;
  let rafId;
  let inactivityTimeout;

  function tryVibrate(event) {
    if (event.cancelable && navigator.vibrate && isAudioInitialized && audioContext) {
      event.preventDefault();
      navigator.vibrate(50);
    }
  }

  async function ensureAudioContext() {
    if (!isAudioInitialized && !audioContext) {
      try {
        // Defer AudioContext creation to the event handler to ensure user gesture context
        await initializeAudio(audioContext);
        audioEnabled = true;
        if (DOM.audioToggle) DOM.audioToggle.textContent = 'Audio On';
        await speak('audioOn');
        return true;
      } catch (err) {
        console.error('Audio initialization failed:', err.message);
        dispatchEvent('logError', { message: `Audio init failed: ${err.message}` });
        await speak('audioError');
        return false;
      }
    } else if (audioContext && audioContext.state === 'suspended') {
      try {
        await audioContext.resume();
        audioEnabled = true;
        if (DOM.audioToggle) DOM.audioToggle.textContent = 'Audio On';
        await speak('audioOn');
        return true;
      } catch (err) {
        console.error('Audio resume failed:', err.message);
        dispatchEvent('logError', { message: `Audio resume failed: ${err.message}` });
        await speak('audioError');
        return false;
      }
    }
    return true;
  }

  function resetInactivityTimeout() {
    clearTimeout(inactivityTimeout);
    inactivityTimeout = setTimeout(() => {
      if (settings.stream && audioContext) {
        settings.stream.getTracks().forEach(track => track.stop());
        setStream(null);
        if (DOM.videoFeed) {
          DOM.videoFeed.srcObject = null;
          DOM.videoFeed.style.display = 'none';
        }
        audioContext.suspend();
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
          setAudioInterval(null);
        }
        dispatchEvent('updateUI', { settingsMode, streamActive: false });
        if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'none';
      }
    }, 60000);
  }

  function processFrameLoop(timestamp) {
    if (!settings.stream || !audioEnabled) return;
    const deltaTime = timestamp - lastFrameTime;
    if (deltaTime < settings.updateInterval) {
      rafId = requestAnimationFrame(processFrameLoop);
      setSkipFrame(true);
      return;
    }
    setSkipFrame(false);
    lastFrameTime = timestamp;
    processFrame(DOM.videoFeed, DOM.imageCanvas);
    rafId = requestAnimationFrame(processFrameLoop);
  }

  // audioToggle event listener
  DOM.audioToggle?.addEventListener('touchstart', (event) => {
    if (!DOM.audioToggle) {
      console.error('audioToggle element not found');
      dispatchEvent('logError', { message: 'audioToggle element not found' });
      return;
    }
    tryVibrate(event);
    if (!audioEnabled) {
      // Create and resume AudioContext directly in the event handler to ensure user gesture
      let newContext;
      try {
        newContext = new (window.AudioContext || window.webkitAudioContext)();
        if (newContext.state === 'suspended') {
          newContext.resume(); // Synchronous resume within user gesture context
        }
        setAudioContext(newContext); // Update via setter
        ensureAudioContext();
      } catch (err) {
        console.error('AudioContext creation/resume failed:', err.message);
        dispatchEvent('logError', { message: `AudioContext creation/resume failed: ${err.message}` });
        speak('audioError');
        return;
      }
    }
  });

  // startStopBtn event listener
  DOM.startStopBtn?.addEventListener('touchstart', async (event) => {
    if (!DOM.startStopBtn) {
      console.error('startStopBtn element not found');
      dispatchEvent('logError', { message: 'startStopBtn element not found' });
      return;
    }
    tryVibrate(event);
    resetInactivityTimeout();
    try {
      if (!audioEnabled) {
        await speak('audioNotEnabled');
        dispatchEvent('logError', { message: 'Audio not enabled' });
        return;
      }
      if (settings.stream) {
        settings.stream.getTracks().forEach(track => track.stop());
        setStream(null);
        if (DOM.videoFeed) {
          DOM.videoFeed.srcObject = null;
          DOM.videoFeed.pause();
          DOM.videoFeed.style.display = 'none';
        }
        if (rafId) {
          cancelAnimationFrame(rafId);
          rafId = null;
          setAudioInterval(null);
        }
        if (audioContext) await audioContext.suspend();
        await speak('startStop', { state: 'stopped' });
        dispatchEvent('updateUI', { settingsMode, streamActive: false });
        if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'none';
      } else {
        if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'block';
        const isLowEndDevice = navigator.hardwareConcurrency < 4;
        settings.updateInterval = isLowEndDevice ? 100 : 50;
        if (DOM.imageCanvas) {
          DOM.imageCanvas.width = isLowEndDevice ? 24 : 48;
          DOM.imageCanvas.height = isLowEndDevice ? 18 : 36;
        }
        const constraints = {
          video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }
        };
        const newStream = await navigator.mediaDevices.getUserMedia(constraints);
        setStream(newStream);
        if (DOM.videoFeed) {
          DOM.videoFeed.srcObject = newStream;
          await DOM.videoFeed.play();
          DOM.videoFeed.style.display = 'block';
          await speak('startStop', { state: 'started' });
          setAudioInterval('raf');
          lastFrameTime = performance.now();
          processFrameLoop(lastFrameTime);
          dispatchEvent('updateUI', { settingsMode, streamActive: true });
          if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'none';
        } else {
          throw new Error('Video element not found');
        }
      }
    } catch (err) {
      console.error('startStopBtn error:', err.message);
      dispatchEvent('logError', { message: `startStopBtn error: ${err.message}` });
      await speak('cameraError');
      if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'none';
    }
  });

  DOM.languageBtn?.addEventListener('touchstart', async (event) => {
    tryVibrate(event);
    if (audioEnabled) {
      if (settingsMode) {
        settings.synthesisEngine = settings.synthesisEngine === 'sine-wave' ? 'fm-synthesis' : 'sine-wave';
        await speak('synthesisSelect', { engine: settings.synthesisEngine });
      } else {
        const languages = ['en-US', 'es-ES'];
        const currentIndex = languages.indexOf(settings.language || 'en-US');
        settings.language = languages[(currentIndex + 1) % languages.length];
        await speak('languageSelect', { lang: settings.language });
      }
      dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream });
    }
  });

  DOM.closeDebug?.addEventListener('touchstart', (event) => {
    tryVibrate(event);
    dispatchEvent('toggleDebug', { show: false });
  });

  DOM.emailDebug?.addEventListener('touchstart', async (event) => {
    tryVibrate(event);
    try {
      const debugPre = DOM.debug?.querySelector('pre');
      const logContent = debugPre?.textContent || 'No errors logged';
      const subject = encodeURIComponent('AcoustSee Error Log');
      const body = encodeURIComponent(`Error Log from AcoustSee:\n\n${logContent}\n\nDevice Info: ${navigator.userAgent}`);
      const mailtoLink = `mailto:acoustsee@outlook.com?subject=${subject}&body=${body}`;
      window.location.href = mailtoLink;
      await speak('emailDebug', { state: 'sent' });
    } catch (err) {
      console.error('Error generating email log:', err.message);
      dispatchEvent('logError', { message: `Error generating email log: ${err.message}` });
      await speak('emailError');
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden && settings.stream && audioContext) {
      audioContext.suspend();
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = null;
        setAudioInterval(null);
      }
    } else if (!document.hidden && settings.stream && audioContext) {
      audioContext.resume();
      processFrameLoop(performance.now());
    }
  });

  document.addEventListener('touchstart', resetInactivityTimeout);

  setTimeout(() => {
    Object.entries(DOM).forEach(([key, value]) => {
      console.log(`DOM Element - ${key}:`, value);
    });
  }, 100);
}
