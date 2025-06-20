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

    function tryVibrate() {
        if (navigator.vibrate) navigator.vibrate(50);
    }

    async function ensureAudioContext() {
        if (!isAudioInitialized) {
            try {
                const newContext = new (window.AudioContext || window.webkitAudioContext)();
                await initializeAudio(newContext);
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }
                isAudioInitialized = true;
            } catch (err) {
                console.error('Audio initialization failed:', err);
                speak('audioError');
                dispatchEvent('logError', { message: `Audio initialization failed: ${err.message}` });
            }
        } else if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
    }

    function updateButtonLabels(settingsMode) {
        dispatchEvent('updateUI', { settingsMode, streamActive: !!settings.stream });
    }

    settingsToggle.addEventListener('touchstart', async (event) => {
        event.preventDefault();
        await ensureAudioContext();
        tryVibrate();
        touchCount++;
        if (touchCount === 2) {
            touchCount = 0;
            dispatchEvent('toggleDebug', { show: true });
        }
        settingsMode = !settingsMode;
        updateButtonLabels(settingsMode);
        speak('settingsToggle', { state: settingsMode ? 'on' : 'off' });
    });

    modeBtn.addEventListener('touchstart', async (event) => {
        event.preventDefault();
        await ensureAudioContext();
        tryVibrate();
        if (settingsMode) {
            settings.gridType = settings.gridType === 'hex-tonnetz' ? 'circle-of-fifths' : 'hex-tonnetz';
            speak('gridSelect', { grid: settings.gridType });
        } else {
            settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
            speak('modeBtn', { mode: settings.dayNightMode });
        }
        updateButtonLabels(settingsMode);
    });

    languageBtn.addEventListener('touchstart', async (event) => {
        event.preventDefault();
        await ensureAudioContext();
        tryVibrate();
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

    // Suspender recursos en segundo plano
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

    // Suspender tras inactividad
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
            }
        }, 60000); // 60 segundos
    }

    startStopBtn.addEventListener('touchstart', async (event) => {
        event.preventDefault();
        await ensureAudioContext();
        tryVibrate();
        resetInactivityTimeout();
        if (!audioContext) {
            dispatchEvent('logError', { message: 'AudioContext not initialized' });
            return;
        }
        if (settings.stream) {
            clearTimeout(inactivityTimeout);
            settings.stream.getTracks().forEach(track => track.stop());
            setStream(null);
            const video = document.getElementById('videoFeed');
            video.srcObject = null;
            video.style.display = 'none';
            if (rafId) {
                cancelAnimationFrame(rafId);
                rafId = null;
                setAudioInterval(null);
            }
            audioContext.suspend();
            speak('startStop', { state: 'stopped' });
            dispatchEvent('updateUI', { settingsMode, streamActive: false });
            loadingIndicator.style.display = 'none';
            return;
        }
        loadingIndicator.style.display = 'block';
        try {
            const isLowEndDevice = navigator.hardwareConcurrency < 4;
            settings.updateInterval = isLowEndDevice ? 100 : 50;
            const canvas = document.getElementById('imageCanvas');
            const centerRect = document.getElementById('centerRectangle');
            canvas.width = isLowEndDevice ? 32 : 64; // Reducir resolución en dispositivos de baja potencia
            canvas.height = isLowEndDevice ? 24 : 48;
            const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            setStream(newStream);
            const video = document.getElementById('videoFeed');
            video.srcObject = newStream;
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
    });

    document.getElementById('closeDebug').addEventListener('touchstart', (event) => {
        event.preventDefault();
        tryVibrate();
        dispatchEvent('toggleDebug', { show: false });
    });

    // Resetear inactividad en cualquier interacción
    document.addEventListener('touchstart', resetInactivityTimeout);
}