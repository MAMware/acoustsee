import { initializeAudio, audioContext, isAudioInitialized } from '../audio-processor.js';
import { settings, setStream, setAudioInterval, setSkipFrame } from '../state.js';
import { speak } from './utils.js';

export function setupRectangleHandlers({ dispatchEvent }) {
    const modeBtn = document.getElementById('modeBtn');
    const languageBtn = document.getElementById('languageBtn');
    const startStopBtn = document.getElementById('startStopBtn');
    const settingsToggle = document.getElementById('settingsToggle');
    const audioToggle = document.getElementById('audioToggle');
    const loadingIndicator = document.getElementById('loadingIndicator');
    // Debug: Verify DOM elements with delay
    setTimeout(() => {
        console.log('DOM Elements - audioToggle:', audioToggle);
        console.log('DOM Elements - startStopBtn:', startStopBtn);
        console.log('DOM Elements - settingsToggle:', settingsToggle);
        console.log('DOM Elements - modeBtn:', modeBtn);
        console.log('DOM Elements - languageBtn:', languageBtn);
        console.log('DOM Elements - loadingIndicator:', loadingIndicator);
    }, 100); // Small delay to ensure DOM readiness

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

    async function ensureAudioContext() { // Marked as async
        if (!isAudioInitialized && !audioContext) {
            try {
                const newContext = new (window.AudioContext || window.webkitAudioContext)();
                initializeAudio(newContext);
                console.log('AudioContext initialized:', isAudioInitialized, newContext.state);
                if (newContext.state === 'suspended') {
                    await newContext.resume(); // Await resume
                    console.log('AudioContext resumed:', newContext.state);
                    audioEnabled = true;
                    audioToggle.textContent = 'Audio On';
                    await speak('audioOn'); // Await speech
                } else {
                    audioEnabled = true;
                    audioToggle.textContent = 'Audio On';
                    await speak('audioOn'); // Await speech
                    console.log('AudioContext already running:', newContext.state); // Added log
                }
            } catch (err) {
                console.error('Audio initialization failed:', err);
                await speak('audioError'); // Await speech
                dispatchEvent('logError', { message: `Audio initialization failed: ${err.message}` });
            }
        } else if (audioContext && audioContext.state === 'suspended') {
            await audioContext.resume(); // Await resume
            console.log('AudioContext resumed:', audioContext.state);
            audioEnabled = true;
            audioToggle.textContent = 'Audio On';
            await speak('audioOn'); // Await speech
        }
        return isAudioInitialized;
    }

    function updateButtonLabels(settingsMode) {
        dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream });
    }

    audioToggle.addEventListener('touchstart', async (event) => {
        console.log('audioToggle touched');
        tryVibrate(event);
        if (!audioEnabled) {
            await ensureAudioContext(); // Await the async function
            audioToggle.textContent = 'Audio On'; // Moved here to ensure update after async completion
        }
    });

    settingsToggle.addEventListener('touchstart', async (event) => {
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

    modeBtn.addEventListener('touchstart', async (event) => {
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

    languageBtn.addEventListener('touchstart', async (event) => {
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
                document.getElementById('videoFeed').srcObject = null;
                document.getElementById('videoFeed').style.display = 'none';
                audioContext.suspend();
                if (rafId) {
                    cancelAnimationFrame(rafId);
                    rafId = null;
                    setAudioInterval(null);
                }
                dispatchEvent('updateUI', { settingsMode, streamActive: false });
                loadingIndicator.style.display = 'none';
            }
        }, 60000);
    }

    startStopBtn.addEventListener('touchstart', async (event) => {
        console.log('startStopBtn touched');
        tryVibrate(event);
        resetInactivityTimeout();
        if (audioEnabled) {
            if (settings.stream) {
                clearTimeout(inactivityTimeout);
                try {
                    settings.stream.getTracks().forEach(track => track.stop());
                    setStream(null);
                    const video = document.getElementById('videoFeed');
                    video.srcObject = null;
                    video.pause();
                    video.style.display = 'none';
                    if (rafId) {
                        cancelAnimationFrame(rafId);
                        rafId = null;
                        setAudioInterval(null);
                    }
                    if (audioContext) audioContext.suspend();
                    await speak('startStop', { state: 'stopped' });
                    dispatchEvent('updateUI', { settingsMode, streamActive: false });
                    loadingIndicator.style.display = 'none';
                } catch (err) {
                    console.error('Failed to stop stream:', err);
                    dispatchEvent('logError', { message: `Failed to stop stream: ${err.message}` });
                }
                return;
            }
            loadingIndicator.style.display = 'block';
            try {
                const isLowEndDevice = navigator.hardwareConcurrency < 4;
                settings.updateInterval = isLowEndDevice ? 100 : 50;
                const canvas = document.getElementById('imageCanvas');
                canvas.width = isLowEndDevice ? 32 : 64;
                canvas.height = isLowEndDevice ? 24 : 48;
                const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } });
                setStream(newStream);
                const video = document.getElementById('videoFeed');
                video.srcObject = newStream;
                video.play().then(async () => { // Added async to then callback
                    video.style.display = 'block';
                    await speak('startStop', { state: 'started' }); // Await inside async then
                    setAudioInterval('raf');
                    lastFrameTime = performance.now();
                    processFrameLoop(lastFrameTime);
                    dispatchEvent('updateUI', { settingsMode, streamActive: true });
                    loadingIndicator.style.display = 'none';
                }).catch(async (err) => { // Added async to catch callback
                    console.error('Video play failed:', err);
                    await speak('cameraError'); // Await inside async catch
                    dispatchEvent('logError', { message: `Video play failed: ${err.message}` });
                    loadingIndicator.style.display = 'none';
                });
            } catch (err) {
                console.error('Camera access failed:', err);
                await speak('cameraError');
                dispatchEvent('logError', { message: `Camera access failed: ${err.message}` });
                loadingIndicator.style.display = 'none';
            }
        } else {
            await speak('audioNotEnabled');
        }
    });

    document.getElementById('closeDebug').addEventListener('touchstart', (event) => {
        console.log('closeDebug touched');
        tryVibrate(event);
        dispatchEvent('toggleDebug', { show: false });
    });

    document.addEventListener('touchstart', resetInactivityTimeout);
}
