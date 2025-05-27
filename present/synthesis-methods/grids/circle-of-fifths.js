import { settings } from '../../state.js';

const notesPerOctave = 12;
const octaves = 5;
const minFreq = 100;
const maxFreq = 3200;
const frequencies = [];
for (let octave = 0; octave < octaves; octave++) {
    for (let note = 0; note < notesPerOctave; note++) {
        const freq = minFreq * Math.pow(2, octave + note / notesPerOctave);
        if (freq <= maxFreq) frequencies.push(freq);
    }
}

export function mapFrameToCircleOfFifths(frameData, width, height, prevFrameData, panValue) {
    const gridWidth = width / 12;
    const gridHeight = height / 12;
    const movingRegions = [];
    const newFrameData = new Uint8ClampedArray(frameData);
    let avgIntensity = 0;
    for (let i = 0; i < frameData.length; i++) avgIntensity += frameData[i];
    avgIntensity /= frameData.length;

    if (prevFrameData) {
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = y * width + x;
                const delta = Math.abs(frameData[idx] - prevFrameData[idx]);
                if (delta > 50) {
                    const gridX = Math.floor(x / gridWidth);
                    const gridY = Math.floor(y / gridHeight);
                    movingRegions.push({ gridX, gridY, intensity: frameData[idx], delta });
                }
            }
        }
    }

    movingRegions.sort((a, b) => b.delta - a.delta);
    const notes = [];
    const usedCells = new Set();
    for (let i = 0; i < Math.min(8, movingRegions.length); i++) {
        const { gridX, gridY, intensity } = movingRegions[i];
        const cellKey = `${gridX},${gridY}`;
        if (usedCells.has(cellKey)) continue;
        usedCells.add(cellKey);
        const noteIndex = (gridX + gridY) % notesPerOctave;
        const freq = frequencies[noteIndex] || frequencies[frequencies.length - 1];
        const amplitude = settings.dayNightMode === 'day' ? 0.02 + (intensity / 255) * 0.06 : 0.08 - (intensity / 255) * 0.06;
        const harmonics = [freq * Math.pow(2, 7/12), freq * Math.pow(2, 4/12)];
        notes.push({ pitch: freq, intensity: amplitude, harmonics, pan: panValue });
    }

    return { notes, newFrameData, avgIntensity };
}
