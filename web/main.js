let audioContext;
let isAudioInitialized = false;
let oscillators = [];
let prevFrameDataLeft = null, prevFrameDataRight = null;
let debugVisible = false;
let lastSuggestionTime = 0;
const fpsBtn = document.getElementById('fpsBtn');
const modeBtn = document.getElementById('modeBtn');
const autoModeBtn = document.getElementById('autoModeBtn');
const startStopBtn = document.getElementById('startStopBtn');
const videoFeed = document.getElementById('videoFeed');
const canvas = document.getElementById('imageCanvas');
const debug = document.getElementById('debug');
const debugText = document.getElementById('debugText');
const ctx = canvas.getContext('2d');
let stream = null;
let audioInterval = null;
let frameCount = 0, lastTime = performance.now();
let skipFrame = false;
const settings = {
    updateInterval: 50,
    dayNightMode: 'day',
    autoMode: true
};

// Initialize audio context and oscillators
function initializeAudio() {
    if (isAudioInitialized) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        for (let i = 0; i < 32; i++) {
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
        // Test tone to confirm audio
        const testOsc = audioContext.createOscillator();
        const testGain = audioContext.createGain();
        testOsc.frequency.setValueAtTime(440, audioContext.currentTime);
        testGain.gain.setValueAtTime(0.1, audioContext.currentTime);
        testOsc.connect(testGain).connect(audioContext.destination);
        testOsc.start();
        testOsc.stop(audioContext.currentTime + 0.5);
        isAudioInitialized = true;
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance('Audio initialized');
            window.speechSynthesis.speak(utterance);
        }
    } catch (error) {
        console.error('Audio Initialization Error:', error);
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance('Failed to initialize audio');
            window.speechSynthesis.speak(utterance);
        }
    }
}

// Build hexagonal Tonnetz grid (32x32 per half)
const gridSize = 32;
const notesPerOctave = 12;
const octaves = 5;
const minFreq = 100;
const maxFreq = 3200;
const frequencies = [];
for (let octave = 0; octave < octaves; octave++) {
    for (let note = 0; note < notesPerOctave; note++) {
        const freq = minFreq * Math.pow(2, octave + note / notesPerOctave);
        if (freq <= maxFreq) frequencies.push(freq);
    }
}
const circleOfFifths = [0, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10, 5];
const tonnetzGrid = Array(gridSize).fill().map(() => Array(gridSize).fill(0));
for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
        const octave = Math.floor((y / gridSize) * octaves);
        const noteIndex = circleOfFifths[x % circleOfFifths.length];
        const freqIndex = octave * notesPerOctave + noteIndex;
        tonnetzGrid[y][x] = frequencies[freqIndex % frequencies.length] || frequencies[frequencies.length - 1];
    }
}

// Map frame to Tonnetz grid, detect motion
function mapFrameToTonnetz(frameData, width, height, prevFrameData, panValue) {
    const gridWidth = width / gridSize;
    const gridHeight = height / gridSize;
    const movingRegions = [];
    const newFrameData = new Uint8ClampedArray(frameData);
    let avgIntensity = 0;
    for (let i = 0; i < frameData.length; i++) avgIntensity += frameData[i];
    avgIntensity /= frameData.length;

    if (prevFrameData) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const delta = Math.abs(frameData[idx] - prevFrameData[idx]);
                if (delta > 30) {
                    const gridX = Math.floor(x / gridWidth);
                    const gridY = Math.floor(y / gridHeight);
                    movingRegions.push({ gridX, gridY, intensity: frameData[idx], delta, x, y });
                }
            }
        }
    }

    // Cluster regions to reduce overlap
    const clusters = [];
    const visited = new Set();
    for (let region of movingRegions) {
        if (visited.has(`${region.gridX},${region.gridY}`)) continue;
        const cluster = { regions: [region], totalDelta: region.delta, avgX: region.x, avgY: region.y };
        visited.add(`${region.gridX},${region.gridY}`);
        for (let other of movingRegions) {
            if (visited.has(`${other.gridX},${other.gridY}`)) continue;
            const dist = Math.sqrt((region.x - other.x) ** 2 + (region.y - other.y) ** 2);
            if (dist < 3) {
                cluster.regions.push(other);
                cluster.totalDelta += other.delta;
                cluster.avgX = (cluster.avgX * (cluster.regions.length - 1) + other.x) / cluster.regions.length;
                cluster.avgY = (cluster.avgY * (cluster.regions.length - 1) + other.y) / cluster.regions.length;
                visited.add(`${other.gridX},${other.gridY}`);
            }
        }
        clusters.push(cluster);
    }

    // Sort clusters, take top 16
    clusters.sort((a, b) => b.totalDelta - a.totalDelta);
    const notes = [];
    for (let i = 0; i < Math.min(16, clusters.length); i++) {
        const cluster = clusters[i];
        const gridX = Math.floor(cluster.avgX / gridWidth);
        const gridY = Math.floor(cluster.avgY / gridHeight);
        const freq = tonnetzGrid[gridY][gridX];
        const avgIntensity = cluster.regions.reduce((sum, r) => sum + r.intensity, 0) / cluster.regions.length;
        const amplitude = settings.dayNightMode === 'day'
            ? 0.02 + (avgIntensity / 255) * 0.06
            : 0.08 - (avgIntensity / 255) * 0.06;
        const harmonics = [freq * Math.pow(2, 7/12), freq * Math.pow(2, 4/12)]; // Fifth, major third
        notes.push({ freq, amplitude, harmonics, pan: panValue });
    }

    return { notes, newFrameData, avgIntensity };
}

// Play audio for both halves
function playAudio(frameData, width, height) {
    if (!isAudioInitialized) return;

    const startTime = performance.now();
    const halfWidth = width / 2;

    const leftFrame = new Uint8ClampedArray(halfWidth * height);
    const rightFrame = new Uint8ClampedArray(halfWidth * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < halfWidth; x++) {
            leftFrame[y * halfWidth + x] = frameData[y * width + x];
            rightFrame[y * halfWidth + x] = frameData[y * width + x + halfWidth];
        }
    }

    const leftResult = mapFrameToTonnetz(leftFrame, halfWidth, height, prevFrameDataLeft, -1);
    const rightResult = mapFrameToTonnetz(rightFrame, halfWidth, height, prevFrameDataRight, 1);
    prevFrameDataLeft = leftResult.newFrameData;
    prevFrameDataRight = rightResult.newFrameData;

    // Suggest day/night mode
    const now = performance.now();
    if (settings.autoMode && now - lastSuggestionTime > 30000) {
        const avgIntensity = (leftResult.avgIntensity + rightResult.avgIntensity) / 2;
        if (avgIntensity < 100 && settings.dayNightMode !== 'night') {
            settings.dayNightMode = 'night';
            if (window.speechSynthesis) {
                const utterance = new SpeechSynthesisUtterance('Switching to night mode');
                window.speechSynthesis.speak(utterance);
            }
        } else if (avgIntensity > 150 && settings.dayNightMode !== 'day') {
            settings.dayNightMode = 'day';
            if (window.speechSynthesis) {
                const utterance = new SpeechSynthesisUtterance('Switching to day mode');
                window.speechSynthesis.speak(utterance);
            }
        }
        lastSuggestionTime = now;
    }

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

    frameCount++;
    const now = performance.now();
    const elapsed = now - lastTime;
    if (elapsed >= 1000) {
        const fps = (frameCount / elapsed) * 1000;
        const frameTime = (elapsed / frameCount).toFixed(1);
        const activeNotes = allNotes.map(n => `${Math.round(n.freq)}Hz (${n.pan > 0 ? 'R' : 'L'})`).join(', ');
        if (debugVisible) {
            debugText.textContent = `Frame time: ${frameTime}ms\nFPS: ${fps.toFixed(1)}\nGrid: 32x32 (left), 32x32 (right)\nNotes: ${activeNotes || 'None'}`;
        }
        console.log(`Debug: Frame time: ${frameTime}ms, FPS: ${fps.toFixed(1)}, Notes: ${activeNotes}`);
        frameCount = 0;
        lastTime = now;
    }

    skipFrame = (now - startTime) > 40;
}

// Toggle debug overlay
fpsBtn.addEventListener('dblclick', () => {
    debugVisible = !debugVisible;
    debug.style.display = debugVisible ? 'block' : 'none';
    console.log('Debug toggled:', debugVisible);
    navigator.vibrate(200);
    if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(`Debug ${debugVisible ? 'on' : 'off'}`);
        window.speechSynthesis.speak(utterance);
    }
});

// Settings: FPS
fpsBtn.addEventListener('touchstart', (event) => {
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

// Settings: Day/Night Mode
modeBtn.addEventListener('touchstart', (event) => {
    event.preventDefault();
    navigator.vibrate(200);
    settings.dayNightMode = settings.dayNightMode === 'day' ? 'night' : 'day';
    if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(`Mode set to ${settings.dayNightMode}`);
        window.speechSynthesis.speak(utterance);
    }
});

// Settings: Auto Mode
autoModeBtn.addEventListener('touchstart', (event) => {
    event.preventDefault();
    navigator.vibrate(200);
    settings.autoMode = !settings.autoMode;
    if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(`Auto mode ${settings.autoMode ? 'on' : 'off'}`);
        window.speechSynthesis.speak(utterance);
    }
});

// Start/stop navigation
function processFrame() {
    if (skipFrame) {
        skipFrame = false;
        return;
    }
    ctx.drawImage(videoFeed, 0, 0, 64, 48);
    const imageData = ctx.getImageData(0, 0, 64, 48);
    const grayData = new Uint8ClampedArray(64 * 48);
    for (let i = 0; i < imageData.data.length; i += 4) {
        grayData[i / 4] = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
    }
    playAudio(grayData, 64, 48);
}

startStopBtn.addEventListener('touchstart', async (event) => {
    event.preventDefault();
    navigator.vibrate(200);
    initializeAudio();
    if (!isAudioInitialized) {
        console.error('Audio not initialized');
        return;
    }
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
