import { mapFrameToCues as mapCircleOfFifths } from './circle-of-fifths.js';
import { mapFrameToCues as mapHexTonnetz } from './hex-tonnetz.js';

export const availableGridsData = [
  { id: 'circle-of-fifths', mapFunction: mapCircleOfFifths, meta: {} },
  { id: 'hex-tonnetz', mapFunction: mapHexTonnetz, meta: {} }
];
