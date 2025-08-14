import { playFmSynthesis } from './fm-synthesis.js';
import { playSineWave } from './sine-wave.js';

export const availableEnginesData = [
  { id: 'fm-synthesis', playFunction: playFmSynthesis, meta: {} },
  { id: 'sine-wave', playFunction: playSineWave, meta: {"id":"sine-wave","displayName":"Sine Wave","description":"Simple sine-wave engine using the shared oscillator pool","maxNotes":16,"version":"0.1.0"} }
];
