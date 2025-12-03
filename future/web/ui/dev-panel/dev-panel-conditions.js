/**
 * Dev Panel Conditional Logic Engine
 * 
 * Purpose: Implement dynamic visibility/enablement system based on application state.
 * Reduces cognitive load by showing only relevant controls.
 * 
 * Reference: docs/design/DEV_PANEL_CONDITIONS.md
 * Phase: 2 (Weeks 3-4)
 * 
 * @module dev-panel-conditions
 */

// ============================================================================
// CONDITION EVALUATOR
// ============================================================================

/**
 * Operators for condition evaluation
 */
const OPERATORS = {
  '==': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '>': (a, b) => a > b,
  '<': (a, b) => a < b,
  '>=': (a, b) => a >= b,
  '<=': (a, b) => a <= b,
  'in': (a, arr) => Array.isArray(arr) && arr.includes(a),
  'notIn': (a, arr) => Array.isArray(arr) && !arr.includes(a),
  'exists': (a) => a !== undefined && a !== null,
  'notExists': (a) => a === undefined || a === null,
};

/**
 * Evaluates a single condition against the current state
 * @param {Object} condition - Condition object { field, operator, value }
 * @param {Object} state - Current application state
 * @returns {boolean} - Whether the condition is satisfied
 */
export function evaluateCondition(condition, state) {
  if (!condition || !state) return false;
  
  const { field, operator, value } = condition;
  
  // Get the value from state using dot notation (e.g., "video.cameraActive")
  const stateValue = getNestedValue(state, field);
  
  // Get the operator function
  const opFn = OPERATORS[operator];
  if (!opFn) {
    console.warn(`DevPanelConditions: Unknown operator "${operator}"`);
    return false;
  }
  
  try {
    return opFn(stateValue, value);
  } catch (e) {
    console.warn(`DevPanelConditions: Error evaluating condition`, { condition, error: e.message });
    return false;
  }
}

/**
 * Evaluates a compound condition with AND/OR logic
 * @param {Object} rule - Rule object with conditions array and logic
 * @param {Object} state - Current application state
 * @returns {boolean} - Whether the rule is satisfied
 */
export function evaluateRule(rule, state) {
  if (!rule || !rule.conditions || !Array.isArray(rule.conditions)) {
    return false;
  }
  
  const { conditions, logic = 'AND' } = rule;
  
  if (logic === 'AND') {
    return conditions.every(cond => {
      if (cond.not) {
        return !evaluateCondition(cond, state);
      }
      return evaluateCondition(cond, state);
    });
  }
  
  if (logic === 'OR') {
    return conditions.some(cond => {
      if (cond.not) {
        return !evaluateCondition(cond, state);
      }
      return evaluateCondition(cond, state);
    });
  }
  
  return false;
}

/**
 * Gets a nested value from an object using dot notation
 * @param {Object} obj - Source object
 * @param {string} path - Dot-separated path (e.g., "video.cameraActive")
 * @returns {*} - Value at path or undefined
 */
function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  
  const parts = path.split('.');
  let current = obj;
  
  for (const part of parts) {
    if (current === undefined || current === null) return undefined;
    current = current[part];
  }
  
  return current;
}

// ============================================================================
// VISIBILITY RULES REGISTRY
// ============================================================================

/**
 * Registry of all visibility rules
 * Each rule maps to a DOM element or group
 */
export const VISIBILITY_RULES = {
  
  // ========================================
  // GROUP 1: TESTING & EXECUTION
  // ========================================
  
  // Rule 4: Audio Pipeline Status visibility
  'audio-pipeline-status-section': {
    id: 'rule-4',
    conditions: [
      { field: 'video.cameraActive', operator: '==', value: true }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    description: 'Show Audio Pipeline Status when camera is active'
  },
  
  // Rule 5: Generate Cue Button
  'generate-cue-btn': {
    id: 'rule-5',
    conditions: [
      { field: 'mode', operator: '==', value: 'Debug' },
      { field: 'audioContext.state', operator: '==', value: 'running' },
      { field: 'workerChain.length', operator: '>', value: 0 }
    ],
    logic: 'AND',
    action: 'enable',
    defaultAction: 'disable',
    timing: 'immediate',
    tooltip: {
      disabled: {
        'mode': 'Only available in Debug mode',
        'audioContext.state': 'Audio not initialized',
        'workerChain.length': 'No workers enabled'
      }
    },
    description: 'Enable Generate Cue button in Debug mode with audio running'
  },
  
  // Rule 6: Touch Pad visibility
  'touch-pad-section': {
    id: 'rule-6',
    conditions: [
      { field: 'mode', operator: '==', value: 'Debug' },
      { field: 'features.interactivePad', operator: '==', value: true }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    description: 'Show Touch Pad in Debug mode when feature enabled'
  },
  
  // ========================================
  // GROUP 2: SIGNAL CHAIN CONTROL
  // ========================================
  
  // Rule 7: Video Source Dropdown
  'video-source-select': {
    id: 'rule-7',
    conditions: [
      { field: 'mode', operator: 'in', value: ['Debug', 'Performance'] }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    description: 'Show video source selector in Debug/Performance mode'
  },
  
  // Rule 8: Worker Toggles Section
  'worker-chain-container': {
    id: 'rule-8',
    conditions: [
      { field: 'mode', operator: '==', value: 'Debug' },
      { field: 'selectedPreset', operator: '==', value: 'custom' }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    description: 'Show worker toggles in Debug mode with Custom preset'
  },
  
  // Rule 10: Preset Selector
  'chain-preset-select': {
    id: 'rule-10',
    conditions: [
      { field: 'mode', operator: 'in', value: ['Debug', 'Performance'] }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    description: 'Show preset selector in Debug/Performance mode'
  },
  
  // Rule 11: Latency Display
  'latency-budget-display': {
    id: 'rule-11',
    conditions: [
      { field: 'selectedPreset', operator: '==', value: 'full' }
    ],
    logic: 'OR',
    alternateConditions: [
      { field: 'mode', operator: '==', value: 'Performance' }
    ],
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    description: 'Show latency display in Full preset or Performance mode'
  },
  
  // ========================================
  // GROUP 3: REAL-TIME MONITORING
  // ========================================
  
  // Rule 12: Performance Chart
  'worker-explorer-container': {
    id: 'rule-12',
    conditions: [
      { field: 'mode', operator: 'in', value: ['Debug', 'Performance'] }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    throttle: 250,
    description: 'Show performance chart in Debug/Performance mode'
  },
  
  // Rule 14: Signal Quality Meter
  'signal-quality-section': {
    id: 'rule-14',
    conditions: [
      { field: 'audio.lastSignal', operator: 'exists', value: true },
      { field: 'features.signalQualityMeter', operator: '==', value: true }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    description: 'Show signal quality meter when audio signal present'
  },
  
  // ========================================
  // GROUP 4: DIAGNOSTICS & INVESTIGATION
  // ========================================
  
  // Rule 15: Diagnostics Group visibility
  'diagnostics': {
    id: 'rule-15',
    conditions: [
      { field: 'mode', operator: '==', value: 'Debug' }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    collapseDefault: true,
    persist: true,
    description: 'Show diagnostics group in Debug mode (collapsed by default)'
  },
  
  // Rule 16: State Inspector
  'state-content': {
    id: 'rule-16',
    conditions: [
      { field: 'diagnostics.visible', operator: '==', value: true }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'throttle',
    throttle: 200,
    description: 'Show state inspector when diagnostics visible (throttled)'
  },
  
  // Rule 17: Orchestration Inspector
  'orchestration-content': {
    id: 'rule-17',
    conditions: [
      { field: 'diagnostics.visible', operator: '==', value: true },
      { field: 'features.orchestrationInspector', operator: '==', value: true }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'debounce',
    debounce: 100,
    description: 'Show orchestration inspector when enabled'
  },
  
  // Rule 18: EventBus Viewer
  'eventbus-viewer-content': {
    id: 'rule-18',
    conditions: [
      { field: 'diagnostics.visible', operator: '==', value: true },
      { field: 'features.eventBusViewer', operator: '==', value: true }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'debounce',
    debounce: 50,
    description: 'Show EventBus viewer when enabled'
  },
  
  // ========================================
  // GROUP 5: LOGGING & OUTPUT
  // ========================================
  
  // Rule 19: Log Level Selector
  'log-level-select': {
    id: 'rule-19',
    conditions: [
      { field: 'mode', operator: 'in', value: ['Debug', 'Performance'] }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    description: 'Show log level selector in Debug/Performance mode'
  },
  
  // Rule 21: Export Logs Button
  'log-export-btn': {
    id: 'rule-21',
    conditions: [
      { field: 'session.hasStarted', operator: '==', value: true }
    ],
    logic: 'AND',
    action: 'enable',
    defaultAction: 'disable',
    timing: 'immediate',
    tooltip: {
      disabled: {
        'session.hasStarted': 'No logs to export yet. Start a test first.'
      }
    },
    description: 'Enable export logs when session has started'
  },
  
  // ========================================
  // GROUP 6: ADVANCED CONFIGURATION
  // ========================================
  
  // Rule 22: Advanced Config Group
  'advanced-config-ui': {
    id: 'rule-22',
    conditions: [
      { field: 'mode', operator: '==', value: 'Debug' }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    collapseDefault: true,
    persist: true,
    description: 'Show advanced config in Debug mode (collapsed by default)'
  },
  
  // Rule 24: Advanced Synth Parameters
  'synth-sandbox-content': {
    id: 'rule-24',
    conditions: [
      { field: 'mode', operator: '==', value: 'Debug' },
      { field: 'advancedConfig.visible', operator: '==', value: true }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    description: 'Show synth parameters in Debug mode when advanced config expanded'
  },
  
  // ========================================
  // GROUP 7: SYSTEM & METADATA
  // ========================================
  
  // Rule 25: System Info Display
  'system-metadata': {
    id: 'rule-25',
    conditions: [
      { field: 'mode', operator: 'in', value: ['Debug', 'Performance'] }
    ],
    logic: 'AND',
    action: 'show',
    defaultAction: 'hide',
    timing: 'immediate',
    collapseDefault: true,
    description: 'Show system info in Debug/Performance mode'
  },
  
  // Rule 26: Reset/Clear Controls
  'reset-controls': {
    id: 'rule-26',
    conditions: [
      { field: 'mode', operator: '==', value: 'Debug' },
      { field: 'user.hasAdminPermission', operator: '==', value: true }
    ],
    logic: 'AND',
    action: 'enable',
    defaultAction: 'disable',
    timing: 'immediate',
    description: 'Enable reset controls for admin users in Debug mode'
  }
};

// ============================================================================
// CONDITION ENGINE CLASS
// ============================================================================

/**
 * Manages conditional visibility/enablement for dev panel elements
 */
export class DevPanelConditionEngine {
  constructor(engine) {
    this.engine = engine;
    this.rules = VISIBILITY_RULES;
    this.elementCache = new Map();
    this.debounceTimers = new Map();
    this.throttleTimers = new Map();
    this.subscriptions = [];
    this.lastState = null;
  }
  
  /**
   * Initialize the condition engine
   * @param {HTMLElement} panelElement - The dev panel container element
   */
  initialize(panelElement) {
    this.panelElement = panelElement;
    
    // Cache element references
    this.cacheElements();
    
    // Subscribe to state changes
    this.subscribeToState();
    
    // Apply initial visibility
    this.applyAllRules();
    
    console.log('DevPanelConditionEngine: Initialized with', Object.keys(this.rules).length, 'rules');
  }
  
  /**
   * Cache DOM element references for performance
   */
  cacheElements() {
    if (!this.panelElement) return;
    
    for (const elementId of Object.keys(this.rules)) {
      const element = this.panelElement.querySelector(`#${elementId}`) ||
                     this.panelElement.querySelector(`[data-condition="${elementId}"]`) ||
                     this.panelElement.querySelector(`.${elementId}`);
      
      if (element) {
        this.elementCache.set(elementId, element);
      }
    }
    
    console.log('DevPanelConditionEngine: Cached', this.elementCache.size, 'elements');
  }
  
  /**
   * Subscribe to engine state changes
   */
  subscribeToState() {
    if (!this.engine?.on) {
      console.warn('DevPanelConditionEngine: Engine does not support event subscription');
      return;
    }
    
    // Subscribe to state change events
    const unsubscribe = this.engine.on('state_changed', (payload) => {
      this.onStateChange(payload);
    });
    
    if (unsubscribe) {
      this.subscriptions.push(unsubscribe);
    }
    
    // Also subscribe to specific events that affect conditions
    const events = [
      'video_capture_started',
      'video_capture_stopped',
      'audio_context_state_changed',
      'mode_changed',
      'preset_changed',
      'worker_chain_updated'
    ];
    
    for (const event of events) {
      const unsub = this.engine.on(event, () => this.applyAllRules());
      if (unsub) this.subscriptions.push(unsub);
    }
  }
  
  /**
   * Handle state change events
   * Note: payload is not used directly - rules evaluate the full state snapshot
   */
  onStateChange() {
    // Throttle state change processing to avoid excessive updates
    if (this.stateChangeThrottle) {
      clearTimeout(this.stateChangeThrottle);
    }
    
    this.stateChangeThrottle = setTimeout(() => {
      this.applyAllRules();
    }, 50);
  }
  
  /**
   * Get current state from engine
   * @returns {Object} Current state
   */
  getCurrentState() {
    if (!this.engine?.getState) {
      return this.getDefaultState();
    }
    
    try {
      const state = this.engine.getState();
      return {
        ...this.getDefaultState(),
        ...state,
        mode: state?.mode || state?.session?.mode || 'Debug',
        selectedPreset: state?.selectedPreset || state?.workerChain?.preset || 'full',
        'video.cameraActive': state?.video?.cameraActive ?? false,
        'audioContext.state': state?.audioContext?.state || 'suspended',
        'workerChain.length': state?.workerChain?.workers?.length ?? 0,
        'diagnostics.visible': this.isGroupExpanded('diagnostics'),
        'advancedConfig.visible': this.isGroupExpanded('advanced-config-ui'),
        'session.hasStarted': state?.session?.hasStarted ?? false,
        'features.interactivePad': state?.features?.interactivePad ?? true,
        'features.signalQualityMeter': state?.features?.signalQualityMeter ?? true,
        'features.orchestrationInspector': state?.features?.orchestrationInspector ?? true,
        'features.eventBusViewer': state?.features?.eventBusViewer ?? true,
        'user.hasAdminPermission': state?.user?.hasAdminPermission ?? true,
        'audio.lastSignal': state?.audio?.lastSignal || null
      };
    } catch (e) {
      console.warn('DevPanelConditionEngine: Error getting state', e);
      return this.getDefaultState();
    }
  }
  
  /**
   * Get default state values
   * @returns {Object} Default state
   */
  getDefaultState() {
    return {
      mode: 'Debug',
      selectedPreset: 'full',
      'video.cameraActive': false,
      'audioContext.state': 'suspended',
      'workerChain.length': 0,
      'diagnostics.visible': false,
      'advancedConfig.visible': false,
      'session.hasStarted': false,
      'features.interactivePad': true,
      'features.signalQualityMeter': true,
      'features.orchestrationInspector': true,
      'features.eventBusViewer': true,
      'user.hasAdminPermission': true,
      'audio.lastSignal': null
    };
  }
  
  /**
   * Check if a group is expanded
   * @param {string} groupId - Group element ID
   * @returns {boolean} Whether the group is expanded
   */
  isGroupExpanded(groupId) {
    const element = this.elementCache.get(groupId) || 
                   this.panelElement?.querySelector(`#${groupId}`);
    
    if (!element) return false;
    
    const collapseBtn = element.querySelector('.group-collapse-btn');
    return collapseBtn?.getAttribute('aria-expanded') === 'true';
  }
  
  /**
   * Apply all visibility rules
   */
  applyAllRules() {
    const state = this.getCurrentState();
    
    for (const [elementId, rule] of Object.entries(this.rules)) {
      this.applyRule(elementId, rule, state);
    }
  }
  
  /**
   * Apply a single visibility rule
   * @param {string} elementId - Target element ID
   * @param {Object} rule - Rule configuration
   * @param {Object} state - Current state
   */
  applyRule(elementId, rule, state) {
    const element = this.elementCache.get(elementId);
    if (!element) return;
    
    // Handle timing (debounce/throttle)
    if (rule.timing === 'debounce' && rule.debounce) {
      this.debounceApply(elementId, rule, state, rule.debounce);
      return;
    }
    
    if (rule.timing === 'throttle' && rule.throttle) {
      this.throttleApply(elementId, rule, state, rule.throttle);
      return;
    }
    
    // Immediate application
    this.executeRule(element, rule, state);
  }
  
  /**
   * Execute a rule on an element
   * @param {HTMLElement} element - Target element
   * @param {Object} rule - Rule configuration
   * @param {Object} state - Current state
   */
  executeRule(element, rule, state) {
    const satisfied = evaluateRule(rule, state);
    const action = satisfied ? rule.action : rule.defaultAction;
    
    switch (action) {
      case 'show':
        element.style.display = '';
        element.removeAttribute('data-hidden');
        break;
        
      case 'hide':
        element.style.display = 'none';
        element.setAttribute('data-hidden', 'true');
        break;
        
      case 'enable':
        element.disabled = false;
        element.classList.remove('disabled');
        element.style.pointerEvents = '';
        element.style.opacity = '';
        this.removeTooltip(element);
        break;
        
      case 'disable':
        element.disabled = true;
        element.classList.add('disabled');
        element.style.pointerEvents = 'none';
        element.style.opacity = '0.5';
        this.applyTooltip(element, rule, state);
        break;
        
      case 'highlight':
        element.classList.add('highlighted');
        break;
        
      default:
        break;
    }
  }
  
  /**
   * Apply tooltip to disabled element explaining why
   * @param {HTMLElement} element - Target element
   * @param {Object} rule - Rule configuration
   * @param {Object} state - Current state
   */
  applyTooltip(element, rule, state) {
    if (!rule.tooltip?.disabled) return;
    
    // Find which condition failed and show appropriate tooltip
    for (const cond of rule.conditions) {
      const satisfied = evaluateCondition(cond, state);
      if (!satisfied && rule.tooltip.disabled[cond.field]) {
        element.title = rule.tooltip.disabled[cond.field];
        return;
      }
    }
  }
  
  /**
   * Remove tooltip from element
   * @param {HTMLElement} element - Target element
   */
  removeTooltip(element) {
    element.removeAttribute('title');
  }
  
  /**
   * Debounce rule application
   * @param {string} elementId - Element ID
   * @param {Object} rule - Rule configuration
   * @param {Object} state - Current state
   * @param {number} delay - Debounce delay in ms
   */
  debounceApply(elementId, rule, state, delay) {
    const existing = this.debounceTimers.get(elementId);
    if (existing) clearTimeout(existing);
    
    const timer = setTimeout(() => {
      const element = this.elementCache.get(elementId);
      if (element) {
        this.executeRule(element, rule, state);
      }
      this.debounceTimers.delete(elementId);
    }, delay);
    
    this.debounceTimers.set(elementId, timer);
  }
  
  /**
   * Throttle rule application
   * @param {string} elementId - Element ID
   * @param {Object} rule - Rule configuration
   * @param {Object} state - Current state
   * @param {number} interval - Throttle interval in ms
   */
  throttleApply(elementId, rule, state, interval) {
    const lastRun = this.throttleTimers.get(elementId);
    const now = Date.now();
    
    if (!lastRun || now - lastRun >= interval) {
      const element = this.elementCache.get(elementId);
      if (element) {
        this.executeRule(element, rule, state);
      }
      this.throttleTimers.set(elementId, now);
    }
  }
  
  /**
   * Manually refresh a specific rule
   * @param {string} elementId - Element ID to refresh
   */
  refreshRule(elementId) {
    const rule = this.rules[elementId];
    if (!rule) return;
    
    const state = this.getCurrentState();
    this.applyRule(elementId, rule, state);
  }
  
  /**
   * Add a custom rule at runtime
   * @param {string} elementId - Element ID
   * @param {Object} rule - Rule configuration
   */
  addRule(elementId, rule) {
    this.rules[elementId] = rule;
    
    // Cache the element
    const element = this.panelElement?.querySelector(`#${elementId}`) ||
                   this.panelElement?.querySelector(`[data-condition="${elementId}"]`);
    if (element) {
      this.elementCache.set(elementId, element);
    }
    
    // Apply immediately
    this.refreshRule(elementId);
  }
  
  /**
   * Remove a rule
   * @param {string} elementId - Element ID
   */
  removeRule(elementId) {
    delete this.rules[elementId];
    this.elementCache.delete(elementId);
  }
  
  /**
   * Dispose of the condition engine
   */
  dispose() {
    // Clear timers
    for (const timer of this.debounceTimers.values()) {
      clearTimeout(timer);
    }
    this.debounceTimers.clear();
    this.throttleTimers.clear();
    
    // Unsubscribe from events
    for (const unsub of this.subscriptions) {
      if (typeof unsub === 'function') unsub();
    }
    this.subscriptions = [];
    
    // Clear caches
    this.elementCache.clear();
    this.panelElement = null;
    
    console.log('DevPanelConditionEngine: Disposed');
  }
}

// ============================================================================
// INITIALIZATION HELPER
// ============================================================================

/**
 * Initialize the condition engine for a dev panel
 * @param {Object} engine - Application engine
 * @param {HTMLElement} panelElement - Dev panel container
 * @returns {DevPanelConditionEngine} Initialized engine
 */
export function initializeConditionEngine(engine, panelElement) {
  const conditionEngine = new DevPanelConditionEngine(engine);
  conditionEngine.initialize(panelElement);
  return conditionEngine;
}

export default DevPanelConditionEngine;
