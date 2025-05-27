/**
 * Creates a sine wave sound based on mapped frame data.
 * @param {AudioContext} audioContext - The Web Audio API context.
 * @param {Float32Array} mappedData - Mapped frame data for synthesis.
 * @returns {AudioNode} The source node for the sound.
 */
export function createSound(audioContext, mappedData) {
    const oscillator = audioContext.createOscillator();
    oscillator.type = 'sine';
    // Map frame data to frequency (100-1000 Hz)
    const freq = mappedData && mappedData.length > 0
        ? 100 + (mappedData.reduce((sum, val) => sum + val, 0) / mappedData.length) * 900
        : 440;
    oscillator.frequency.setValueAtTime(freq, audioContext.currentTime);
    oscillator.start();
    return oscillator;
}
