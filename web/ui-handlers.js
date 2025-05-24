import { initializeAudio, playAudio, audioContext } from './audio-processor.js';
import { mapFrame } from './grid-dispatcher.js';
import { settings, stream, audioInterval, prevFrameDataLeft, prevFrameDataRight } from './state.js';

const translations = {
    'en-US': {
        settingsToggle: 'Toggle Settings',
        modeBtn: 'Toggle Day/Night',
        gridSelect: 'Grid set to {grid}',
        synthesisSelect: 'Synthesis engine set to {engine}',
        languageSelect: 'Language set to {lang}',
        startStop: 'Navigation {state}',
        fpsBtn: 'FPS set to {fps}',
        debug: 'Debug {state}',
        settingsConfirm: 'Settings confirmed: Grid {grid}, Synthesis {engine}',
        audioError: 'Failed to initialize audio',
        cameraError: 'Failed to access camera'
    },
    'es-ES': {
        settingsToggle: 'Alternar Configuraciones',
        modeBtn: 'Alternar Día/Noche',
        gridSelect: 'Cuadrícula establecida en {grid}',
        synthesisSelect: 'Motor de síntesis establecido en {engine}',
        languageSelect: 'Idioma establecido en {lang}',
        startStop: 'Navegación {state}',
        fpsBtn: 'FPS establecido en {fps}',
        debug: 'Depuración {state}',
        settingsConfirm: 'Configuraciones confirmadas: Cuadrícula {grid}, Síntesis {engine}',
        audioError: 'No se pudo inicializar el audio',
        cameraError: 'No se pudo acceder a la cámara'
    }
};

export function setupUI() {
    const fpsBtn = document.getElementById('fpsBtn');
    const modeBtn = document.getElementById('modeBtn');
    const gridSelect = document.getElementById('gridSelect');
    const synthesisSelect = document.getElementById('synthesisSelect');
    const languageSelect = document.getElementById('languageSelect');
    const startStopBtn = document.getElementById('startStopBtn');
    const settingsToggle = document.getElementById('settingsToggle');
    const centerRectangle = document.getElementById('centerRectangle');
    const debug = document.getElementById('debug');
    const debugText = document.getElementById('debugText');
    let frameCount = 0, lastTime = performance.now();
    let skipFrame = false;
    let settingsMode = false;

    // Update button texts based on language
    const updateUIText = () => {
        const t = translations[settings.language || 'en-US'];
        settingsToggle.textContent = t.settingsToggle;
        modeBtn.textContent = t.modeBtn;
        startStopBtn.textContent = t.startStop.replace('{state}', stream ? 'stopped' : 'started');
        fpsBtn.textContent = t.fpsBtn.replace('{fps}', 1000 / settings.updateInterval);
    };

    settingsToggle.addEventListener('click', () => {
        settingsMode = !settingsMode;
        gridSelect.style.display = settingsMode ? 'block' : 'none';
        synthesisSelect.style.display = settingsMode ? 'block' : 'none';
        modeBtn.style.display = settingsMode ? 'none' : 'block';
        languageSelect.style.display = settingsMode ? 'none' : 'block';
        speak(`settingsToggle`, { state: settingsMode ? 'on' : 'off' });
        updateUIText();
    });

    fpsBtn.addEventListener('click', () => {
        const intervals = [50, 100, 250];
        settings.updateInterval = intervals[(intervals.indexOf(settings.updateInterval) + 1) % 3] || 50;
        speak(`fpsBtn`, { fps: 1000 / settings.updateInterval });
        if (audioInterval) {
            clearInterval(audioInterval);
            audioInterval = setInterval(() => processFrame(), settings.updateInterval);
        }
        updateUIText();
    });

    fpsBtn.addEventListener('dblclick', () => {
        debug.style.display = debug.style.display === 'block' ? 'none' : 'block';
        speak(`debug`, { state: debug.style.display === 'block' ? 'on' : 'off' });
    });

    modeBtn.addEventListener('click', () => {
        settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
        speak(`modeBtn`, { mode: settings.dayNightMode });
    });

    gridSelect.addEventListener('change', (event) => {
        settings.gridType = event.target.value;
        speak(`gridSelect`, { grid: settings.gridType });
    });

    synthesisSelect.addEventListener('change', (event) => {
        settings.synthesisEngine = event.target.value;
        speak(`synthesisSelect`, { engine: settings.synthesisEngine });
    });

    languageSelect.addEventListener('change', (event) => {
        settings.language = event.target.value;
        speak(`languageSelect`, { lang: event.target.options[event.target.selectedIndex].text });
        updateUIText();
    });

    startStopBtn.addEventListener('touchstart', async (event) => {
        event.preventDefault();
        if (!audioContext || audioContext.state === 'suspended') {
            await initializeAudio();
        }
        if (!audioContext) {
            console.error('Audio not initialized');
            speak('audioError');
            return;
        }
        if (stream) {
            stream.getTracks().forEach(track => track.stop());
            stream = null;
            document.getElementById('videoFeed').style.display = 'none';
            clearInterval(audioInterval);
            speak('startStop', { state: 'stopped' });
            updateUIText();
            return;
        }
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
            document.getElementById('videoFeed').srcObject = stream;
            document.getElementById('videoFeed').style.display = 'block';
            document.getElementById('imageCanvas').width = 64;
            document.getElementById('imageCanvas').height = 48;
            speak('startStop', { state: 'started' });
            audioInterval = setInterval(() => processFrame(), settings.updateInterval);
            updateUIText();
        } catch (err) {
            console.error('Camera access failed:', err);
            speak('cameraError');
        }
    });

    centerRectangle.addEventListener('click', () => {
        if (settingsMode) {
            speak('settingsConfirm', { grid: settings.gridType, engine: settings.synthesisEngine });
        }
    });

    function speak(key, params = {}) {
        if (window.speechSynthesis) {
            let text = translations[settings.language || 'en-US'][key] || key;
            for (const [param, value] of Object.entries(params)) {
                text = text.replace(`{${param}}`, value);
            }
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.lang = settings.language || 'en-US';
            window.speechSynthesis.speak(utterance);
        }
    }

    // Initial UI text setup
    updateUIText();
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
