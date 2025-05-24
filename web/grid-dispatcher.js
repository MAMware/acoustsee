import { mapFrameToTonnetz } from './synthesis-methods/grids/hex-tonnetz.js';
import { mapFrameToCircleOfFifths } from './synthesis-methods/grids/circle-of-fifths.js';
import { settings } from './state.js';

export function mapFrame(frameData, width, height, prevFrameData, panValue) {
    switch (settings.gridType) {
        case 'circle-of-fifths':
            return mapFrameToCircleOfFifths(frameData, width, height, prevFrameData, panValue);
        case 'hex-tonnetz':
        default:
            return mapFrameToTonnetz(frameData, width, height, prevFrameData, panValue);
    }
}
