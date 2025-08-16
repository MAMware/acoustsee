import { playFmSynthesis } from './fm-synthesis.js';
import { playSawtoothPad } from './sawtooth-pad.js';
import { playSineWave } from './sine-wave.js';
import { playStrings } from './strings.js';

export const availableEnginesData = [
  { id: 'fm-synthesis', playFunction: playFmSynthesis, meta: {} },
  { id: 'sawtooth-pad', playFunction: playSawtoothPad, meta: {"id":"sawtooth-pad","name":"Sawtooth Pad","author":"Gemini 2.5 Pro","description":"A classic polyphonic pad synth using filtered sawtooth waves.","version":"1.0.0"} },
  { id: 'sine-wave', playFunction: playSineWave, meta: {"id":"sine-wave","displayName":"Sine Wave","description":"Simple sine-wave engine using the shared oscillator pool","maxNotes":16,"version":"0.1.0"} },
  { id: 'strings', playFunction: playStrings, meta: {"id":"strings","name":"strings","author":"GPT-5 mini (preview)","description":"A lightweight Karplus–Strong plucked-string (guitar-like) synth plugin. No external assets required.","version":"0.1.0"} }
];
