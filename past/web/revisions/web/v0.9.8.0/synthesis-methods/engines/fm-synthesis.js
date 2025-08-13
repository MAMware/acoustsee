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

    carrier.type = 'sine';
    modulator.type = 'sine';
    carrier.frequency.setValueAtTime(440, audioContext.currentTime);
    modulator.frequency.setValueAtTime(220, audioContext.currentTime);
    modGain.gain.setValueAtTime(100, audioContext.currentTime);

    // Map frame data to carrier frequency
    if (mappedData && mappedData.length > 0) {
        const avgValue = mappedData.reduce((sum, val) => sum + val, 0) / mappedData.length;
        carrier.frequency.setValueAtTime(100 + avgValue * 900, audioContext.currentTime);
    }

    modulator.connect(modGain);
    modGain.connect(carrier.frequency);
    carrier.start();
    return carrier;
}
