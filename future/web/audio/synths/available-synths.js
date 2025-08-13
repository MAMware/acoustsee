import { playAvailableSynths } from './available-synths.js';
import { playFmSynthesis } from './fm-synthesis.js';
import { playSineWave } from './sine-wave.js';

export const availableEngines = [
  { id: 'available-synths', playFunction: playAvailableSynths },
  { id: 'fm-synthesis', playFunction: playFmSynthesis },
  { id: 'sine-wave', playFunction: playSineWave }
];
