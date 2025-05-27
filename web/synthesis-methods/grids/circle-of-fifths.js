/**
 * Maps frame data to a Circle of Fifths grid for audio synthesis.
 * @param {Uint8ClampedArray} data - Grayscale frame data.
 * @param {number} width - Frame width.
 * @param {number} height - Frame height.
 * @returns {Float32Array} Mapped data for synthesis.
 */
export function mapFrame(data, width, height) {
    const mappedData = new Float32Array(data.length);
    // Simple mapping: normalize to 0-1 with slight variation
    for (let i = 0; i < data.length; i++) {
        mappedData[i] = (data[i] / 255) * 0.9;
    }
    return mappedData;
}
