import { initializeAudio, audioContext, isAudioInitialized } from '../audio-processor.js';
import { settings, setStream, setAudioInterval, setSkipFrame } from '../state.js';
import { speak } from './utils.js';
import { DOM } from './dom.js';

export function setupRectangleHandlers({ dispatchEvent }) {
    // All DOM elements accessed via DOM object
    let settingsMode = false;
    let touchCount = 0;
    let lastFrameTime = performance.now();
    let audioEnabled = false;

    function tryVibrate(event) {
        if (event.cancelable && navigator.vibrate && isAudioInitialized && audioContext) {
            event.preventDefault();
            navigator.vibrate(50);
        }
    }

    async function ensureAudioContext() {
        if (!isAudioInitialized && !audioContext) {
            try {
                const newContext = new (window.AudioContext || window.webkitAudioContext)();
                initializeAudio(newContext);
                console.log('AudioContext initialized:', isAudioInitialized, newContext.state);
                if (newContext.state === 'suspended') {
                    await newContext.resume();
                    console.log('AudioContext resumed:', newContext.state);
                    audioEnabled = true;
                    DOM.audioToggle.textContent = 'Audio On';
                    await speak('audioOn');
                } else {
                    audioEnabled = true;
                    DOM.audioToggle.textContent = 'Audio On';
                    await speak('audioOn');
                    console.log('AudioContext already running:', newContext.state);
                }
            } catch (err) {
                console.error('Audio initialization failed:', err);
                await speak('audioError');
                dispatchEvent('logError', { message: `Audio initialization failed: ${err.message}` });
            }
        } else if (audioContext && audioContext.state === 'suspended') {
            await audioContext.resume();
            console.log('AudioContext resumed:', audioContext.state);
            audioEnabled = true;
            DOM.audioToggle.textContent = 'Audio On';
            await speak('audioOn');
        }
        return isAudioInitialized;
    }

    function updateButtonLabels(settingsMode) {
        dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream });
    }

    DOM.audioToggle.addEventListener('touchstart', async (event) => {
        console.log('audioToggle touched');
        tryVibrate(event);
        if (!audioEnabled) {
            await ensureAudioContext();
            DOM.audioToggle.textContent = 'Audio On';
        }
    });

    DOM.settingsToggle.addEventListener('touchstart', async (event) => {
        console.log('settingsToggle touched');
        tryVibrate(event);
        if (audioEnabled) {
            touchCount++;
            if (touchCount === 2) {
                touchCount = 0;
                dispatchEvent('toggleDebug', { show: true });
            }
            settingsMode = !settingsMode;
            updateButtonLabels(settingsMode);
            await speak('settingsToggle', { state: settingsMode ? 'on' : 'off' });
        }
    });

    DOM.modeBtn.addEventListener('touchstart', async (event) => {
        console.log('modeBtn touched');
        tryVibrate(event);
        if (audioEnabled) {
            if (settingsMode) {
                settings.gridType = settings.gridType === 'hex-tonnetz' ? 'circle-of-fifths' : 'hex-tonnetz';
                await speak('gridSelect', { grid: settings.gridType });
            } else {
                settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
                await speak('modeBtn', { mode: settings.dayNightMode });
            }
            updateButtonLabels(settingsMode);
        }
    });

    DOM.languageBtn.addEventListener('touchstart', async (event) => {
        console.log('languageBtn touched');
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
            updateButtonLabels(settingsMode);
        }
    });

    let rafId;
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
        dispatchEvent('processFrame');
        rafId = requestAnimationFrame(processFrameLoop);
    }

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

    let inactivityTimeout;
    function resetInactivityTimeout() {
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(() => {
            if (settings.stream && audioContext) {
                settings.stream.getTracks().forEach(track => track.stop());
                setStream(null);
                DOM.videoFeed.srcObject = null;
                DOM.videoFeed.style.display = 'none';
                audioContext.suspend();
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                    setAudioInterval(null);
                }
                dispatchEvent('updateUI', { settingsMode, streamActive: false });
                DOM.loadingIndicator.style.display = 'none';
            }
        }, 60000);
    }

    DOM.startStopBtn.addEventListener('touchstart', async (event) => {
        console.log('startStopBtn touched');
        tryVibrate(event);
        resetInactivityTimeout();
        if (audioEnabled) {
            if (settings.stream) {
                clearTimeout(inactivityTimeout);
                try {
                    settings.stream.getTracks().forEach(track => track.stop());
                    setStream(null);
                    DOM.videoFeed.srcObject = null;
                    DOM.videoFeed.pause();
                    DOM.videoFeed.style.display = 'none';
                    if (rafId) {
                        cancelAnimationFrame(rafId);
                        rafId = null;
                        setAudioInterval(null);
                    }
                    if (audioContext) audioContext.suspend();
                    await speak('startStop', { state: 'stopped' });
                    dispatchEvent('updateUI', { settingsMode, streamActive: false });
                    DOM.loadingIndicator.style.display = 'none';
                } catch (err) {
                    console.error('Failed to stop stream:', err);
                    dispatchEvent('logError', { message: `Failed to stop stream: ${err.message}` });
                }
                return;
            }
            DOM.loadingIndicator.style.display = 'block';
            try {
                const isLowEndDevice = navigator.hardwareConcurrency < 4;
                settings.updateInterval = isLowEndDevice ? 100 : 50;
                DOM.imageCanvas.width = isLowEndDevice ? 32 : 64;
                DOM.imageCanvas.height = isLowEndDevice ? 24 : 48;
                const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } });
                setStream(newStream);
                DOM.videoFeed.srcObject = newStream;
                DOM.videoFeed.play().then(async () => {
                    DOM.videoFeed.style.display = 'block';
                    await speak('startStop', { state: 'started' });
                    setAudioInterval('raf');
                    lastFrameTime = performance.now();
                    processFrameLoop(lastFrameTime);
                    dispatchEvent('updateUI', { settingsMode, streamActive: true });
                    DOM.loadingIndicator.style.display = 'none';
                }).catch(async (err) => {
                    console.error('Video play failed:', err);
                    await speak('cameraError');
                    dispatchEvent('logError', { message: `Video play failed: ${err.message}` });
                    DOM.loadingIndicator.style.display = 'none';
                });
            } catch (err) {
                console.error('Camera access failed:', err);
                await speak('cameraError');
                dispatchEvent('logError', { message: `Camera access failed: ${err.message}` });
                DOM.loadingIndicator.style.display = 'none';
            }
        } else {
            await speak('audioNotEnabled');
        }
    });

    DOM.closeDebug.addEventListener('touchstart', (event) => {
        console.log('closeDebug touched');
        tryVibrate(event);
        dispatchEvent('toggleDebug', { show: false });
    });

    document.addEventListener('touchstart', resetInactivityTimeout);

    // Optional: Debug logging of DOM elements
    setTimeout(() => {
        console.log('DOM Elements - audioToggle:', DOM.audioToggle);
        console.log('DOM Elements - startStopBtn:', DOM.startStopBtn);
        console.log('DOM Elements - settingsToggle:', DOM.settingsToggle);
        console.log('DOM Elements - modeBtn:', DOM.modeBtn);
        console.log('DOM Elements - languageBtn:', DOM.languageBtn);
        console.log('DOM Elements - loadingIndicator:', DOM.loadingIndicator);
    }, 100);
}
