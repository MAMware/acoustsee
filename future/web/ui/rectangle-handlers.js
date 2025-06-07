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

  // Ensure debug panel is hidden on load
  if (DOM.debug) {
    DOM.debug.style.display = 'none';
    console.log('Debug panel hidden on load');
  } else {
    console.error('Debug panel not found');
  }

  function tryVibrate(event) {
    if (event.cancelable && navigator.vibrate && isAudioInitialized) {
      event.preventDefault();
      navigator.vibrate(50);
    }
  }

  async function ensureAudioContext() {
    if (!isAudioInitialized) {
      try {
        console.log('ensureAudioContext: Initializing audio');
        if (!audioContext) {
          throw new Error('audioContext is not initialized. Please tap audio toggle again.');
        }
        const initSuccess = await initializeAudio(audioContext);
        if (!initSuccess) {
          throw new Error('Audio initialization failed');
        }
        audioEnabled = true;
        if (DOM.audioToggle) DOM.audioToggle.textContent = 'Audio On';
        await speak('audioOn');
        console.log('ensureAudioContext: Audio initialized successfully');
        return true;
      } catch (err) {
        console.error('Audio initialization failed:', err.message);
        dispatchEvent('logError', { message: `Audio init failed: ${err.message}` });
        await speak('audioError');
        return false;
      }
    } else if (audioContext && audioContext.state === 'suspended') {
      try {
        console.log('ensureAudioContext: Resuming audio context');
        await audioContext.resume();
        audioEnabled = true;
        if (DOM.audioToggle) DOM.audioToggle.textContent = 'Audio On';
        await speak('audioOn');
        console.log('ensureAudioContext: Audio resumed successfully');
        return true;
      } catch (err) {
        console.error('Audio resume failed:', err.message);
        dispatchEvent('logError', { message: `Audio resume failed: ${err.message}` });
        await speak('audioError');
        return false;
      }
    }
    console.log('ensureAudioContext: Audio already initialized');
    return true;
  }

  //function resetInactivityTimeout() {
  //  clearTimeout(inactivityTimeout);
  //  inactivityTimeout = setTimeout(() => {
  //    if (settings.stream && audioContext) {
  //      console.log('Inactivity timeout: Stopping stream');
  //      settings.stream.getTracks().forEach(track => {
  //        console.log('Stopping track:', track);
  //        track.stop();
  //      });
  //      setStream(null);
  //      if (DOM.videoFeed) {
  //        DOM.videoFeed.srcObject = null;
  //        DOM.videoFeed.style.display = 'none';
  //      }
  //      audioContext.suspend();
  //      if (rafId) {
  //        cancelAnimationFrame(rafId);
  //        rafId = null;
  //        setAudioInterval(null);
  //      }
  //      dispatchEvent('updateUI', { settingsMode: false, streamActive: false });
  //      if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'none';
  //    }
  //  }, 60000);
 // }

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
    console.log('Processing frame at:', timestamp);
    processFrame(DOM.videoFeed, DOM.imageCanvas, DOM);
    rafId = requestAnimationFrame(processFrameLoop);
  }

  if (DOM.audioToggle) {
    DOM.audioToggle.addEventListener('touchstart', (event) => {
      console.log('audioToggle touched');
      tryVibrate(event);
      if (audioEnabled) {
        console.log('Audio already enabled');
        return;
      }
      try {
        console.log('Creating new AudioContext');
        const newContext = new (window.AudioContext || window.webkitAudioContext)();
        console.log('AudioContext state after creation:', newContext.state);
        // Synchronously resume within the user gesture
        if (newContext.state === 'suspended') {
          console.log('Resuming AudioContext synchronously after user gesture');
          newContext.resume().then(() => {
            console.log('AudioContext resumed, state:', newContext.state);
            if (newContext.state !== 'running') {
              throw new Error('AudioContext failed to resume');
            }
            if (typeof setAudioContext !== 'function') {
              throw new Error('setAudioContext is not defined');
            }
            setAudioContext(newContext);
            // Now that context is set, initialize asynchronously
            ensureAudioContext().catch(err => {
              console.error('Async audio initialization failed:', err.message);
              dispatchEvent('logError', { message: `Async audio init failed: ${err.message}` });
              speak('audioError', { message: 'Please tap again to enable audio' });
            });
          }).catch(err => {
            console.error('AudioContext resume failed:', err.message);
            dispatchEvent('logError', { message: `AudioContext resume failed: ${err.message}` });
            speak('audioError', { message: 'Please tap again to enable audio' });
          });
        } else if (newContext.state === 'running') {
          console.log('AudioContext is already running');
          setAudioContext(newContext);
          ensureAudioContext().catch(err => {
            console.error('Async audio initialization failed:', err.message);
            dispatchEvent('logError', { message: `Async audio init failed: ${err.message}` });
            speak('audioError', { message: 'Please tap again to enable audio' });
          });
        } else {
          throw new Error(`Unexpected AudioContext state: ${newContext.state}`);
        }
      } catch (err) {
        console.error('AudioContext creation failed:', err.message);
        dispatchEvent('logError', { message: `AudioContext creation failed: ${err.message}` });
        speak('audioError', { message: 'Please tap again to enable audio' });
      }
    });
    console.log('audioToggle event listener attached');
  } else {
    console.error('audioToggle element not found');
  }

  if (DOM.startStopBtn) {
    DOM.startStopBtn.addEventListener('touchstart', async (event) => {
      console.log('startStopBtn touched');
      tryVibrate(event);
      resetInactivityTimeout();
      try {
        if (!audioEnabled) {
          console.log('startStopBtn: Audio not enabled');
          await speak('audioNotEnabled');
          dispatchEvent('logError', { message: 'Audio not enabled' });
          return;
        }
        if (settings.stream) {
          console.log('Stopping existing stream');
          if (settings.stream.getTracks) {
            settings.stream.getTracks().forEach(track => {
              console.log('Stopping track:', track);
              track.stop();
            });
          } else {
            console.warn('No tracks available to stop on stream');
          }
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
          dispatchEvent('updateUI', { settingsMode: false, streamActive: false });
          if (DOM.loadingIndicator) DOM.loadingIndicator.style.display = 'none';
        } else {
          console.log('Starting new stream');
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
          console.log('Requesting webcam access with constraints:', constraints);
          const newStream = await navigator.mediaDevices.getUserMedia(constraints);
          console.log('Webcam stream obtained:', newStream);
          setStream(newStream);
          if (DOM.videoFeed) {
            DOM.videoFeed.srcObject = newStream;
            console.log('Playing video feed');
            await DOM.videoFeed.play();
            DOM.videoFeed.style.display = 'block';
            await speak('startStop', { state: 'started' });
            setAudioInterval('raf');
            lastFrameTime = performance.now();
            processFrameLoop(lastFrameTime);
            dispatchEvent('updateUI', { settingsMode: false, streamActive: true });
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
    console.log('startStopBtn event listener attached');
  } else {
    console.error('startStopBtn element not found');
  }

  if (DOM.languageBtn) {
    DOM.languageBtn.addEventListener('touchstart', async (event) => {
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
    console.log('languageBtn event listener attached');
  } else {
    console.error('languageBtn element not found');
  }

  if (DOM.closeDebug) {
    DOM.closeDebug.addEventListener('touchstart', (event) => {
      console.log('closeDebug touched');
      tryVibrate(event);
      dispatchEvent('toggleDebug', { show: false });
    });
    console.log('closeDebug event listener attached');
  } else {
    console.error('closeDebug element not found');
  }

  if (DOM.emailDebug) {
    DOM.emailDebug.addEventListener('touchstart', async (event) => {
      console.log('emailDebug touched');
      tryVibrate(event);
      try {
        const debugPre = DOM.debug?.querySelector('pre');
        const logContent = debugPre?.textContent || 'No errors logged';
        const subject = encodeURIComponent('AcoustSee Error Log');
        const body = encodeURIComponent(`Error Log from AcoustSee:\n\n${logContent}\n\nDevice Info: ${navigator.userAgent}`);
        const mailtoLink = `mailto:your-email@example.com?subject=${subject}&body=${body}`;
        window.location.href = mailtoLink;
        await speak('emailDebug', { state: 'sent' });
      } catch (err) {
        console.error('Error generating email log:', err.message);
        dispatchEvent('logError', { message: `Error generating email log: ${err.message}` });
        await speak('emailError');
      }
    });
    console.log('emailDebug event listener attached');
  } else {
    console.error('emailDebug element not found');
  }

 // document.addEventListener('visibilitychange', () => {
 //   if (document.hidden && settings.stream && audioContext) {
 //     audioContext.suspend();
 //     if (rafId) {
 //       cancelAnimationFrame(rafId);
 //       rafId = null;
 //       setAudioInterval(null);
 //     }
 //   } else if (!document.hidden && settings.stream && audioContext) {
 //     audioContext.resume();
 //     processFrameLoop(performance.now());
 //   }
 // });

//  document.addEventListener('touchstart', resetInactivityTimeout);

//  setTimeout(() => {
//    Object.entries(DOM).forEach(([key, value]) => {
//      console.log(`DOM Element - ${key}:`, value);
//    });
//  }, 100);

  console.log('setupRectangleHandlers: Setup complete');
}
