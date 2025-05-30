import { settings } from './state.js';

/**
 * Global AudioContext, initialized on user gesture.
 */
export let audioContext = null;

/**
 * Active audio nodes for stopping audio.
 */
let activeNodes = [];

/**
 * Initializes AudioContext after user gesture.
 * @param {AudioContext} context - The AudioContext to initialize.
 */
export function initializeAudio(context) {
    audioContext = context;
}

/**
 * Stops all active audio nodes.
 */
export function stopAudio() {
    activeNodes.forEach(node => {
        try {
            if (node.stop) node.stop();
            node.disconnect();
        } catch (e) {
            console.warn('Error stopping node:', e);
        }
    });
    activeNodes = [];
    // Ensure AudioContext is suspended to reduce lag
    if (audioContext && audioContext.state === 'running') {
        audioContext.suspend().catch(err => console.warn('Suspend failed:', err));
    }
}

/**
 * Maps frame data for hex-tonnetz grid.
 * @param {Uint8ClampedArray} data - Grayscale frame data.
 * @returns {Float32Array} Mapped data.
 */
function mapHexTonnetz(data) {
    const mapped = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
        mapped[i] = data[i] / 255;
    }
    return mapped;
}

/**
 * Maps frame data for circle-of-fifths grid.
 * @param {Uint8ClampedArray} data - Grayscale frame data.
 * @returns {Float32Array} Mapped data.
 */
function mapCircleOfFifths(data) {
    const mapped = new Float32Array(data.length);
    for (let i = 0; i < data.length; i++) {
        mapped[i] = (data[i] / 255) * 0.9;
    }
    return mapped;
}

/**
 * Creates sine wave sound.
 * @param {AudioContext} audioContext - Audio context.
 * @param {Float32Array} mappedData - Mapped frame data.
 * @returns {AudioNode} Source node.
 */
function createSineWave(audioContext, mappedData) {
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    const freq = mappedData && mappedData.length > 0
        ? 200 + (mappedData.reduce((sum, val) => sum + val, 0) / mappedData.length) * 400 // Smoother range
        : 440;
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    oscillator.start();
    return oscillator;
}

/**
 * Creates FM synthesis sound.
 * @param {AudioContext} audioContext - Audio context.
 * @param {Float32Array} mappedData - Mapped frame data.
 * @returns {AudioNode} Source node.
 */
function createFMSynthesis(audioContext, mappedData) {
    const carrier = audioContext.createOscillator();
    const modulator = audioContext.createOscillator();
    const modGain = audioContext.createGain();

    carrier.type = 'sine';
    modulator.type = 'sine';
    carrier.frequency.setValueAtTime(440, audioContext.currentTime);
    modulator.frequency.setValueAtTime(220, audioContext.currentTime);
    modGain.gain.setValueAtTime(50, audioContext.currentTime); // Reduced modulation

    if (mappedData && mappedData.length > 0) {
        const avgValue = mappedData.reduce((sum, val) => sum + val, 0) / mappedData.length;
        carrier.frequency.setValueAtTime(200 + avgValue * 400, audioContext.currentTime);
    }

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.start();
    return carrier;
}

/**
 * Plays audio based on frame data, grid, and synthesis engine.
 * @param {Uint8ClampedArray} data - Grayscale frame data.
 * @param {number} width - Frame width.
 * @param {number} height - Frame height.
 * @param {Float32Array} prevLeft - Previous left channel data.
 * @param {Float32Array} prevRight - Previous right channel data.
 * @returns {Object} Updated left and right channel data.
 */
export function playAudio(data, width, height, prevLeft, prevRight) {
    if (!audioContext) return { prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight };

    // Clear old nodes to prevent overlap
    stopAudio();

    const { gridType, synthesisEngine } = settings;
    const gridMap = {
        'hex-tonnetz': mapHexTonnetz,
        'circle-of-fifths': mapCircleOfFifths
    };
    const engineMap = {
        'sine-wave': createSineWave,
        'fm-synthesis': createFMSynthesis
    };

    try {
        const mapFn = gridMap[gridType] || mapHexTonnetz;
        const createSoundFn = engineMap[synthesisEngine] || createSineWave;
        const mappedData = mapFn(data, width, height);
        const sourceNode = createSoundFn(audioContext, mappedData);
        const gainNode = audioContext.createGain();
        gainNode.gain.setValueAtTime(0.5, audioContext.currentTime);
        sourceNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
        activeNodes = [sourceNode, gainNode];
    } catch (err) {
        console.error('Audio processing failed:', err);
    }

    return { prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight };
}
