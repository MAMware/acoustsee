import { initializeAudio, playAudio, audioContext } from './audio-processor.js';
import { mapFrame } from './grid-dispatcher.js';
import { settings, setStream, setAudioInterval, skipFrame, setSkipFrame, prevFrameDataLeft, prevFrameDataRight, setPrevFrameDataLeft, setPrevFrameDataRight } from './state.js';

const translations = {
    'en-US': {
        settingsToggle: 'Settings',
        modeBtn: 'Daylight',
        gridSelect: 'Grid set to {grid}',
        synthesisSelect: 'Synthesis engine set to {engine}',
        languageBtn: 'Language',
        languageSelect: 'Language set to {lang}',
        startStop: 'Navigation {state}',
        fpsBtn: 'FPS set to {fps}',
        debug: 'Debug {state}',
        settingsConfirm: 'Settings confirmed: Grid {grid}, Synthesis {engine}',
        audioError: 'Failed to initialize audio',
        cameraError: 'Failed to access camera'
    },
    'es-ES': {
        settingsToggle: 'Configuraciones',
        modeBtn: 'Luz del Día',
        gridSelect: 'Cuadrícula establecida en {grid}',
        synthesisSelect: 'Motor de síntesis establecido en {engine}',
        languageBtn: 'Idioma',
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
    const fpsSelect = document.createElement('select');
    fpsSelect.id = 'fpsSelect';
    [50, 100, 250].forEach(interval => {
        const option = document.createElement('option');
        option.value = interval;
        option.text = `${1000 / interval} FPS`;
        fpsSelect.appendChild(option);
    });
    document.getElementById('settingsToggle').appendChild(fpsSelect);

    const modeBtn = document.getElementById('modeBtn');
    const gridSelect = document.getElementById('gridSelect');
    const synthesisSelect = document.getElementById('synthesisSelect');
    const languageBtn = document.getElementById('languageBtn');
    const languageSelect = document.getElementById('languageSelect');
    const startStopBtn = document.getElementById('startStopBtn');
    const settingsToggle = document.getElementById('settingsToggle');
    const centerRectangle = document.getElementById('centerRectangle');
    const debug = document.getElementById('debug');
    const debugText = document.getElementById('debugText');
    let settingsMode = false;

    const updateUIText = () => {
        const t = translations[settings.language || 'en-US'];
        settingsToggle.firstChild.textContent = t.settingsToggle;
        modeBtn.firstChild.textContent = t.modeBtn;
        languageBtn.firstChild.textContent = t.languageBtn;
        startStopBtn.textContent = t.startStop.replace('{state}', settings.stream ? 'stopped' : 'started');
    };

    settingsToggle.addEventListener('touchstart', (event) => {
        event.preventDefault();
        settingsMode = !settingsMode;
        gridSelect.style.display = settingsMode ? 'block' : 'none';
        synthesisSelect.style.display = settingsMode ? 'block' : 'none';
        fpsSelect.style.display = settingsMode ? 'block' : 'none';
        languageSelect.style.display = settingsMode ? 'block' : 'none';
        speak(`settingsToggle`, { state: settingsMode ? 'on' : 'off' });
        updateUIText();
    });

    fpsSelect.addEventListener('change', (event) => {
        settings.updateInterval = parseInt(event.target.value);
        speak(`fpsBtn`, { fps: 1000 / settings.updateInterval });
        if (settings.audioInterval) {
            clearInterval(settings.audioInterval);
            setAudioInterval(setInterval(() => processFrame(), settings.updateInterval));
        }
    });

    modeBtn.addEventListener('touchstart', (event) => {
        event.preventDefault();
        settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
        speak(`modeBtn`, { mode: settings.dayNightMode });
        updateUIText();
    });

    gridSelect.addEventListener('change', (event) => {
        settings.gridType = event.target.value;
        speak(`gridSelect`, { grid: settings.gridType });
    });

    synthesisSelect.addEventListener('change', (event) => {
        settings.synthesisEngine = event.target.value;
        speak(`synthesisSelect`, { engine: settings.synthesisEngine });
    });

    languageBtn.addEventListener('touchstart', (event) => {
        event.preventDefault();
        languageSelect.style.display = settingsMode ? 'block' : 'none';
        speak(`languageBtn`);
    });

    languageSelect.addEventListener('change', (event) => {
        settings.language = event.target.value;
        speak(`languageSelect`, { lang: event.target.options[event.target.selectedIndex].text });
        updateUIText();
    });

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
            updateUIText();
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
            setAudioInterval(setInterval(() => processFrame(), settings.updateInterval));
            updateUIText();
        } catch (err) {
            console.error('Camera access failed:', err);
            speak('cameraError');
        }
    });

    centerRectangle.addEventListener('touchstart', (event) => {
        event.preventDefault();
        if (settingsMode) {
            speak('settingsConfirm', { grid: settings.gridType, engine: settings.synthesisEngine });
        }
    });

    debug.addEventListener('dblclick', () => {
        debug.style.display = debug.style.display === 'block' ? 'none' : 'block';
        speak(`debug`, { state: debug.style.display === 'block' ? 'on' : 'off' });
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

    updateUIText();
}

export function processFrame() {
    if (skipFrame) {
        setSkipFrame(false);
        return;
    }
    const videoFeed = document.getElementById('videoFeed');
    const canvas = document.getElementById('imageCanvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(videoFeed, 0, 0, 64, 48);
    const imageData = ctx.getImageData(0, 0, 64, 48);
    const grayData = new Uint8ClampedArray(64 * 48);
    for (let i = 0; i < imageData.data.length; i += 4) {
        grayData[i / 4] = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
    }
    const { prevFrameDataLeft: newLeft, prevFrameDataRight: newRight } = playAudio(
        grayData, 64, 48, prevFrameDataLeft, prevFrameDataRight
    );
    setPrevFrameDataLeft(newLeft);
    setPrevFrameDataRight(newRight);
}
