import { processFrame } from './frame-processor.js';
import { initializeAudio, isAudioInitialized, setAudioContext, audioContext } from '../audio-processor.js';
import { settings, setStream, setAudioInterval, setSkipFrame } from '../state.js';
import { speak } from './utils.js';

export function setupRectangleHandlers({ dispatchEvent, DOM }) {
  let touchCount = 0;
  let lastFrameTime = performance.now();
  let audioEnabled = false;
  let rafId;
  //let inactivityTimeout;

  console.log('setupRectangleHandlers: Starting setup');

  // Ensure DOM is defined
  if (!DOM) {
    console.error('DOM is undefined in setupRectangleHandlers');
    return;
  }

  if (DOM.debug) {
    DOM.debug.style.display = 'none';
    console.log('Debug panel hidden on load');
  } else {
    console.error('Debug panel not found');
  }

  function tryVibrate(event) {
    if (event.cancelable && navigator.vibrate && isAudioInitialized) {
      try {
        navigator.vibrate(50);
      } catch (err) {
        console.warn('Vibration blocked:', err.message);
      }
    }
  }

  async function ensureAudioContext() {
    if (!isAudioInitialized) {
      try {
        console.log('ensureAudioContext: Initializing audio');
        if (!audioContext) throw new Error('audioContext not initialized');
        const initSuccess = await initializeAudio(audioContext);
        if (!initSuccess) throw new Error('Audio initialization failed');
        audioEnabled = true;
        if (DOM.audioToggle) DOM.audioToggle.textContent = 'Audio On';
        await speak('audioOn');
        return true;
      } catch (err) {
        console.error('Audio initialization failed:', err.message);
        dispatchEvent('logError', { message: `Audio init failed: ${err.message}` });
        await speak('audioError');
        audioEnabled = false;
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
        audioEnabled = false;
        return false;
      }
    }
    return true;
  }
  
    function processFrameLoop(timestamp) {
    if (!settings.stream || !audioEnabled) {
      console.log('processFrameLoop skipped: stream or audio not enabled', { stream: !!settings.stream, audioEnabled });
      return;
    }
    const deltaTime = timestamp - lastFrameTime;
    if (deltaTime < settings.updateInterval) {
      rafId = requestAnimationFrame(processFrameLoop);
      setSkipFrame(true);
      return;
    }
    setSkipFrame(false);
    lastFrameTime = timestamp;
    processFrame(DOM.videoFeed, DOM.imageCanvas, DOM);
    rafId = requestAnimationFrame(processFrameLoop);
  }

  if (DOM.audioToggle) {
    DOM.audioToggle.addEventListener('touchstart', (event) => {
      if (event.cancelable) event.preventDefault();
      console.log('audioToggle touched');
      tryVibrate(event);
      if (audioEnabled) return;
      try {
        const newContext = new (window.AudioContext || window.webkitAudioContext)();
        if (newContext.state === 'suspended') {
          newContext.resume(); // Synchronous resume
          if (newContext.state !== 'running') throw new Error('AudioContext failed to resume');
          setAudioContext(newContext);
          ensureAudioContext().catch(err => {
            console.error('Audio init failed:', err.message);
            dispatchEvent('logError', { message: err.message });
            speak('audioError', { message: 'Tap again to enable audio' });
          });
        } else if (newContext.state === 'running') {
          setAudioContext(newContext);
          ensureAudioContext().catch(err => {
            console.error('Audio init failed:', err.message);
            dispatchEvent('logError', { message: err.message });
            speak('audioError', { message: 'Tap again to enable audio' });
          });
        } else throw new Error(`Unexpected state: ${newContext.state}`);
      } catch (err) {
        console.error('AudioContext creation failed:', err.message);
        dispatchEvent('logError', { message: err.message });
        speak('audioError', { message: 'Tap again to enable audio' });
      }
    });
  } else console.error('audioToggle not found');
 
if (DOM.startStopBtn) {
    DOM.startStopBtn.addEventListener('touchstart', async (event) => {
      if (event.cancelable) event.preventDefault();
      console.log('startStopBtn touched');
      tryVibrate(event);
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
            DOM.videoFeed.style.display = 'none';
          }
          if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
            setAudioInterval(null);
          }
          if (audioContext) await audioContext.suspend();
          await speak('startStop', { state: 'stopped' });
          dispatchEvent('updateUI', { settingsMode: false, streamActive: false });
        } else {
          if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'block';
          const isLowEndDevice = navigator.hardwareConcurrency < 4;
          settings.updateInterval = isLowEndDevice ? 100 : 50;
          if (DOM.imageCanvas) {
            DOM.imageCanvas.width = isLowEndDevice ? 24 : 48;
            DOM.imageCanvas.height = isLowEndDevice ? 18 : 36;
          }
          const constraints = { video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } } };
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
            dispatchEvent('updateUI', { settingsMode: false, streamActive: true });
          }
          if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'none';
        }
      } catch (err) {
        console.error('startStopBtn error:', err.message);
        dispatchEvent('logError', { message: err.message });
        await speak('cameraError');
        if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'none';
      }
    });
  } else console.error('startStopBtn not found');

   if (DOM.languageBtn) {
    DOM.languageBtn.addEventListener('touchstart', async (event) => {
      if (event.cancelable) event.preventDefault();
      console.log('languageBtn touched');
      tryVibrate(event);
      if (audioEnabled) {
        const languages = ['en-US', 'es-ES'];
        const currentIndex = languages.indexOf(settings.language || 'en-US');
        settings.language = languages[(currentIndex + 1) % languages.length];
        await speak('languageSelect', { lang: settings.language });
        dispatchEvent('updateUI', { settingsMode: false, streamActive: !!settings.stream });
      }
    });
  } else console.error('languageBtn not found'); 
  
 if (DOM.closeDebug) {
    DOM.closeDebug.addEventListener('touchstart', (event) => {
      if (event.cancelable) event.preventDefault();
      console.log('closeDebug touched');
      tryVibrate(event);
      dispatchEvent('toggleDebug', { show: false });
    });
  } else console.error('closeDebug not found');

  if (DOM.emailDebug) {
    DOM.emailDebug.addEventListener('touchstart', async (event) => {
      if (event.cancelable) event.preventDefault();
      console.log('emailDebug touched');
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
        console.error('Email log error:', err.message);
        dispatchEvent('logError', { message: err.message });
        await speak('emailError');
      }
    });
  } else console.error('emailDebug not found');

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

  setTimeout(() => {
    Object.entries(DOM).forEach(([key, value]) => {
      console.log(`DOM Element - ${key}:`, value);
    });
  }, 100);

  console.log('setupRectangleHandlers: Setup complete');
}
