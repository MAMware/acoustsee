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

    /**
     * Toggles settings mode, shifting button functions.
     */
    settingsToggle.addEventListener('touchstart', (event) => {
        event.preventDefault();
        settingsMode = !settingsMode;
        settingsToggle.setAttribute('aria-label', settingsMode ? 'Exit settings mode' : 'Toggle settings mode');
        dispatchEvent('updateUI', { settingsMode });
        speak('settingsToggle', { state: settingsMode ? 'on' : 'off' });
    });

    /**
     * Toggles day/night mode or selects grid in settings mode.
     */
    modeBtn.addEventListener('touchstart', (event) => {
        event.preventDefault();
        if (settingsMode) {
            settings.gridType = settings.gridType === 'hex-tonnetz' ? 'circle-of-fifths' : 'hex-tonnetz';
            speak('gridSelect', { grid: settings.gridType });
        } else {
            settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
            speak('modeBtn', { mode: settings.dayNightMode });
        }
        dispatchEvent('updateUI', { settingsMode });
    });

    /**
     * Cycles language or selects synthesis engine in settings mode.
     */
    languageBtn.addEventListener('touchstart', (event) => {
        event.preventDefault();
        if (settingsMode) {
            settings.synthesisEngine = settings.synthesisEngine === 'sine-wave' ? 'fm-synthesis' : 'sine-wave';
            speak('synthesisSelect', { engine: settings.synthesisEngine });
        } else {
            const languages = ['en-US', 'es-ES']; // Add more via languages/*.json
            const currentIndex = languages.indexOf(settings.language || 'en-US');
            settings.language = languages[(currentIndex + 1) % languages.length];
            speak('languageSelect', { lang: settings.language });
        }
        dispatchEvent('updateUI', { settingsMode });
    });

    /**
     * Starts or stops video and audio processing.
     */
    startStopBtn.addEventListener('touchstart', async (event) => {
        event.preventDefault();
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
                clearInterval(settings.audioInterval);
                setAudioInterval(null);
            }
            speak('startStop', { state: 'stopped' });
            dispatchEvent('updateUI', { settingsMode });
            return;
        }
        try {
            const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            setStream(newStream);
            document.getElementById('videoFeed').srcObject = newStream;
            document.getElementById('videoFeed').style.display = 'block';
            document.getElementById('imageCanvas').width = 64;
            document.getElementById('imageCanvas').height = 48;
            speak('startStop', { state: 'started' });
            setAudioInterval(setInterval(() => dispatchEvent('processFrame'), settings.updateInterval));
            dispatchEvent('updateUI', { settingsMode });
        } catch (err) {
            console.error('Camera access failed:', err);
            speak('cameraError');
        }
    });
}
