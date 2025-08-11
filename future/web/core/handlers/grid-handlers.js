// grid-handlers.js
// Handles grid type selection and rendering

import { settings, setSettings } from '../state.js';
import { structuredLog } from '../../utils/logging.js';
import availableGrids from '../../video/grids/available-grids.json';

/**
 * Applies a grid type by updating settings and triggering rendering.
 * Returns true if successful, false otherwise.
 */
export function applyGrid(gridName, context) {
  if (!availableGrids.some(g => g.id === gridName)) {
    structuredLog('ERROR', 'gridHandlers.applyGrid: Unknown grid', { gridName });
    return false;
  }
  setSettings({ ...settings, gridType: gridName });
  structuredLog('INFO', 'gridHandlers.applyGrid: Grid applied', { gridName });
  // Optionally trigger grid rendering here (e.g., via dispatcher)
  return true;
}
