/**
 * Adaptive Grid Configuration Module
 * 
 * SINGLE SOURCE OF TRUTH FOR GRID DIMENSIONS
 * 
 * ALL grid configuration must come from this module. Workers should NOT hardcode grid values.
 * 
 * Usage Pattern (REQUIRED):
 * 1. Main thread: Call getGridConfig(mode) to get config for current mode
 * 2. Send config with frame message: { data: frame, gridConfig: getGridConfig(state.currentMode) }
 * 3. Worker receives: msg.gridConfig with rows, cols, aggregation, skipThreshold
 * 4. If worker doesn't receive gridConfig, use fallback: getGridConfig('hybrid')
 * 
 * Architecture:
 * - Flow mode: Coarse grid (3×3) for fast, low-latency spatial awareness
 * - Focus mode: Fine grid (8×8) for detailed spatial feature extraction  
 * - Hybrid mode: Balanced grid (5×5) for transitional scenarios
 * 
 * Enables paradigm-adaptive performance: fast in navigation, detailed in exploration.
 * 
 * ---
 * 
 * IMPLEMENTATION AUDIT (R111125gc):
 * 
 * ✓ CORRECT (Uses getGridConfig):
 * - frame-conductor.js: Passes gridConfig with every frame message
 * 
 * ⚠️ NEEDS FIXING (Hardcoded fallbacks): R251125gc
 * - depth-worker.js line 106-107: Hardcoded { rows: 4, cols: 4 } vs reading GRID_CONFIGS
 * - image-worker.js line 83-84: Hardcoded { rows: 4, cols: 4 } vs reading GRID_CONFIGS
 * - image-worker.js line 94: Hardcoded { rows: 4, cols: 4 } fallback
 * - fast-motion-worker.js line 363: Hardcoded { rows: 4, cols: 4 } fallback
 * - fast-grid-aggregator.js line 69-70: Hardcoded { rows: 4, cols: 4 } fallback
 * - pan-intensity-mapper.js line 79-80: Hardcoded { rows: 4, cols: 4 } fallback
 * 
 * SYNC VALIDATION STRATEGY:
 * Workers hardcode { rows: 4, cols: 4 } as safety fallback (never sent without gridConfig).
 * When gridConfig is passed, use it instead. This prevents crashes if message is malformed.
 * 
 * FUTURE: Replace hardcoded 4x4 with hybrid mode from GRID_CONFIGS to align with design.
 * See ADR: Grid Configuration Synchronization
 * 
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
 * CRITICAL: This function must include frameWidth and frameHeight because:
 * - Grid aggregator worker needs these to map pixel coordinates → grid cells
 * - Pan-intensity mapper worker needs these to calculate weighted pan position
 * - Without dimensions, workers fail validation and crash
 * 
 * @param {string} mode - One of 'flow', 'focus', 'hybrid'
 * @param {number} frameWidth - Frame width in pixels (default 640 for testing)
 * @param {number} frameHeight - Frame height in pixels (default 480 for testing)
 * @returns {object} Grid configuration with rows, cols, aggregation, skipThreshold, purpose, frameWidth, frameHeight
 */
export function getGridConfig(mode, frameWidth = 640, frameHeight = 480) {
  const baseConfig = !mode || !GRID_CONFIGS[mode] ? GRID_CONFIGS.hybrid : GRID_CONFIGS[mode];
  
  return {
    ...baseConfig,
    frameWidth,
    frameHeight
  };
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
