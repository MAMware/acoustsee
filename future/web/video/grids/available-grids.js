import { mapFrameToAvailableGrids } from './available-grids.js';
import { mapFrameToCircleOfFifths } from './circle-of-fifths.js';
import { mapFrameToHexTonnetz } from './hex-tonnetz.js';

export const availableGrids = [
  { id: 'available-grids', mapFunction: mapFrameToAvailableGrids },
  { id: 'circle-of-fifths', mapFunction: mapFrameToCircleOfFifths },
  { id: 'hex-tonnetz', mapFunction: mapFrameToHexTonnetz }
];
