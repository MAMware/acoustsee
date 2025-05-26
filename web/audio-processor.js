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
    let mappedData;

    // Dynamic imports for grids
    import(`./synthesis-methods/grids/${gridType}.js`).then(module => {
        mappedData = module.mapFrame(data, width, height);
    }).catch(err => console.error('Grid import failed:', err));

    // Create synthesis node
    let sourceNode;
    import(`./synthesis-methods/engines/${synthesisEngine}.js`).then(module => {
        sourceNode = module.createSound(audioContext, mappedData);
        const gainNode = audioContext.createGain();
        gainNode.gain.value = 0.5;
        sourceNode.connect(gainNode);
        gainNode.connect(audioContext.destination);
        activeNodes.push(sourceNode, gainNode);
    }).catch(err => console.error('Engine import failed:', err));

    return { prevFrameDataLeft: prevLeft, prevFrameDataRight: prevRight }; // Update as needed
}
