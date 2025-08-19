// File: web/core/grid-manager.js
// A simple and direct manager to abstract away grid-finding logic.

import { settings } from './state.js';

/**
 * Retrieves the currently active grid object from the settings.
 * This is the central function that hides the complexity of finding the grid.
 * @returns {Object|null} The active grid object or null if not found.
 */
export function getCurrentGrid() {
  const { availableGrids, gridType } = settings;
  if (!availableGrids || !gridType) {
    return null;
  }
  // The find() logic lives here now, in one central place.
  return availableGrids.find(g => g.id === gridType) || null;
}