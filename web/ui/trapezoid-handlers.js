import { initializeAudio, audioContext } from '../audio-processor.js';
import { settings, setStream, setAudioInterval } from '../state.js';
import { speak } from './utils.js';

/**
 * Sets up event listeners for trapezoid buttons (settings, mode, language, start/stop).
 * @param {Object} options - Configuration options.
 * @param {Function} options.dispatchEvent - Event dispatcher function.
 */
export function setupTrapezoidHandlers({ dispatchEvent }) {
    const modeBtn = document.getElementById('modeBtn');
    const languageBtn = document.getElementById('languageBtn');
    const startStopBtn = document.getElementById('startStopBtn');
    const settingsToggle = document.getElementById('settingsToggle');
    let settingsMode = false;

    /**
     * Toggles settings menu and updates ARIA attributes.
     */
    settingsToggle.addEventListener('touchstart', (event) => {
        event.preventDefault();
        settingsMode = !settingsMode;
        settingsToggle.setAttribute('aria-expanded', settingsMode);
        dispatchEvent('toggleSettings', { settingsMode });
        speak(`settingsToggle`, { state: settingsMode ? 'on' : 'off' });
    });

    /**
     * Handles keyboard navigation for settings toggle.
     */
    settingsToggle.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            settingsMode = !settingsMode;
            settingsToggle.setAttribute('aria-expanded', settingsMode);
            dispatchEvent('toggleSettings', { settingsMode });
            speak(`settingsToggle`, { state: settingsMode ? 'on' : 'off' });
        }
    });

    /**
     * Toggles day/night mode.
     */
    modeBtn.addEventListener('touchstart', (event) => {
        event.preventDefault();
        settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
        dispatchEvent('updateUI');
        speak(`modeBtn`, { mode: settings.dayNightMode });
    });

    /**
     * Handles keyboard navigation for mode button.
     */
    modeBtn.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
            dispatchEvent('updateUI');
            speak(`modeBtn`, { mode: settings.dayNightMode });
        }
    });

    /**
     * Toggles language selection dropdown.
     */
    languageBtn.addEventListener('touchstart', (event) => {
        event.preventDefault();
        dispatchEvent('toggleLanguageSelect', { settingsMode });
        speak(`languageBtn`);
    });

    /**
     * Handles keyboard navigation for language button.
     */
    languageBtn.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            dispatchEvent('toggleLanguageSelect', { settingsMode });
            speak(`languageBtn`);
        }
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
            dispatchEvent('updateUI');
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
            dispatchEvent('updateUI');
        } catch (err) {
            console.error('Camera access failed:', err);
            speak('cameraError');
        }
    });
}
