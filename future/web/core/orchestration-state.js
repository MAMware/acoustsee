/**
 * orchestration-state.js
 * 
 * Defines the orchestration metadata schema and state management for the video
 * processing pipeline. This tracks which video capture method is active, what
 * capabilities the browser supports, and real-time performance metrics.
 * 
 * Part of Phase 2A: Orchestration Visibility
 * Purpose: Enable developers to see which video capture path is running and why
 * 
 * Architecture:
 * - Schema: Defines all orchestration metadata fields
 * - Integration: Merges into app.state via engine.dispatch()
 * - Lifecycle: Updated continuously as frame processor makes decisions
 * 
 * State Shape Example:
 * {
 *   orchestration: {
 *     activeExtractor: 'mediaStreamTrackProcessor',
 *     capabilities: { ... },
 *     metrics: { ... }
 *   }
 * }
 */

/**
 * Creates the initial orchestration state object
 * @returns {Object} Orchestration state schema
 */
function createInitialOrchestrationState() {
  return {
    // Which frame extraction method is currently running
    activeExtractor: null, // 'mediaStreamTrackProcessor' | 'canvasFallback' | null
    
    // Whether orchestration is actively monitoring
    isMonitoring: false,
    
    // Browser capabilities (populated by capability-detector)
    capabilities: {
      mediaStreamTrackProcessor: false,    // GPU-accelerated VideoFrame extraction
      canvas2D: true,                      // CPU-based canvas extraction (universal)
      webGL: false,                        // GPU compute available
      webGPU: false,                       // Modern GPU compute
      offscreenCanvas: false,              // Worker-accessible canvas
      wasm: false,                         // WebAssembly available
    },
    
    // Real-time performance metrics (populated by metrics-collector)
    metrics: {
      fps: 0,                             // Actual frames per second
      targetFps: 60,                      // Expected frame rate
      resolutionWidth: 0,                 // Current frame width
      resolutionHeight: 0,                // Current frame height
      frameExtractionTimeMs: 0,           // Time to extract one frame
      gridMappingTimeMs: 0,               // Time to map to grid
      audioProcessingTimeMs: 0,           // Time to generate audio cues
      totalCycleTimeMs: 0,                // End-to-end frame processing time
      underutilization: 0,                // % of CPU time spent waiting
      gpuUtilization: 0,                  // Estimated % of GPU capacity used
      memoryUsageMB: 0,                   // Current memory footprint
    },
    
    // Decision log (last 10 events)
    decisionLog: [],  // { timestamp, event, reason, activeExtractor }
    
    // Current mode (from video orchestrator)
    currentMode: null, // 'flow' | 'flow-legacy' | 'focus' | null
    
    // Quality profile settings
    qualityProfile: {
      name: 'auto',           // Profile being used
      fpsTarget: 60,          // Target frames per second
      resolutionScale: 1.0,   // Resolution multiplier (phase 2C will use source constraints)
    },
    
    // Timestamp when state was last updated
    lastUpdateTimestamp: 0,
  };
}

/**
 * Merges orchestration state into the full app state
 * This ensures orchestration data is always available via engine.getState()
 * 
 * @param {Object} existingState - Current app state
 * @returns {Object} Updated state with orchestration merged in
 */
function mergeOrchestrationState(existingState) {
  return {
    ...existingState,
    orchestration: {
      ...createInitialOrchestrationState(),
      ...(existingState.orchestration || {}),
    },
  };
}

/**
 * Creates an action to update orchestration state
 * Dispatched via engine.dispatch('updateOrchestration', payload)
 * 
 * @param {Object} updates - Fields to update in orchestration state
 * @returns {Object} Action for dispatcher
 */
function createUpdateOrchestrationAction(updates) {
  return {
    type: 'updateOrchestration',
    payload: {
      ...updates,
      lastUpdateTimestamp: performance.now(),
    },
  };
}

/**
 * Logs a decision event to the orchestration state
 * Keeps last 10 events for debugging
 * 
 * @param {Array} decisionLog - Current decision log
 * @param {Object} event - Event details { event, reason, activeExtractor }
 * @returns {Array} Updated decision log (max 10 items)
 */
function addDecisionLogEntry(decisionLog, event) {
  const entry = {
    timestamp: performance.now(),
    ...event,
  };
  
  const updated = [entry, ...decisionLog].slice(0, 10);
  return updated;
}

/**
 * Validates orchestration state structure
 * Used for debugging and state snapshots
 * 
 * @param {Object} state - Orchestration state to validate
 * @returns {Object} { isValid, errors: [] }
 */
function validateOrchestrationState(state) {
  const errors = [];
  
  if (!state) {
    return { isValid: false, errors: ['State is null/undefined'] };
  }
  
  // Check required fields
  const requiredFields = ['activeExtractor', 'capabilities', 'metrics'];
  requiredFields.forEach(field => {
    if (!(field in state)) {
      errors.push(`Missing required field: ${field}`);
    }
  });
  
  // Check activeExtractor value
  const validExtractors = ['mediaStreamTrackProcessor', 'canvasFallback', null];
  if (!validExtractors.includes(state.activeExtractor)) {
    errors.push(`Invalid activeExtractor: ${state.activeExtractor}`);
  }
  
  // Check capabilities are booleans
  if (typeof state.capabilities === 'object' && state.capabilities !== null) {
    Object.entries(state.capabilities).forEach(([key, value]) => {
      if (typeof value !== 'boolean') {
        errors.push(`Capability ${key} must be boolean, got ${typeof value}`);
      }
    });
  }
  
  // Check metrics are numbers
  if (typeof state.metrics === 'object' && state.metrics !== null) {
    Object.entries(state.metrics).forEach(([key, value]) => {
      if (typeof value !== 'number') {
        errors.push(`Metric ${key} must be number, got ${typeof value}`);
      }
    });
  }
  
  return {
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Creates a snapshot of orchestration state for debugging
 * Safe to serialize and log
 * 
 * @param {Object} state - Orchestration state
 * @returns {Object} Serializable snapshot
 */
function createOrchestrationSnapshot(state) {
  return {
    timestamp: new Date().toISOString(),
    activeExtractor: state.activeExtractor,
    isMonitoring: state.isMonitoring,
    currentMode: state.currentMode,
    capabilities: { ...state.capabilities },
    metrics: { ...state.metrics },
    qualityProfile: { ...state.qualityProfile },
    decisionLog: state.decisionLog.slice(0, 5), // Last 5 for snapshot
  };
}

/**
 * Exports the orchestration state module
 */
export {
  createInitialOrchestrationState,
  mergeOrchestrationState,
  createUpdateOrchestrationAction,
  addDecisionLogEntry,
  validateOrchestrationState,
  createOrchestrationSnapshot,
};
