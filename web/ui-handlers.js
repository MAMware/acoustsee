import { initializeAudio, playAudio } from './audio-processor.js';
import { mapFrame } from './tonnetz-grid.js';
import { settings, stream, audioInterval, prevFrameDataLeft, prevFrameDataRight } from './state.js';

export function setupUI() {
    const fpsBtn = document.getElementById('fpsBtn');
    const modeBtn = document.getElementById('modeBtn');
    const gridSelect = document.getElementById('gridSelect');
    const synthesisSelect = document.getElementById('synthesisSelect');
    const startStopBtn = document.getElementById('startStopBtn');
    const debug = document.getElementById('debug');
    const debugText = document.getElementById('debugText');
    let frameCount = 0, lastTime = performance.now();
    let skipFrame = false;

    fpsBtn.addEventListener('dblclick', () => {
        debug.style.display = debug.style.display === 'block' ? 'none' : 'block';
        navigator.vibrate?.(200);
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(`Debug ${debug.style.display === 'block' ? 'on' : 'off'}`);
            window.speechSynthesis.speak(utterance);
        }
    });

    fpsBtn.addEventListener('touchstart', (event) => {
        event.preventDefault();
        navigator.vibrate?.(200);
        const intervals = [50, 100, 250];
        settings.updateInterval = intervals[(intervals.indexOf(settings.updateInterval) + 1) % 3] || 50;
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(`FPS set to ${1000 / settings.updateInterval}`);
            window.speechSynthesis.speak(utterance);
        }
        if (audioInterval) {
            clearInterval(audioInterval);
            audioInterval = setInterval(() => processFrame(), settings.updateInterval);
        }
    });

    modeBtn.addEventListener('touchstart', (event) => {
        event.preventDefault();
        navigator.vibrate?.(200);
        settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(`Mode set to ${settings.dayNightMode}`);
            window.speechSynthesis.speak(utterance);
        }
    });

    gridSelect.addEventListener('change', (event) => {
        settings.gridType = event.target.value;
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(`Grid set to ${settings.gridType}`);
            window.speechSynthesis.speak(utterance);
        }
    });

    synthesisSelect.addEventListener('change', (event) => {
        settings.synthesisEngine = event.target.value;
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance(`Synthesis engine set to ${settings.synthesisEngine}`);
            window.speechSynthesis.speak(utterance);
        }
    });

    startStopBtn.addEventListener('touchstart', async (event) => {
        event.preventDefault();
        navigator.vibrate?.(200);
        initializeAudio();
        if (!audioContext) {
            console.error('Audio not initialized');
            return;
        }
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            document.getElementById('videoFeed').style.display = 'none';
            clearInterval(audioInterval);
            if (window.speechSynthesis) {
                const utterance = new SpeechSynthesisUtterance('Navigation stopped');
                window.speechSynthesis.speak(utterance);
            }
            return;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            document.getElementById('videoFeed').srcObject = stream;
            document.getElementById('videoFeed').style.display = 'block';
            document.getElementById('imageCanvas').width = 64;
            document.getElementById('imageCanvas').height = 48;
            if (window.speechSynthesis) {
                const utterance = new SpeechSynthesisUtterance('Navigation started');
                window.speechSynthesis.speak(utterance);
            }
            audioInterval = setInterval(() => processFrame(), settings.updateInterval);
        } catch (err) {
            console.error('Camera access failed:', err);
            if (window.speechSynthesis) {
                const utterance = new SpeechSynthesisUtterance('Failed to access camera');
                window.speechSynthesis.speak(utterance);
            }
        }
    });

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
}
