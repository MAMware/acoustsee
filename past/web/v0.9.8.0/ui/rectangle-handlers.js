import { initializeAudio, audioContext, stopAudio } from '../audio-processor.js';
import { settings, setStream, setAudioInterval } from '../state.js';
import { speak } from './utils.js';

/**
 * Sets up event listeners for rectangle buttons.
 * @param {Object} options - Configuration options.
 * @param {Function} options.dispatchEvent - Event dispatcher function.
 */
export function setupRectangleHandlers({ dispatchEvent }) {
    const modeBtn = document.getElementById('modeBtn');
    const languageBtn = document.getElementById('languageBtn');
    const startStopBtn = document.getElementById('startStopBtn');
    const settingsToggle = document.getElementById('settingsToggle');
    let settingsMode = false;

    settingsToggle.addEventListener('touchstart', (event) => {
        event.preventDefault();
        settingsMode = !settingsMode;
        settingsToggle.setAttribute('aria-label', settingsMode ? 'Exit settings mode' : 'Toggle settings mode');
        dispatchEvent('updateUI', { settingsMode });
        speak('settingsToggle', { state: settingsMode ? 'on' : 'off' });
    });

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

    languageBtn.addEventListener('touchstart', (event) => {
        event.preventDefault();
        if (settingsMode) {
            settings.synthesisEngine = settings.synthesisEngine === 'sine-wave' ? 'fm-synthesis' : 'sine-wave';
            speak('synthesisSelect', { engine: settings.synthesisEngine });
        } else {
            const languages = ['en-US', 'es-ES'];
            const currentIndex = languages.indexOf(settings.language || 'en-US');
            settings.language = languages[(currentIndex + 1) % languages.length];
            speak('languageSelect', { lang: settings.language });
        }
        dispatchEvent('updateUI', { settingsMode });
    });

    startStopBtn.addEventListener('touchstart', (event) => {
        event.preventDefault();
        if (settings.stream) {
            settings.stream.getTracks().forEach(track => track.stop());
            setStream(null);
            document.getElementById('videoFeed').style.display = 'none';
            if (settings.audioInterval) {
                clearInterval(settings.audioInterval);
                setAudioInterval(null);
            }
            stopAudio();
            startStopBtn.textContent = 'Start';
            startStopBtn.setAttribute('aria-label', 'Start navigation');
            speak('startStop', { state: 'stopped' });
            dispatchEvent('updateUI', { settingsMode });
            return;
        }

        // Initialize AudioContext synchronously within gesture
        try {
            if (!audioContext) {
                const newContext = new (window.AudioContext || window.webkitAudioContext)();
                initializeAudio(newContext);
            }
            if (audioContext.state === 'suspended') {
                audioContext.resume().catch(err => console.error('Resume failed:', err));
            }
        } catch (err) {
            console.error('AudioContext setup failed:', err);
            speak('cameraError');
            return;
        }

        // Async operations after AudioContext setup
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } })
            .then(newStream => {
                setStream(newStream);
                document.getElementById('videoFeed').srcObject = newStream;
                document.getElementById('videoFeed').style.display = 'block';
                document.getElementById('imageCanvas').width = 64;
                document.getElementById('imageCanvas').height = 48;
                startStopBtn.textContent = 'Stop';
                startStopBtn.setAttribute('aria-label', 'Stop navigation');
                speak('startStop', { state: 'started' });
                setAudioInterval(setInterval(() => dispatchEvent('processFrame'), settings.updateInterval));
                dispatchEvent('updateUI', { settingsMode });
            })
            .catch(err => {
                console.error('Camera failed:', err);
                speak('cameraError');
            });
    });
}
