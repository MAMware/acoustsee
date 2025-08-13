import { mapFrameToCircleOfFifths } from './circle-of-fifths.js';
import { mapFrameToHexTonnetz } from './hex-tonnetz.js';

export const availableGrids = [
  { id: 'circle-of-fifths', mapFunction: mapFrameToCircleOfFifths },
  { id: 'hex-tonnetz', mapFunction: mapFrameToHexTonnetz }
];
