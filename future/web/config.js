// config.js
export const availableGrids = [
  { id: "circle-of-fifths", name: "Circle of Fifths", file: "./synthesis-methods/grids/circle-of-fifths.js" },
  { id: "hex-tonnetz", name: "Hex Tonnetz", file: "./synthesis-methods/grids/hex-tonnetz.js" }
];

export const availableEngines = [
  { id: "sine-wave", name: "Sine Wave", file: "./synthesis-methods/engines/sine-wave.js", exportName: "playSineWave" },
  { id: "fm-synthesis", name: "FM Synthesis", file: "./synthesis-methods/engines/fm-synthesis.js", exportName: "playFMSynthesis" }
];

export const availableLanguages = [
  { id: "en-US", name: "English", file: "./languages/en-US.json" },
  { id: "es-ES", name: "Spanish", file: "./languages/es-ES.json" }
];

export const availableUpdateIntervals = [16, 33, 50]; // ms (60fps, 30fps, 20fps)