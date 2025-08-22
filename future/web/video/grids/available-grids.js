import { mapFrameToCircleOfFifths } from './circle-of-fifths.js';
import { mapFrameToHexTonnetz } from './hex-tonnetz.js';

export const availableGridsData = [
  { id: 'circle-of-fifths', mapFunction: mapFrameToCircleOfFifths, meta: {} },
  { id: 'hex-tonnetz', mapFunction: mapFrameToHexTonnetz, meta: {} }
];
