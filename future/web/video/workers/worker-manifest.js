/**
 * worker-manifest.js - Worker Registry & Mode-to-Workers Mapping
 * 
 * This file maintains the canonical registry of all available video workers and
 * their capabilities per mode. The frame conductor uses this manifest to:
 * 
 * 1. Determine which workers to instantiate for each mode
 * 2. Handle worker lifecycle (start/stop/hot-swap per mode)
 * 3. Declare what capabilities are available
 * 4. Support future hot-reloading or debugging
 * 
 * Architecture:
 * - Flow mode: Fast, minimal workers (fast-motion, grid aggregation, pan/intensity)
 * - Focus mode: Detailed workers (full image flow, depth, semantic, texture)
 * - Hybrid mode: Decision workers + adaptive selection
 * 
 * Each worker is defined with:
 * - path: Import path for new Worker()
 * - mode: Flow | Focus | Hybrid
 * - latencyTargetMs: Desired max time this worker should take
 * - capabilities: What it declares (from worker-contract.js)
 * - description: Human-readable explanation
 */

import { WORKER_TYPES, CAPABILITIES } from './worker-contract.js';

/**
 * Unified manifest of all available video workers
 */
export const WORKER_MANIFEST = {
  // ========================================================================
  // FLOW MODE WORKERS (Fast path, <50ms total latency)
  // ========================================================================

  [WORKER_TYPES.FAST_MOTION]: {
    path: './workers/fast-motion-worker.js',
    mode: 'flow',
    latencyTargetMs: 15,
    capabilities: [
      CAPABILITIES.YMOTION_ONLY,
      CAPABILITIES.MOTION_MAGNITUDE,
      CAPABILITIES.MOTION_CONFIDENCE,
    ],
    description: 'Y-plane motion detection for Flow mode (10-15ms)',
  },

  [WORKER_TYPES.GRID_AGGREGATOR]: {
    path: './workers/fast-grid-aggregator.js',
    mode: 'flow',
    latencyTargetMs: 5,
    capabilities: [
      CAPABILITIES.MOTION_MAGNITUDE,
    ],
    description: 'Simple grid averaging for Flow mode (5ms)',
  },

  [WORKER_TYPES.PAN_INTENSITY_MAPPER]: {
    path: './workers/pan-intensity-mapper.js',
    mode: 'flow',
    latencyTargetMs: 2,
    capabilities: [
      CAPABILITIES.SPATIALIZATION,
    ],
    description: 'Motion-to-pan/intensity mapper for Flow mode (2ms)',
  },

  // ========================================================================
  // FOCUS MODE WORKERS (Detailed path, <200ms total latency)
  // ========================================================================

  [WORKER_TYPES.IMAGE]: {
    path: './workers/image-worker.js',
    mode: 'focus',
    latencyTargetMs: 50,
    capabilities: [
      CAPABILITIES.FLOW_VECTORS,
      CAPABILITIES.MOTION_MAGNITUDE,
      CAPABILITIES.MOTION_CONFIDENCE,
      CAPABILITIES.TEXTURE_ANALYSIS,
      CAPABILITIES.BPM_INFERENCE,
    ],
    description: 'Full RGB optical flow + texture for Focus mode (50ms)',
  },

  [WORKER_TYPES.DEPTH]: {
    path: './workers/depth-worker.js',
    mode: 'focus',
    latencyTargetMs: 100,
    capabilities: [
      CAPABILITIES.DEPTH_MAP,
      CAPABILITIES.DEPTH_CONFIDENCE,
    ],
    description: 'Pseudo or CNN depth estimation for Focus mode (50-100ms)',
  },

  [WORKER_TYPES.SEMANTIC]: {
    path: './workers/semantic-detector.js',
    mode: 'focus',
    latencyTargetMs: 40,
    capabilities: [
      CAPABILITIES.SEMANTIC_DETECTION,
    ],
    description: 'Object detection (person/tree/box) for Focus mode (20-40ms)',
  },

  [WORKER_TYPES.TEXTURE]: {
    path: './workers/gabor-texture.js',
    mode: 'focus',
    latencyTargetMs: 10,
    capabilities: [
      CAPABILITIES.TEXTURE_ANALYSIS,
      CAPABILITIES.SURFACE_PROPERTIES,
    ],
    description: 'Gabor filter texture analysis for Focus mode (10ms)',
  },

  // ========================================================================
  // HYBRID MODE WORKERS (Decision/switching, <10ms each)
  // ========================================================================

  [WORKER_TYPES.EGOMOTION]: {
    path: './workers/egomotion-analyzer.js',
    mode: 'hybrid',
    latencyTargetMs: 10,
    capabilities: [
      CAPABILITIES.EGOMOTION_ANALYSIS,
    ],
    description: 'User vs object motion differentiation for Hybrid mode (5-10ms)',
  },

  [WORKER_TYPES.MOTION_MONITOR]: {
    path: './workers/motion-monitor.js',
    mode: 'hybrid',
    latencyTargetMs: 3,
    capabilities: [
      CAPABILITIES.COMPLEXITY_ASSESSMENT,
    ],
    description: 'Scene complexity monitoring for Hybrid mode (2-3ms)',
  },
};

/**
 * Get all workers for a specific mode
 * 
 * @param {string} mode - 'flow' | 'focus' | 'hybrid'
 * @returns {Array<Object>} Array of { name, path, latencyTargetMs, capabilities, description }
 */
export function getWorkersForMode(mode) {
  return Object.entries(WORKER_MANIFEST)
    .filter(([_, config]) => config.mode === mode)
    .map(([name, config]) => ({
      name,
      ...config,
    }));
}

/**
 * Get a specific worker config by name
 * 
 * @param {string} workerName - WORKER_TYPES value
 * @returns {Object|null} Worker config or null if not found
 */
export function getWorkerConfig(workerName) {
  return WORKER_MANIFEST[workerName] || null;
}

/**
 * Check if a capability is available in a given mode
 * 
 * @param {string} mode - 'flow' | 'focus' | 'hybrid'
 * @param {string} capability - CAPABILITIES value
 * @returns {boolean}
 */
export function hasCapabilityInMode(mode, capability) {
  const workers = getWorkersForMode(mode);
  return workers.some(w => w.capabilities.includes(capability));
}

/**
 * Get total latency budget for a mode (sum of all workers in that mode)
 * 
 * @param {string} mode - 'flow' | 'focus' | 'hybrid'
 * @returns {number} Total latency budget in milliseconds
 */
export function getTotalLatencyBudget(mode) {
  return getWorkersForMode(mode).reduce((sum, w) => sum + w.latencyTargetMs, 0);
}

/**
 * Get a human-readable summary of all workers and their latency budgets
 * 
 * @returns {string} Formatted summary for logging
 */
export function getSummary() {
  const modes = ['flow', 'focus', 'hybrid'];
  const lines = ['Worker Manifest Summary:'];

  modes.forEach(mode => {
    const workers = getWorkersForMode(mode);
    const totalLatency = getTotalLatencyBudget(mode);
    lines.push(`\n${mode.toUpperCase()} mode (${totalLatency}ms budget):`);
    workers.forEach(w => {
      lines.push(
        `  - ${w.name}: ${w.latencyTargetMs}ms | ${w.description}`
      );
    });
  });

  return lines.join('\n');
}
