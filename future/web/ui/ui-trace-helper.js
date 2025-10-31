/**
 * @fileoverview Helper for automatic traceId generation in UI event handlers
 * 
 * Provides a wrapper that automatically generates traceIds for user-initiated actions,
 * making it easy to correlate UI events with downstream commands and errors.
 * 
 * @module ui/ui-trace-helper
 */

import { generateTraceId } from '../utils/trace-id.js';
import { structuredLog } from '../utils/logging.js';

/**
 * Wrap a UI event handler to automatically generate and pass a traceId.
 * 
 * Use this for user-initiated actions (clicks, gestures, key presses)
 * to ensure they have trace context for debugging.
 * 
 * @example
 * // Before:
 * button.addEventListener('click', () => {
 *   engine.dispatch('startCamera', null, { traceId: generateTraceId() });
 * });
 * 
 * // After:
 * button.addEventListener('click', withUserActionTrace('startCamera', (traceId) => {
 *   engine.dispatch('startCamera', null, { traceId });
 * }));
 * 
 * @param {string} label - Human-readable label for the action (e.g., 'startCamera', 'changeGrid')
 * @param {function(string): void} handler - Handler that receives the generated traceId
 * @returns {function(): void} Wrapped handler that can be passed to addEventListener
 */
export function withUserActionTrace(label, handler) {
  return function wrappedHandler(...args) {
    const traceId = generateTraceId();
    
    structuredLog('DEBUG', 'ui-trace-helper', 
      `User action: ${label}`,
      { traceId, label, args: args.slice(0, 3) } // Sample first 3 args only
    );
    
    try {
      return handler(traceId, ...args);
    } catch (error) {
      structuredLog('ERROR', 'ui-trace-helper',
        `Error in user action handler: ${label}`,
        { traceId, label, error: error.message, stack: error.stack }
      );
      throw error; // Re-throw so caller can handle
    }
  };
}

/**
 * Create a traced dispatch helper bound to an engine instance.
 * 
 * Convenience function for UIs that dispatch many commands.
 * 
 * @example
 * const tracedDispatch = createTracedDispatch(engine);
 * button.addEventListener('click', () => {
 *   tracedDispatch('startCamera', null, 'button-click');
 * });
 * 
 * @param {object} engine - Engine instance
 * @returns {function(string, any, string): void} Dispatch function with auto-tracing
 */
export function createTracedDispatch(engine) {
  return function tracedDispatch(command, payload, label) {
    const traceId = generateTraceId();
    
    structuredLog('DEBUG', 'ui-trace-helper',
      `Traced dispatch: ${label || command}`,
      { traceId, command, label }
    );
    
    return engine.dispatch(command, payload, { traceId });
  };
}

/**
 * Create a batch tracing context for multiple related actions.
 * 
 * Use when a single user action triggers multiple commands that should
 * share a parent trace context.
 * 
 * @example
 * const batch = createTraceBatch('init-workflow');
 * engine.dispatch('startCamera', null, { traceId: batch.child('camera') });
 * engine.dispatch('initAudio', null, { traceId: batch.child('audio') });
 * 
 * @param {string} label - Label for the batch operation
 * @returns {object} Batch context with child() method
 */
export function createTraceBatch(label) {
  const parentTraceId = generateTraceId();
  let childIndex = 0;
  
  structuredLog('DEBUG', 'ui-trace-helper',
    `Trace batch started: ${label}`,
    { traceId: parentTraceId, label }
  );
  
  return {
    parentTraceId,
    
    /**
     * Generate a child traceId linked to the parent batch.
     * @param {string} childLabel - Label for this child action
     * @returns {string} Child traceId with parent context
     */
    child(childLabel) {
      childIndex++;
      const childTraceId = `${parentTraceId}-${childIndex}`;
      
      structuredLog('DEBUG', 'ui-trace-helper',
        `Trace batch child: ${label} > ${childLabel}`,
        { traceId: childTraceId, parentTraceId, childLabel, childIndex }
      );
      
      return childTraceId;
    }
  };
}
