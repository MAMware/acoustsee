let audioContext;
let isAudioInitialized = false;
let oscillators = []; // Store oscillators for continuous updates
let prevFrameDataLeft = null, prevFrameDataRight = null;
let debugVisible = false;
const topLeft = document.getElementById('topLeft');
const topRight = document.getElementById('topRight');
const bottomLeft = document.getElementById('bottomLeft');
const bottomRight = document.getElementById('bottomRight');
const videoFeed = document.getElementById('videoFeed');
const canvas = document.getElementById('imageCanvas');
const debug = document.getElementById('debug');
const debugText = document.getElementById('debugText');
const ctx = canvas.getContext('2d');
let stream = null;
let audioInterval = null;
let frameCount = 0, lastTime = performance.now();
const settings = {
    updateInterval: 50, // ms (50, 100, 250)
    noteMode: 'major', // major, minor, dissonant
    maxAmplitude: 0.08 // 0.04, 0.08, 0.12
};

// Initialize audio context and oscillators
function initializeAudio() {
    if (isAudioInitialized) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        // Create oscillators for up to 8 notes (4 per side)
        for (let i = 0; i < 8; i++) {
            const osc = audioContext.createOscillator();
            const gain = audioContext.createGain();
            const panner = audioContext.createStereoPanner();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(0, audioContext.currentTime);
            gain.gain.setValueAtTime(0, audioContext.currentTime);
            panner.pan.setValueAtTime(0, audioContext.currentTime);
            osc.connect(gain).connect(panner).connect(audioContext.destination);
            osc.start();
            oscillators.push({ osc, gain, panner, active: false });
        }
        isAudioInitialized = true;
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance('Audio initialized');
            window.speechSynthesis.speak(utterance);
        }
    } catch (error) {
        console.error('Audio Initialization Error:', error);
        isAudioInitialized = true;
    }
}

// Build hexagonal Tonnetz grid (16x16 per half)
const gridSize = 16;
const notesPerOctave = 12; // Chromatic scale
const octaves = 5;
const minFreq = 100;
const maxFreq = 3200;
const frequencies = [];
for (let octave = 0; octave < octaves; octave++) {
    for (let note = 0; note < notesPerOctave; note++) {
        const freq = minFreq * Math.pow(2, octave + note / notesPerOctave);
        frequencies.push(freq);
    }
}
// Circle of Fifths progression (C, G, D, A, E, B, F#, ...)
const circleOfFifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5]; // Semitones from C
const tonnetzGrid = Array(gridSize).fill().map(() => Array(gridSize).fill(0));
for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
        const octave = Math.floor((y / gridSize) * octaves);
        const noteIndex = circleOfFifths[x % circleOfFifths.length];
        const freqIndex = octave * notesPerOctave + noteIndex;
        tonnetzGrid[y][x] = frequencies[freqIndex % frequencies.length];
    }
}

// Map frame to Tonnetz grid, detect motion
function mapFrameToTonnetz(frameData, width, height, prevFrameData, panValue) {
    const gridWidth = width / gridSize;
    const gridHeight = height / gridSize;
    const movingRegions = [];
    const newFrameData = new Uint8ClampedArray(frameData);
    
    // Detect motion
    if (prevFrameData) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const delta = Math.abs(frameData[idx] - prevFrameData[idx]);
                if (delta > 30) { // Motion threshold
                    const gridX = Math.floor(x / gridWidth);
                    const gridY = Math.floor(y / gridHeight);
                    movingRegions.push({ gridX, gridY, intensity: frameData[idx], delta });
                }
            }
        }
    }

    // Sort by motion strength, take top 4
    movingRegions.sort((a, b) => b.delta - a.delta);
    const notes = [];
    for (let i = 0; i < Math.min(4, movingRegions.length); i++) {
        const { gridX, gridY, delta } = movingRegions[i];
        const freq = tonnetzGrid[gridY][gridX];
        const amplitude = Math.min(settings.maxAmplitude, 0.02 + (delta / 255) * 0.06);
        // Assign chord based on noteMode
        let harmonics = [];
        if (settings.noteMode === 'major') {
            harmonics = [freq * Math.pow(2, 4/12), freq * Math.pow(2, 7/12)]; // Major third, fifth
        } else if (settings.noteMode === 'minor') {
            harmonics = [freq * Math.pow(2, 3/12), freq * Math.pow(2, 7/12)]; // Minor third, fifth
        } else {
            harmonics = [freq * Math.pow(2, 6/12)]; // Tritone
        }
        notes.push({ freq, amplitude, harmonics, pan: panValue });
    }

    return { notes, newFrameData };
}

// Play audio for both halves
function playAudio(frameData, width, height) {
    if (!isAudioInitialized) return;

    const startTime = performance.now();
    const halfWidth = width / 2;

    // Split frame into left and right
    const leftFrame = new Uint8ClampedArray(halfWidth * height);
    const rightFrame = new Uint8ClampedArray(halfWidth * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < halfWidth; x++) {
            leftFrame[y * halfWidth + x] = frameData[y * width + x];
            rightFrame[y * halfWidth + x] = frameData[y * width + x + halfWidth];
        }
    }

    // Process each half
    const leftResult = mapFrameToTonnetz(leftFrame, halfWidth, height, prevFrameDataLeft, -1);
    const rightResult = mapFrameToTonnetz(rightFrame, halfWidth, height, prevFrameDataRight, 1);
    prevFrameDataLeft = leftResult.newFrameData;
    prevFrameDataRight = rightResult.newFrameData;

    // Update oscillators
    let oscIndex = 0;
    const allNotes = [...leftResult.notes, ...rightResult.notes];
    for (let i = 0; i < oscillators.length; i++) {
        const oscData = oscillators[i];
        if (i < allNotes.length) {
            const { freq, amplitude, harmonics, pan } = allNotes[i];
            oscData.osc.type = freq < 400 ? 'square' : freq < 1000 ? 'triangle' : 'sine';
            oscData.osc.frequency.setTargetAtTime(freq, audioContext.currentTime, 0.015);
            oscData.gain.gain.setTargetAtTime(amplitude, audioContext.currentTime, 0.015);
            oscData.panner.pan.setTargetAtTime(pan, audioContext.currentTime, 0.015);
            oscData.active = true;
            // Add harmonics
            if (harmonics.length && oscIndex + harmonics.length < oscillators.length) {
                for (let h = 0; h < harmonics.length; h++) {
                    oscIndex++;
                    const harmonicOsc = oscillators[oscIndex];
                    harmonicOsc.osc.frequency.setTargetAtTime(harmonics[h], audioContext.currentTime, 0.015);
                    harmonicOsc.gain.gain.setTargetAtTime(amplitude * 0.5, audioContext.currentTime, 0.015);
                    harmonicOsc.panner.pan.setTargetAtTime(pan, audioContext.currentTime, 0.015);
                    harmonicOsc.active = true;
                }
            }
            oscIndex++;
        } else {
            oscData.gain.gain.setTargetAtTime(0, audioContext.currentTime, 0.015);
            oscData.active = false;
        }
    }

    // Update performance metrics
    frameCount++;
    const now = performance.now();
    const elapsed = now - lastTime;
    if (elapsed >= 1000) {
        const fps = (frameCount / elapsed) * 1000;
        const frameTime = (elapsed / frameCount).toFixed(1);
        const activeNotes = allNotes.map(n => `${Math.round(n.freq)}Hz (${n.pan > 0 ? 'R' : 'L'})`).join(', ');
        if (debugVisible) {
            debugText.textContent = `Frame time: ${frameTime}ms\nFPS: ${fps.toFixed(1)}\nGrid: 16x16 (left), 16x16 (right)\nNotes: ${activeNotes || 'None'}`;
        }
        frameCount = 0;
        lastTime = now;
    }
}

// Toggle debug overlay
topLeft.addEventListener('dblclick', () => {
    debugVisible = !debugVisible;
    debug.style.display = debugVisible ? 'block' : 'none';
    navigator.vibrate(200);
    if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(`Debug ${debugVisible ? 'on' : 'off'}`);
        window.speechSynthesis.speak(utterance);
    }
});

// Settings: FPS (top-left)
topLeft.addEventListener('touchstart', (event) => {
    event.preventDefault();
    navigator.vibrate(200);
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

// Settings: Note mode (top-right)
topRight.addEventListener('touchstart', (event) => {
    event.preventDefault();
    navigator.vibrate(200);
    const modes = ['major', 'minor', 'dissonant'];
    settings.noteMode = modes[(modes.indexOf(settings.noteMode) + 1) % 3] || 'major';
    if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(`Note mode set to ${settings.noteMode}`);
        window.speechSynthesis.speak(utterance);
    }
});

// Settings: Amplitude (bottom-left)
bottomLeft.addEventListener('touchstart', (event) => {
    event.preventDefault();
    navigator.vibrate(200);
    const amplitudes = [0.04, 0.08, 0.12];
    settings.maxAmplitude = amplitudes[(amplitudes.indexOf(settings.maxAmplitude) + 1) % 3] || 0.08;
    if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(`Volume set to ${settings.maxAmplitude}`);
        window.speechSynthesis.speak(utterance);
    }
});

// Start/stop navigation (bottom-right)
function processFrame() {
    ctx.drawImage(videoFeed, 0, 0, 64, 48);
    const imageData = ctx.getImageData(0, 0, 64, 48);
    const grayData = new Uint8ClampedArray(64 * 48);
    for (let i = 0; i < imageData.data.length; i += 4) {
        grayData[i / 4] = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
    }
    playAudio(grayData, 64, 48);
}

bottomRight.addEventListener('touchstart', async (event) => {
    event.preventDefault();
    navigator.vibrate(200);
    initializeAudio();
    if (!isAudioInitialized) return;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        videoFeed.style.display = 'none';
        clearInterval(audioInterval);
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance('Navigation stopped');
            window.speechSynthesis.speak(utterance);
        }
        return;
    }
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
        videoFeed.srcObject = stream;
        videoFeed.style.display = 'block';
        canvas.width = 64;
        canvas.height = 48;
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
