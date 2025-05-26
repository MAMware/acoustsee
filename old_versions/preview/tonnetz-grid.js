export const gridSize = 32;
export const frequencies = [];
export const tonnetzGrid = Array(gridSize).fill().map(() => Array(gridSize).fill(0));

// Initialize frequencies and grid
const notesPerOctave = 12;
const octaves = 5;
const minFreq = 100;
const maxFreq = 3200;
for (let octave = 0; octave < octaves; octave++) {
    for (let note = 0; note < notesPerOctave; note++) {
        const freq = minFreq * Math.pow(2, octave + note / notesPerOctave);
        if (freq <= maxFreq) frequencies.push(freq);
    }
}
for (let y = 0; y < gridSize; y++) {
    for (let x = 0; x < gridSize; x++) {
        const octave = Math.floor((y / gridSize) * octaves);
        const noteOffset = (x + (y % 2) * 6) % notesPerOctave;
        const freqIndex = octave * notesPerOctave + noteOffset;
        tonnetzGrid[y][x] = frequencies[freqIndex % frequencies.length] || frequencies[frequencies.length - 1];
    }
}

export function mapFrameToTonnetz(frameData, width, height, prevFrameData, panValue, settings) {
    // ... existing mapFrameToTonnetz logic ...
    return { notes, newFrameData, avgIntensity };
}
