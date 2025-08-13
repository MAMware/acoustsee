export let audioContext;
export let isAudioInitialized = false;
export let oscillators = [];

export function initializeAudio() {
    if (isAudioInitialized) return;
    try {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        if (audioContext.state === 'suspended') {
            audioContext.resume();
        }
        for (let i = 0; i < 32; i++) {
            // ... oscillator setup ...
            oscillators.push({ osc, gain, panner, active: false });
        }
        isAudioInitialized = true;
        // ... speech synthesis ...
    } catch (error) {
        console.error('Audio Initialization Error:', error);
        // ... error handling ...
    }
}

export function playAudio(frameData, width, height, prevFrameDataLeft, prevFrameDataRight, settings) {
    // ... existing playAudio logic ...
    return { prevFrameDataLeft, prevFrameDataRight };
}
