const upperHalf = document.getElementById('upperHalf');
const lowerHalf = document.getElementById('lowerHalf');
const videoFeed = document.getElementById('videoFeed');
const canvas = document.getElementById('imageCanvas');
const ctx = canvas.getContext('2d');
let stream = null;
let audioInterval = null;
let hrtfPanner, noisePanner;
const settings = {
    updateInterval: 500, // ms (250, 500, 1000)
    brownNoise: false,
    brownNoiseAmplitude: 0.01
};

function mapFrameToHilbert(frameData, width, height) {
    const gridSize = 8; // 8x8 grid
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
    const audioCtx = new AudioContext();
    const oscillator = audioCtx.createOscillator();
    oscillator.type = 'sine';
    const { frequency, amplitude, azimuth, elevation, harmonic } = mapFrameToHilbert(frameData, width, height);
    oscillator.frequency.setValueAtTime(frequency, audioCtx.currentTime);
    const harmonicOsc = audioCtx.createOscillator();
    harmonicOsc.type = 'sine';
    harmonicOsc.frequency.setValueAtTime(frequency * 2, audioCtx.currentTime);
    const harmonicGain = audioCtx.createGain();
    harmonicGain.gain.value = harmonic;
    harmonicOsc.connect(harmonicGain);
    let noise, noiseGain;
    if (settings.brownNoise) {
        const noiseBuffer = audioCtx.createBuffer(1, 2 * audioCtx.sampleRate, audioCtx.sampleRate);
        const noiseData = noiseBuffer.getChannelData(0);
        for (let i = 0; i < noiseData.length; i++) {
            noiseData[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / noiseData.length, 2);
        }
        noise = audioCtx.createBufferSource();
        noise.buffer = noiseBuffer;
        noise.loop = true;
        noiseGain = audioCtx.createGain();
        noiseGain.gain.value = settings.brownNoiseAmplitude;
        noise.connect(noiseGain);
    }
    hrtfPanner = new HRTFPanner(audioCtx, oscillator, new HRTFContainer());
    const harmonicPanner = new HRTFPanner(audioCtx, harmonicGain, new HRTFContainer());
    noisePanner = settings.brownNoise ? new HRTFPanner(audioCtx, noiseGain, new HRTFContainer()) : null;
    hrtfPanner.update(azimuth, elevation);
    harmonicPanner.update(azimuth, elevation);
    if (noisePanner) noisePanner.update(0, 0);
    hrtfPanner.connect(audioCtx.destination);
    harmonicPanner.connect(audioCtx.destination);
    if (noisePanner) noisePanner.connect(audioCtx.destination);
    if (noise) noise.start();
    oscillator.start();
    harmonicOsc.start();
    setTimeout(() => {
        if (noise) noise.stop();
        oscillator.stop();
        harmonicOsc.stop();
        audioCtx.close();
    }, settings.updateInterval);
}

function updateSettings() {
    const fpsChoice = prompt('Enter FPS (4 for 250ms, 2 for 500ms, 1 for 1000ms):', 2);
    const intervals = { '4': 250, '2': 500, '1': 1000 };
    settings.updateInterval = intervals[fpsChoice] || 500;
    const noiseChoice = prompt('Brown noise on? (yes/no):', 'no');
    settings.brownNoise = noiseChoice.toLowerCase() === 'yes';
    if (settings.brownNoise) {
        settings.brownNoiseAmplitude = parseFloat(prompt('Brown noise amplitude (0-0.02):', 0.01)) || 0.01;
    }
    new SpeechSynthesisUtterance(`Settings updated. FPS: ${1000 / settings.updateInterval}, Brown noise: ${settings.brownNoise ? 'on' : 'off'}`).speak();
}

lowerHalf.addEventListener('click', async () => {
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
        updateSettings(); // Initial settings on start
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
