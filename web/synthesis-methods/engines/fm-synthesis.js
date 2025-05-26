/**
 * Creates an FM synthesis sound based on mapped frame data.
 * @param {AudioContext} audioContext - The Web Audio API context.
 * @param {Float32Array} mappedData - Mapped frame data for synthesis.
 * @returns {AudioNode} The source node for the sound.
 */
export function createSound(audioContext, mappedData) {
    const carrier = audioContext.createOscillator();
    const modulator = audioContext.createOscillator();
    const modGain = audioContext.createGain();

    // Default frequencies for audible output
    carrier.frequency.setValueAtTime(440, audioContext.currentTime); // A4 note
    modulator.frequency.setValueAtTime(220, audioContext.currentTime); // Modulator at half frequency
    modGain.gain.setValueAtTime(100, audioContext.currentTime); // Modulation index

    // Map frame data to frequency (example: scale to 100-1000 Hz)
    if (mappedData && mappedData.length > 0) {
        const avgValue = mappedData.reduce((sum, val) => sum + val, 0) / mappedData.length;
        const freq = 100 + (avgValue * 900); // Scale to 100-1000 Hz
        carrier.frequency.setValueAtTime(freq, audioContext.currentTime);
    }

    // FM synthesis chain: modulator -> modGain -> carrier frequency
    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.start();

    return carrier;
}
