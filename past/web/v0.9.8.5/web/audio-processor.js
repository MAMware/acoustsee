import { settings } from './state.js';
import { mapFrame } from './grid-dispatcher.js';
import { playSineWave } from './synthesis-methods/engines/sine-wave.js';
import { playFMSynthesis } from './synthesis-methods/engines/fm-synthesis.js';

export let audioContext = null;
export let isAudioInitialized = false;
export let oscillators = [];

export async function initializeAudio(context) {
    if (isAudioInitialized || !context) return;
    try {
        audioContext = context;
        if (audioContext.state === 'suspended') {
            await audioContext.resume();
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
        isAudioInitialized = true;
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance('Audio initialized');
            utterance.lang = settings.language || 'en-US';
            window.speechSynthesis.speak(utterance);
        }
    } catch (error) {
        console.error('Audio Initialization Error:', error);
        if (window.speechSynthesis) {
            const utterance = new SpeechSynthesisUtterance('Failed to initialize audio');
            utterance.lang = settings.language || 'en-US';
            window.speechSynthesis.speak(utterance);
        }
    }
}

export function playAudio(frameData, width, height, prevFrameDataLeft, prevFrameDataRight) {
    if (!isAudioInitialized) return { prevFrameDataLeft, prevFrameDataRight };

    const halfWidth = width / 2;
    const leftFrame = new Uint8ClampedArray(halfWidth * height);
    const rightFrame = new Uint8ClampedArray(halfWidth * height);
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < halfWidth; x++) {
            leftFrame[y * halfWidth + x] = frameData[y * width + x];
            rightFrame[y * halfWidth + x] = frameData[y * width + x + halfWidth];
        }
    }

    const leftResult = mapFrame(leftFrame, halfWidth, height, prevFrameDataLeft, -1);
    const rightResult = mapFrame(rightFrame, halfWidth, height, prevFrameDataRight, 1);
    prevFrameDataLeft = leftResult.newFrameData;
    prevFrameDataRight = rightResult.newFrameData;

    const allNotes = [...leftResult.notes, ...rightResult.notes];
    switch (settings.synthesisEngine) {
        case 'fm-synthesis':
            playFMSynthesis(allNotes);
            break;
        case 'sine-wave':
        default:
            playSineWave(allNotes);
            break;
    }

    return { prevFrameDataLeft, prevFrameDataRight };
}
