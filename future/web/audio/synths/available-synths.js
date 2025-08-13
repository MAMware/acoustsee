import { playFmSynthesis } from './fm-synthesis.js';
import { playSineWave } from './sine-wave.js';

export const availableEngines = [
  { id: 'fm-synthesis', playFunction: playFmSynthesis },
  { id: 'sine-wave', playFunction: playSineWave }
];
