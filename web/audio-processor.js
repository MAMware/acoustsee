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
            node.stop();
            node.disconnect();
        } catch (e) {
            console.warn('Error stopping node:', e);
        }
    });
    activeNodes = [];
}

/**
 * Plays audio based on frame data (basic implementation).
 * @param {Uint8ClampedArray} data - Grayscale frame data.
 * @param {number} width - Frame width.
 * @param {number} height - Frame height.
 * @param {Float32Array} prevLeft - Previous left channel data.
 * @param {Float32Array} prevRight - Previous right channel data.
 * @returns {Object} Updated left and right channel data.
 */
export function playAudio(data, width, height, prevLeft, prevRight) {
    if (!audioContext) return { prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight };

    const { synthesisEngine } = settings;
    if (synthesisEngine === 'sine-wave') {
        const oscillator = audioContext.createOscillator();
        oscillator.type = 'sine';
        const freq = data && data.length > 0
            ? 100 + (data.reduce((sum, val) => sum + val, 0) / data.length) * 3.53
            : 440;
        oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.5;
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        oscillator.start();
        activeNodes.push(oscillator, gainNode);
    }
    // FM synthesis and grids not fully implemented
    return { prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight };
}
