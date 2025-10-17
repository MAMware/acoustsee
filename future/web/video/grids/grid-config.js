/**
 * Adaptive Grid Configuration Module
 * 
 * Defines paradigm-aware grid sizes and processing parameters.
 * Used to parameterize gridSize, aggregation strategy, and skip thresholds
 * across frame-processor and all video workers (motion, depth, image).
 * 
 * Design:
 * - Flow mode: Coarse grid (3×3) for fast, low-latency spatial awareness
 * - Focus mode: Fine grid (8×8) for detailed spatial feature extraction
 * - Hybrid mode: Balanced grid (5×5) for transitional scenarios
 * 
 * This enables paradigm-adaptive performance: fast in navigation, detailed in exploration.
 * R171025 lets discuss if it would be usefull to have this settings present and/ or configurable
 * at the developer panel
 */

export const GRID_CONFIGS = {
  flow: {
    rows: 3,
    cols: 3,
    aggregation: 'mean',      // Smooth averages for coarse spatial awareness
    skipThreshold: 0.1,       // Skip cells with low activity
    purpose: 'Fast, coarse spatial awareness for navigation',
    description: '3×3 grid: 9 cells total. Optimized for real-time performance.',
  },
  focus: {
    rows: 8,
    cols: 8,
    aggregation: 'max',       // Preserve edges and peaks for detail
    skipThreshold: 0.05,      // Catch subtle spatial features
    purpose: 'Detailed depth structure, fine-grained spatial features',
    description: '8×8 grid: 64 cells total. Optimized for spatial precision and object structure.',
  },
  hybrid: {
    rows: 5,
    cols: 5,
    aggregation: 'weighted',  // Blend mean + max for balanced behavior
    skipThreshold: 0.075,     // Moderate threshold
    purpose: 'Balanced latency and spatial detail',
    description: '5×5 grid: 25 cells total. Default balanced configuration.',
  },
};

/**
 * Get grid configuration for a given mode.
 * Falls back to 'hybrid' if mode is unrecognized.
 * 
 * @param {string} mode - One of 'flow', 'focus', 'hybrid'
 * @returns {object} Grid configuration with rows, cols, aggregation, skipThreshold, purpose
 */
export function getGridConfig(mode) {
  if (!mode || !GRID_CONFIGS[mode]) {
    return GRID_CONFIGS.hybrid;
  }
  return GRID_CONFIGS[mode];
}

/**
 * List all available grid configurations.
 * Useful for debugging and UI display.
 * 
 * @returns {object} Object with all grid configs keyed by mode
 */
export function getAllGridConfigs() {
  return { ...GRID_CONFIGS };
}

/**
 * Validate that a grid configuration has required fields.
 * 
 * @param {object} config - Configuration to validate
 * @returns {boolean} True if valid, false otherwise
 */
export function isValidGridConfig(config) {
  return (
    config &&
    typeof config === 'object' &&
    typeof config.rows === 'number' &&
    typeof config.cols === 'number' &&
    typeof config.aggregation === 'string' &&
    typeof config.skipThreshold === 'number' &&
    config.rows > 0 &&
    config.cols > 0 &&
    config.skipThreshold >= 0 &&
    config.skipThreshold <= 1
  );
}

/**
 * Create a custom grid configuration.
 * Validates all fields before returning.
 * 
 * @param {number} rows - Number of rows (must be > 0)
 * @param {number} cols - Number of columns (must be > 0)
 * @param {string} aggregation - Aggregation strategy ('mean', 'max', 'weighted')
 * @param {number} skipThreshold - Skip threshold in [0, 1]
 * @param {string} purpose - Optional description
 * @returns {object|null} Valid config object or null if invalid
 */
export function createGridConfig(rows, cols, aggregation, skipThreshold, purpose = '') {
  const config = {
    rows: Math.floor(rows),
    cols: Math.floor(cols),
    aggregation,
    skipThreshold: Math.max(0, Math.min(1, skipThreshold)),
    purpose,
  };

  if (isValidGridConfig(config)) {
    return config;
  }
  return null;
}
