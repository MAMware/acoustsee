/**
 * @fileoverview Standardized UI context for plug-and-play UI development
 * 
 * Provides a consistent initialization contract for all UI modules.
 * New UIs receive a single context object with all necessary dependencies.
 * 
 * @module ui/ui-context
 */

import { structuredLog } from '../utils/logging.js';
import { generateTraceId } from '../utils/trace-id.js';

/**
 * Create a standardized UI context object.
 * This ensures all UIs have access to the same core infrastructure.
 * 
 * @param {object} config - Configuration object
 * @param {object} config.engine - Engine instance (dispatch, getState, onStateChange)
 * @param {object} config.DOM - Pre-cached DOM elements
 * @param {object} config.eventBus - Unified EventBus for logs/commands
 * @param {object} [config.settings] - Application settings (optional, can use engine.getState())
 * @param {string} [config.basePath] - Base path for dynamic imports (optional)
 * @param {string} [config.importMetaUrl] - import.meta.url for relative paths (optional)
 * @returns {object} Standardized UI context
 */
export function createUIContext(config) {
  const {
    engine,
    DOM,
    eventBus,
    settings,
    basePath,
    importMetaUrl
  } = config;
  
  // Validate required dependencies
  if (!engine) {
    throw new Error('createUIContext: engine is required');
  }
  if (!DOM) {
    throw new Error('createUIContext: DOM is required');
  }
  if (!eventBus) {
    throw new Error('createUIContext: eventBus is required');
  }
  
  return {
    // Core dependencies (required)
    engine,
    DOM,
    eventBus,
    
    // Settings access (convenience)
    settings: settings || engine.getState(),
    
    // Helper functions (convenience wrappers)
    generateTraceId,
    structuredLog,
    
    // Optional paths for dynamic imports
    basePath,
    importMetaUrl,
    
    // Convenience accessors
    dispatch: (command, payload, options) => engine.dispatch(command, payload, options),
    getState: () => engine.getState(),
    onStateChange: (listener) => engine.onStateChange(listener)
  };
}

/**
 * Validate that a UI context has all required properties.
 * Useful for defensive checks in UI initialization.
 * 
 * @param {object} uiContext - Context to validate
 * @returns {boolean} True if valid
 */
export function isValidUIContext(uiContext) {
  if (!uiContext || typeof uiContext !== 'object') return false;
  
  const required = ['engine', 'DOM', 'eventBus'];
  return required.every(prop => uiContext[prop] !== undefined);
}
