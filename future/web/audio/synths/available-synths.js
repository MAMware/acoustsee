import { playFmSynthesis } from './fm-synthesis.js';
import { playKarplusStrongGuitar } from './karplus-strong-guitar.js';
import { playPluginTemplate } from './plugin-template.js';
import { playSineWave } from './sine-wave.js';

export const availableEnginesData = [
  { id: 'fm-synthesis', playFunction: playFmSynthesis, meta: {} },
  { id: 'karplus-strong-guitar', playFunction: playKarplusStrongGuitar, meta: {"id":"karplus-strong-guitar","name":"Karplus-Strong Plucked Guitar","author":"Acoustsee","description":"A lightweight Karplus–Strong plucked-string (guitar-like) synth plugin. No external assets required.","version":"0.1.0"} },
  { id: 'plugin-template', playFunction: playPluginTemplate, meta: {"id":"plugin-template","name":"Plugin Template","author":"Your Name","description":"Minimal synth plugin template showing the required contract and defensive usage of ctx.","version":"0.1.0"} },
  { id: 'sine-wave', playFunction: playSineWave, meta: {"id":"sine-wave","displayName":"Sine Wave","description":"Simple sine-wave engine using the shared oscillator pool","maxNotes":16,"version":"0.1.0"} }
];
