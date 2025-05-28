import { initializeAudio, audioContext } from '../audio-processor.js';
import { settings, setStream, setAudioInterval } from '../state.js';
import { speak } from './utils.js';

/**
 * Sets up event listeners for rectangle buttons (settings, mode, language, start/stop).
 * @param {Object} options - Configuration options.
 * @param {Function} options.dispatchEvent - Event dispatcher function.
 */
export function setupRectangleHandlers({ dispatchEvent }) {
    const modeBtn = document.getElementById('modeBtn');
    const languageBtn = document.getElementById('languageBtn');
    const startStopBtn = document.getElementById('startStopBtn');
    const settingsToggle = document.getElementById('settingsToggle');
    let settingsMode = false;

    function updateButtonLabels(settingsMode) {
        modeBtn.textContent = settingsMode ? 'Select Grid' : 'Daylight';
        modeBtn.setAttribute('aria-label', settingsMode ? 'Select grid type' : 'Toggle day/night mode');
        languageBtn.textContent = settingsMode ? 'Select Engine' : 'Language';
        languageBtn.setAttribute('aria-label', settingsMode ? 'Select synthesis engine' : 'Cycle languages');
    }

    settingsToggle.addEventListener('touchstart', (event) => {
        event.preventDefault();
        if (navigator.vibrate) navigator.vibrate(50);
        settingsMode = !settingsMode;
        settingsToggle.setAttribute('aria-label', settingsMode ? 'Exit settings mode' : 'Toggle settings mode');
        updateButtonLabels(settingsMode);
        speak('settingsToggle', { state: settingsMode ? 'on' : 'off' });
        dispatchEvent('updateUI', { settingsMode });
    });

    modeBtn.addEventListener('touchstart', (event) => {
        event.preventDefault();
        if (navigator.vibrate) navigator.vibrate(50);
        if (settingsMode) {
            settings.gridType = settings.gridType === 'hex-tonnetz' ? 'circle-of-fifths' : 'hex-tonnetz';
            speak('gridSelect', { grid: settings.gridType });
        } else {
            settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
            speak('modeBtn', { mode: settings.dayNightMode });
        }
        updateButtonLabels(settingsMode);
        dispatchEvent('updateUI', { settingsMode });
    });

    languageBtn.addEventListener('touchstart', (event) => {
        event.preventDefault();
        if (navigator.vibrate) navigator.vibrate(50);
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
        dispatchEvent('updateUI', { settingsMode });
    });

    let rafId;
    function processFrameLoop() {
        dispatchEvent('processFrame');
        rafId = requestAnimationFrame(processFrameLoop);
    }

    startStopBtn.addEventListener('touchstart', async (event) => {
        event.preventDefault();
        if (navigator.vibrate) navigator.vibrate(50);
        if (!audioContext) {
            try {
                const newContext = new (window.AudioContext || window.webkitAudioContext)();
                await initializeAudio(newContext);
                if (audioContext.state === 'suspended') {
                    await audioContext.resume();
                }
            } catch (err) {
                console.error('Audio initialization failed:', err);
                speak('audioError');
                return;
            }
        } else if (audioContext.state === 'suspended') {
            await audioContext.resume();
        }
        if (!audioContext) {
            console.error('Audio not initialized');
            speak('audioError');
            return;
        }
        if (settings.stream) {
            settings.stream.getTracks().forEach(track => track.stop());
            setStream(null);
            document.getElementById('videoFeed').style.display = 'none';
            if (settings.audioInterval) {
                cancelAnimationFrame(rafId);
                setAudioInterval(null);
            }
            speak('startStop', { state: 'stopped' });
            dispatchEvent('updateUI', { settingsMode });
            return;
        }
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            setStream(newStream);
            const video = document.getElementById('videoFeed');
            const canvas = document.getElementById('imageCanvas');
            const centerRect = document.getElementById('centerRectangle');
            video.srcObject = newStream;
            video.style.display = 'block';
            canvas.width = centerRect.offsetWidth / 2;
            canvas.height = centerRect.offsetHeight / 2;
            speak('startStop', { state: 'started' });
            setAudioInterval('raf');
            processFrameLoop();
            dispatchEvent('updateUI', { settingsMode });
        } catch (err) {
            console.error('Camera access failed:', err);
            speak('cameraError');
        }
    });
}