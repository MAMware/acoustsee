let audioContext;
let isAudioInitialized = false;
let hrtfPanner, noisePanner, harmonicPanner;
const upperHalf = document.getElementById('upperHalf');
const lowerHalf = document.getElementById('lowerHalf');
const videoFeed = document.getElementById('videoFeed');
const canvas = document.getElementById('imageCanvas');
const ctx = canvas.getContext('2d');
let stream = null;
let audioInterval = null;
const settings = {
    updateInterval: 500, // ms (250, 500, 1000)
    brownNoise: false,
    brownNoiseAmplitude: 0.01,
    settingIndex: 0 // Track current setting (FPS, noise, amplitude)
};

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
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance('Error initializing audio');
            window.speechSynthesis.speak(utterance);
        } else {
            console.warn('Web Speech API not supported');
        }
    }
}

function mapFrameToHilbert(frameData, width, height) {
    const gridSize = 8;
    const intensities = [];
    let xSum = 0, ySum = 0, brightCount = 0;
    for (let i = 0; i < 64; i++) {
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
    const avgIntensity = intensities.reduce((sum, val) => sum + val, 0) / 64;
    const azimuth = brightCount ? (xSum / brightCount - width / 2) * 160 / width : 0;
    const elevation = brightCount ? (height / 2 - ySum / brightCount) * 60 / height : 0;
    return {
        frequency: 300 + (avgIntensity / 255) * 500,
        amplitude: 0.1 + (avgIntensity / 255) * 0.4,
        azimuth,
        elevation,
        harmonic: avgIntensity < 100 ? 0.1 : 0
    };
}

function playAudio(frameData, width, height) {
    if (!isAudioInitialized) return;
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    const { frequency, amplitude, azimuth, elevation, harmonic } = mapFrameToHilbert(frameData, width, height);
    oscillator.frequency.setValueAtTime(frequency, audioContext.currentTime);
    const harmonicOsc = audioContext.createOscillator();
    harmonicOsc.type = 'sawtooth'; // Inspired by script.js.txt
    harmonicOsc.frequency.setValueAtTime(frequency * 2, audioContext.currentTime);
    const harmonicGain = audioContext.createGain();
    harmonicGain.gain.value = harmonic;
    harmonicOsc.connect(harmonicGain);
    let noise, noiseGain;
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
        noiseGain.gain.value = settings.brownNoiseAmplitude;
        noise.connect(noiseGain);
    }
    hrtfPanner = new HRTFPanner(audioContext, oscillator, new HRTFContainer());
    harmonicPanner = new HRTFPanner(audioContext, harmonicGain, new HRTFContainer());
    noisePanner = settings.brownNoise ? new HRTFPanner(audioContext, noiseGain, new HRTFContainer()) : null;
    hrtfPanner.update(azimuth, elevation);
    harmonicPanner.update(azimuth, elevation);
    if (noisePanner) noisePanner.update(0, 0);
    hrtfPanner.connect(audioContext.destination);
    harmonicPanner.connect(audioContext.destination);
    if (noisePanner) noisePanner.connect(audioContext.destination);
    if (noise) noise.start();
    oscillator.start();
    harmonicOsc.start();
    setTimeout(() => {
        if (noise) noise.stop();
        oscillator.stop();
        harmonicOsc.stop();
    }, settings.updateInterval);
}

function updateSettings() {
    navigator.vibrate(200); // Haptic feedback
    settings.settingIndex = (settings.settingIndex + 1) % 3;
    const prompts = [
        `FPS setting. Tap again to select: 4 for fast, 2 for medium, 1 for slow. Current: ${1000 / settings.updateInterval}`,
        `Brown noise setting. Tap again to toggle. Current: ${settings.brownNoise ? 'on' : 'off'}`,
        `Brown noise volume. Tap again to adjust: 0 to 0.02. Current: ${settings.brownNoiseAmplitude}`
    ];
    new SpeechSynthesisUtterance(prompts[settings.settingIndex]).speak();
    let tapCount = 0;
    const handleTap = () => {
        tapCount++;
        if (settings.settingIndex === 0) { // FPS
            const intervals = [250, 500, 1000];
            settings.updateInterval = intervals[tapCount % 3] || 500;
            new SpeechSynthesisUtterance(`FPS set to ${1000 / settings.updateInterval}`).speak();
        } else if (settings.settingIndex === 1) { // Brown noise toggle
            settings.brownNoise = !settings.brownNoise;
            new SpeechSynthesisUtterance(`Brown noise ${settings.brownNoise ? 'on' : 'off'}`).speak();
        } else { // Brown noise amplitude
            settings.brownNoiseAmplitude = (tapCount % 3) * 0.01;
            new SpeechSynthesisUtterance(`Brown noise volume set to ${settings.brownNoiseAmplitude}`).speak();
        }
        navigator.vibrate(100);
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
    };
    upperHalf.addEventListener('click', handleTap, { once: true });
}

lowerHalf.addEventListener('click', async () => {
    navigator.vibrate(200);
    initializeAudio();
    if (!isAudioInitialized) return;
    if (stream) {
        stream.getTracks().forEach(track => track.stop());
        stream = null;
        videoFeed.style.display = 'none';
        clearInterval(audioInterval);
        new SpeechSynthesisUtterance('Navigation stopped').speak();
        return;
    }
    try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoFeed.srcObject = stream;
        videoFeed.style.display = 'block';
        canvas.width = 128;
        canvas.height = 96;
        new SpeechSynthesisUtterance('Navigation started').speak();
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
        new SpeechSynthesisUtterance('Failed to access camera').speak();
    }
});

upperHalf.addEventListener('click', updateSettings);
