import { initializeAudio, playAudio } from './audio-processor.js';
import { mapFrame } from './grid-selector.js';
import { settings, stream, audioInterval, prevFrameDataLeft, prevFrameDataRight } from './state.js';

export function setupUI() {
    const fpsBtn = document.getElementById('fpsBtn');
    const modeBtn = document.getElementById('modeBtn');
    const gridSelect = document.getElementById('gridSelect');
    const synthesisSelect = document.getElementById('synthesisSelect');
    const languageSelect = document.getElementById('languageSelect');
    const startStopBtn = document.getElementById('startStopBtn');
    const settingsToggle = document.getElementById('settingsToggle');
    const debug = document.getElementById('debug');
    const debugText = document.getElementById('debugText');
    let frameCount = 0, lastTime = performance.now();
    let skipFrame = false;
    let settingsMode = false;

    settingsToggle.addEventListener('click', () => {
        settingsMode = !settingsMode;
        gridSelect.style.display = settingsMode ? 'block' : 'none';
        synthesisSelect.style.display = settingsMode ? 'block' : 'none';
        modeBtn.style.display = settingsMode ? 'none' : 'block';
        languageSelect.style.display = settingsMode ? 'none' : 'block';
        speak(`Settings ${settingsMode ? 'on' : 'off'}`);
    });

    fpsBtn.addEventListener('click', () => {
        const intervals = [50, 100, 250];
        settings.updateInterval = intervals[(intervals.indexOf(settings.updateInterval) + 1) % 3] || 50;
        speak(`FPS set to ${1000 / settings.updateInterval}`);
        if (audioInterval) {
            clearInterval(audioInterval);
            audioInterval = setInterval(() => processFrame(), settings.updateInterval);
        }
    });

    fpsBtn.addEventListener('dblclick', () => {
        debug.style.display = debug.style.display === 'block' ? 'none' : 'block';
        speak(`Debug ${debug.style.display === 'block' ? 'on' : 'off'}`);
    });

    modeBtn.addEventListener('click', () => {
        settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
        speak(`Mode set to ${settings.dayNightMode}`);
    });

    gridSelect.addEventListener('change', (event) => {
        settings.gridType = event.target.value;
        speak(`Grid set to ${settings.gridType}`);
    });

    synthesisSelect.addEventListener('change', (event) => {
        settings.synthesisEngine = event.target.value;
        speak(`Synthesis engine set to ${settings.synthesisEngine}`);
    });

    languageSelect.addEventListener('change', (event) => {
        settings.language = event.target.value;
        speak(`Language set to ${event.target.options[event.target.selectedIndex].text}`);
    });

    startStopBtn.addEventListener('click', async () => {
        initializeAudio();
        if (!audioContext) {
            console.error('Audio not initialized');
            speak('Failed to initialize audio');
            return;
        }
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            document.getElementById('videoFeed').style.display = 'none';
            clearInterval(audioInterval);
            speak('Navigation stopped');
            return;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            document.getElementById('videoFeed').srcObject = stream;
            document.getElementById('videoFeed').style.display = 'block';
            document.getElementById('imageCanvas').width = 64;
            document.getElementById('imageCanvas').height = 48;
            speak('Navigation started');
            audioInterval = setInterval(() => processFrame(), settings.updateInterval);
        } catch (err) {
            console.error('Camera access failed:', err);
            speak('Failed to access camera');
        }
    });

    centerRectangle.addEventListener('click', () => {
        if (settingsMode) {
            // Confirm settings selection
            speak(`Settings confirmed: Grid ${settings.gridType}, Synthesis ${settings.synthesisEngine}`);
        }
    });

    function speak(text) {
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = settings.language || 'en-US';
            window.speechSynthesis.speak(utterance);
        }
    }
}

export function processFrame() {
    if (skipFrame) {
        skipFrame = false;
        return;
    }
    const videoFeed = document.getElementById('videoFeed');
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoFeed, 0, 0, 64, 48);
    const imageData = ctx.getImageData(0, 0, 64, 48);
    const grayData = new Uint8ClampedArray(64 * 48);
    for (let i = 0; i < imageData.data.length; i += 4) {
        grayData[i / 4] = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
    }
    const { prevFrameDataLeft: newLeft, prevFrameDataRight: newRight } = playAudio(
        grayData, 64, 48, prevFrameDataLeft, prevFrameDataRight
    );
    prevFrameDataLeft = newLeft;
    prevFrameDataRight = newRight;

    frameCount++;
    const now = performance.now();
    const elapsed = now - lastTime;
    if (elapsed >= 1000) {
        const fps = (frameCount / elapsed) * 1000;
        const frameTime = (elapsed / frameCount).toFixed(1);
        const activeNotes = allNotes.map(n => `${Math.round(n.pitch)}Hz (${n.pan > 0 ? 'R' : 'L'})`).join(', ');
        if (debug.style.display === 'block') {
            debugText.textContent = `Frame time: ${frameTime}ms\nFPS: ${fps.toFixed(1)}\nGrid: ${settings.gridType}\nNotes: ${activeNotes || 'None'}`;
        }
        frameCount = 0;
        lastTime = now;
    }
}
