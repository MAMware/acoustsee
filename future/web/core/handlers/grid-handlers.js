// web/core/handlers/grid-handlers.js

import { settings } from '../state.js';
import { structuredLog } from '../../utils/logging.js';
import availableGrids from '../../video/grids/available-grids.json';

export const gridHandlers = {
  applyGrid: ({ gridName, context }) => {
    // TODO: set gridType in settings and trigger grid rendering
    settings.gridType = gridName;
    structuredLog('DEBUG', 'gridHandlers.applyGrid called', { gridName });
  }
};
