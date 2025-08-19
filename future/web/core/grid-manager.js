// File: web/core/grid-manager.js
// A central registry for managing and accessing grid definitions.

import { settings } from './state.js';
import { CircleOfFifths } from '../grids/circle-of-fifths.js';
// Import other grids here as you create them
// import { HexTonnetz } from '../grids/hex-tonnetz.js';

/**
 * The master registry of all grid definitions available in the application.
 * Each grid object must have an `id`, `name`, and a `getNote` function.
 */
const allGrids = {
  'circle-of-fifths': {
    id: 'circle-of-fifths',
    name: 'Circle of Fifths',
    getNote: CircleOfFifths.getNote,
  },
  // Example for a future grid:
  // 'hex-tonnetz': {
  //   id: 'hex-tonnetz',
  //   name: 'Hex Tonnetz',
  //   getNote: HexTonnetz.getNote,
  // }
};

/**
 * Returns an array of all available grid configurations.
 * Useful for populating settings menus.
 * @returns {Array<Object>}
 */
export function getAvailableGrids() {
  return Object.values(allGrids);
}

/**
 * Retrieves the currently active grid object based on the global settings.
 * This is the primary way other modules should get the current grid.
 * @returns {Object|null} The active grid object or null if not found.
 */
export function getCurrentGrid() {
  const currentGridId = settings.gridType;
  return allGrids[currentGridId] || null;
}

/**
 * Retrieves a specific grid object by its unique ID.
 * Useful for the future "Mapping Engine" vision.
 * @param {string} gridId - The ID of the grid to retrieve.
 * @returns {Object|null} The requested grid object or null if not found.
 */
export function getGridById(gridId) {
  return allGrids[gridId] || null;
}