import { initializeAudio, audioContext } from '../audio-processor.js';
import { settings, setStream, setAudioInterval, setSkipFrame } from '../state.js';
import { speak } from './utils.js';

export function setupRectangleHandlers({ dispatchEvent }) {
    const modeBtn = document.getElementById('modeBtn');
    const languageBtn = document.getElementById('languageBtn');
    const startStopBtn = document.getElementById('startStopBtn');
    const settingsToggle = document.getElementById('settingsToggle');
    const loadingIndicator = document.getElementById('loadingIndicator');
    let settingsMode = false;
    let touchCount = 0;
    let isAudioInitialized = false;
    let lastFrameTime = performance.now();

    function tryVibrate(event) {
        if (event.cancelable && navigator.vibrate && isAudioInitialized) {
            event.preventDefault();
            navigator.vibrate(50);
        }
    }

    async function ensureAudioContext() {
        if (!isAudioInitialized) {
            try {
                const newContext = new (window.AudioContext || window.webkitAudioContext)();
                await initializeAudio(newContext);
                if (newContext.state === 'suspended') {
                    await newContext.resume();
                }
                audioContext = newContext; // Asignar explícitamente
                isAudioInitialized = true;
            } catch (err) {
                console.error('Audio initialization failed:', err);
                speak('audioError');
                dispatchEvent('logError', { message: `Audio initialization failed: ${err.message}` });
                return false;
            }
        } else if (audioContext.state === 'suspended') {
            try {
                await audioContext.resume();
            } catch (err) {
                console.error('Audio resume failed:', err);
                speak('audioError');
                dispatchEvent('logError', { message: `Audio resume failed: ${err.message}` });
                return false;
            }
        }
        return true;
    }

    function updateButtonLabels(settingsMode) {
        dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream });
    }

    settingsToggle.addEventListener('touchstart', async (event) => {
        tryVibrate(event);
        if (await ensureAudioContext()) {
            touchCount++;
            if (touchCount === 2) {
                touchCount = 0;
                dispatchEvent('toggleDebug', { show: true });
            }
            settingsMode = !settingsMode;
            updateButtonLabels(settingsMode);
            speak('settingsToggle', { state: settingsMode ? 'on' : 'off' });
        }
    });

    modeBtn.addEventListener('touchstart', async (event) => {
        tryVibrate(event);
        if (await ensureAudioContext()) {
            if (settingsMode) {
                settings.gridType = settings.gridType === 'hex-tonnetz' ? 'circle-of-fifths' : 'hex-tonnetz';
                speak('gridSelect', { grid: settings.gridType });
            } else {
                settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
                speak('modeBtn', { mode: settings.dayNightMode });
            }
            updateButtonLabels(settingsMode);
        }
    });

    languageBtn.addEventListener('touchstart', async (event) => {
        tryVibrate(event);
        if (await ensureAudioContext()) {
            if (settingsMode) {
                settings.synthesisEngine = settings.synthesisEngine === 'sine-wave' ? 'fm-synthesis' : 'sine-wave';
                speak('synthesisSelect', { engine: settings.synthesisEngine });
            } else {
                const languages = ['en-US', 'es-ES'];
                const currentIndex = languages.indexOf(settings.language || 'en-US');
                settings.language = languages[(currentIndex + 1) % languages.length];
                speak('languageSelect', { lang: settings.language });
            }
            updateButtonLabels(settingsMode);
        }
    });

    let rafId;
    function processFrameLoop(timestamp) {
        if (!settings.stream) return;
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
        if (document.hidden && settings.stream) {
            audioContext.suspend();
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
                setAudioInterval(null);
            }
        } else if (!document.hidden && settings.stream) {
            audioContext.resume();
            processFrameLoop(performance.now());
        }
    });

    let inactivityTimeout;
    function resetInactivityTimeout() {
        clearTimeout(inactivityTimeout);
        inactivityTimeout = setTimeout(() => {
            if (settings.stream) {
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
        tryVibrate(event);
        resetInactivityTimeout();
        if (await ensureAudioContext()) {
            if (settings.stream) {
                clearTimeout(inactivityTimeout);
                try {
                    settings.stream.getTracks().forEach(track => track.stop());
                    setStream(null);
                    const video = document.getElementById('videoFeed');
                    video.srcObject = null;
                    video.pause(); // Asegurar que el video se detenga
                    video.style.display = 'none';
                    if (rafId) {
                        cancelAnimationFrame(rafId);
                        rafId = null;
                        setAudioInterval(null);
                    }
                    await audioContext.suspend();
                    speak('startStop', { state: 'stopped' });
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
                const centerRect = document.getElementById('centerRectangle');
                canvas.width = isLowEndDevice ? 32 : 64;
                canvas.height = isLowEndDevice ? 24 : 48;
                const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: 320, height: 240 } });
                setStream(newStream);
                const video = document.getElementById('videoFeed');
                video.srcObject = newStream;
                video.play(); // Iniciar video explícitamente
                video.style.display = 'block';
                speak('startStop', { state: 'started' });
                setAudioInterval('raf');
                lastFrameTime = performance.now();
                processFrameLoop(lastFrameTime);
                dispatchEvent('updateUI', { settingsMode, streamActive: true });
                loadingIndicator.style.display = 'none';
            } catch (err) {
                console.error('Camera access failed:', err);
                speak('cameraError');
                dispatchEvent('logError', { message: `Camera access failed: ${err.message}` });
                loadingIndicator.style.display = 'none';
            }
        }
    });

    document.getElementById('closeDebug').addEventListener('touchstart', (event) => {
        tryVibrate(event);
        dispatchEvent('toggleDebug', { show: false });
    });

    document.addEventListener('touchstart', resetInactivityTimeout);
}