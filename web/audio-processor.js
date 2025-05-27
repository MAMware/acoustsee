import { settings } from './state.js';
import { mapFrame as mapHexTonnetz } from './synthesis-methods/grids/hex-tonnetz.js';
import { mapFrame as mapCircleOfFifths } from './synthesis-methods/grids/circle-of-fifths.js';
import { createSound as createSineWave } from './synthesis-methods/engines/sine-wave.js';
import { createSound as createFMSynthesis } from './synthesis-methods/engines/fm-synthesis.js';

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
            node.stop();
            node.disconnect();
        } catch (e) {
            console.warn('Error stopping node:', e);
        }
    });
    activeNodes = [];
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
        const mapFn = gridMap[gridType];
        const createSoundFn = engineMap[synthesisEngine];
        if (!mapFn || !createSoundFn) throw new Error('Invalid grid or engine');

        const mappedData = mapFn(data, width, height);
        const sourceNode = createSoundFn(audioContext, mappedData);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.5;
        sourceNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
        activeNodes.push(sourceNode, gainNode);
    } catch (err) {
        console.error('Audio processing failed:', err);
    }

    return { prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight };
}
