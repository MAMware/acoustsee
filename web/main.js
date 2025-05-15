// Global state for audio context and processing
let audioContext;
let isAudioInitialized = false;
let hrtfPanner, noisePanner, harmonicPanner;
let prevIntensity = 0; // Track previous frame intensity for approach detection
let debugVisible = false; // Toggle debug overlay
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
let facingMode = 'user'; // Track camera facing mode
const settings = {
    updateInterval: 250, // ms (100, 250, 500)
    brownNoise: false,
    brownNoiseAmplitude: 0.01
};

// Initialize Web Audio API context on user interaction
function initializeAudio() {
    if (isAudioInitialized) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        isAudioInitialized = true;
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance('Audio initialized');
            window.speechSynthesis.speak(utterance);
        } else {
            console.warn('Web Speech API not supported');
        }
    } catch (error) {
        console.error('Audio Initialization Error:', error);
        isAudioInitialized = true; // Proceed despite speech error
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance('Error initializing audio');
            window.speechSynthesis.speak(utterance);
        } else {
            console.warn('Web Speech API not supported');
        }
    }
}

// Map video frame to Hilbert curve, compute audio parameters
function mapFrameToHilbert(frameData, width, height) {
    // Use 6x6 grid for faster processing
    const gridSize = 6;
    const intensities = [];
    let xSum = 0, ySum = 0, brightCount = 0;
    // Traverse frame in a simplified Hilbert curve (zigzag for now)
    for (let i = 0; i < 36; i++) {
        const x = (i % gridSize) * (width / gridSize);
        const y = Math.floor(i / gridSize) * (height / gridSize);
        const idx = (Math.floor(y) * width + Math.floor(x));
        const gray = frameData[idx];
        intensities.push(gray);
        if (gray > 128) {
            xSum += x;
            ySum += y;
            brightCount++;
        }
    }
    // Compute average intensity (0-255)
    const avgIntensity = intensities.reduce((sum, val) => sum + val, 0) / 36;
    // Invert luma: darker (low intensity) → louder, lower pitch
    const amplitude = 0.2 - (avgIntensity / 255) * 0.15; // 0.05-0.2
    const frequency = 500 - (avgIntensity / 255) * 300; // 200-500 Hz
    // Compute HRTF position, flip x for front camera
    const azimuth = brightCount ? (facingMode === 'user' ? -(xSum / brightCount - width / 2) : (xSum / brightCount - width / 2)) * 160 / width : 0;
    const elevation = brightCount ? (height / 2 - ySum / brightCount) * 60 / height : 0;
    // Select waveform based on intensity (proximity)
    const waveform = avgIntensity < 100 ? 'sine' : avgIntensity < 200 ? 'sawtooth' : 'square';
    const isApproaching = avgIntensity > prevIntensity + 10;
    prevIntensity = avgIntensity;
    return {
        frequency,
        amplitude,
        azimuth,
        elevation,
        harmonic: avgIntensity < 100 ? 0.05 : 0, // Subtle harmonic for far objects
        waveform,
        isApproaching
    };
}

// Generate spatial audio from frame data
function playAudio(frameData, width, height) {
    if (!isAudioInitialized) return;
    // Create oscillators for primary and harmonic sounds
    const oscillator = audioContext.createOscillator();
    const { frequency, amplitude, azimuth, elevation, harmonic, waveform } = mapFrameToHilbert(frameData, width, height);
    oscillator.type = waveform;
    oscillator.frequency.setTargetAtTime(frequency, audioContext.currentTime, 0.015); // Smooth transition
    const oscillatorGain = audioContext.createGain();
    oscillatorGain.gain.setTargetAtTime(amplitude, audioContext.currentTime, 0.015);
    oscillator.connect(oscillatorGain);
    const harmonicOsc = audioContext.createOscillator();
    harmonicOsc.type = 'sawtooth';
    harmonicOsc.frequency.setTargetAtTime(frequency * 2, audioContext.currentTime, 0.015);
    const harmonicGain = audioContext.createGain();
    harmonicGain.gain.setTargetAtTime(harmonic, audioContext.currentTime, 0.015);
    harmonicOsc.connect(harmonicGain);
    let noise, noiseGain;
    // Add optional brown noise
    if (settings.brownNoise) {
        const noiseBuffer = audioContext.createBuffer(1, 2 * audioContext.sampleRate, audioContext.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
            noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseData.length, 2);
        }
        noise = audioContext.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        noiseGain = audioContext.createGain();
        noiseGain.gain.setTargetAtTime(settings.brownNoiseAmplitude, audioContext.currentTime, 0.015);
        noise.connect(noiseGain);
    }
    // Apply HRTF panning
    hrtfPanner = new HRTFPanner(audioContext, oscillatorGain, new HRTFContainer());
    harmonicPanner = new HRTFPanner(audioContext, harmonicGain, new HRTFContainer());
    noisePanner = settings.brownNoise ? new HRTFPanner(audioContext, noiseGain, new HRTFContainer()) : null;
    hrtfPanner.update(azimuth, elevation);
    harmonicPanner.update(azimuth, elevation);
    if (noisePanner) noisePanner.update(0, 0);
    hrtfPanner.connect(audioContext.destination);
    harmonicPanner.connect(audioContext.destination);
    if (noisePanner) noisePanner.connect(audioContext.destination);
    // Start audio
    if (noise) noise.start();
    oscillator.start();
    harmonicOsc.start();
    // Stop after interval for smooth updates
    setTimeout(() => {
        if (noise) noise.stop();
        oscillator.stop();
        harmonicOsc.stop();
    }, settings.updateInterval);
    // Update debug overlay
    if (debugVisible) {
        debugText.textContent = `FPS: ${1000 / settings.updateInterval}\nBrown Noise: ${settings.brownNoise ? 'on' : 'off'}\nVolume: ${settings.brownNoiseAmplitude}\nWaveform: ${waveform}\nIntensity: ${avgIntensity.toFixed(0)}\nAzimuth: ${azimuth.toFixed(0)}°\nElevation: ${elevation.toFixed(0)}°`;
    }
}

// Toggle debug overlay on double-tap
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
    const intervals = [100, 250, 500];
    settings.updateInterval = intervals[(intervals.indexOf(settings.updateInterval) + 1) % 3] || 250;
    if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(`FPS set to ${1000 / settings.updateInterval}`);
        window.speechSynthesis.speak(utterance);
    }
    if (audioInterval) {
        clearInterval(audioInterval);
        audioInterval = setInterval(() => {
            ctx.drawImage(videoFeed, 0, 0, 128, 96);
            const imageData = ctx.getImageData(0, 0, 128, 96);
            const grayData = new Uint8ClampedArray(128 * 96);
            for (let i = 0; i < imageData.data.length; i += 4) {
                grayData[i / 4] = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
            }
            playAudio(grayData, 128, 96);
        }, settings.updateInterval);
    }
});

// Settings: Brown noise toggle (top-right)
topRight.addEventListener('touchstart', (event) => {
    event.preventDefault();
    navigator.vibrate(200);
    settings.brownNoise = !settings.brownNoise;
    if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(`Brown noise ${settings.brownNoise ? 'on' : 'off'}`);
        window.speechSynthesis.speak(utterance);
    }
});

// Settings: Brown noise volume (bottom-left)
bottomLeft.addEventListener('touchstart', (event) => {
    event.preventDefault();
    navigator.vibrate(200);
    const volumes = [0, 0.01, 0.03, 0.05];
    settings.brownNoiseAmplitude = volumes[(volumes.indexOf(settings.brownNoiseAmplitude) + 1) % 4] || 0.01;
    if (window.speechSynthesis) {
        const utterance = new SpeechSynthesisUtterance(`Brown noise volume set to ${settings.brownNoiseAmplitude}`);
        window.speechSynthesis.speak(utterance);
    }
});

// Start/stop navigation (bottom-right)
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
        facingMode = 'user'; // Update facing mode
        videoFeed.srcObject = stream;
        videoFeed.style.display = 'block';
        canvas.width = 128;
        canvas.height = 96;
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance('Navigation started');
            window.speechSynthesis.speak(utterance);
        }
        audioInterval = setInterval(() => {
            ctx.drawImage(videoFeed, 0, 0, 128, 96);
            const imageData = ctx.getImageData(0, 0, 128, 96);
            const grayData = new Uint8ClampedArray(128 * 96);
            for (let i = 0; i < imageData.data.length; i += 4) {
                grayData[i / 4] = (imageData.data[i] + imageData.data[i + 1] + imageData.data[i + 2]) / 3;
            }
            playAudio(grayData, 128, 96);
        }, settings.updateInterval);
    } catch (err) {
        console.error('Camera access failed:', err);
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance('Failed to access camera');
            window.speechSynthesis.speak(utterance);
        }
    }
});
