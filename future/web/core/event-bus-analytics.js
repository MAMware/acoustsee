/**
 * @fileoverview EventBus analytics subscribers
 * Wires the unified EventBus to analytics endpoints via existing ingest infrastructure.
 * 
 * @module core/event-bus-analytics
 */
// TODO is this compatible with current D1 implementation? 
// TODO we have two ingest.js, the oter is at utils, lets try to improve
import { trackFeatureUse } from './ingest.js';
import { structuredLog } from '../utils/logging.js';

/**
 * Initialize analytics subscribers on the EventBus.
 * This replaces the direct engine.dispatch() tracking from ingest.js.
 * 
 * @param {object} eventBus - EventBus instance
 * @param {object} state - Application state (for category configuration)
 */
export function initializeAnalytics(eventBus, state) {
  // Subscribe to command events that need analytics tracking
  const unsubscribeCommands = eventBus.subscribe('command', (event) => {
    try {
      const categoryConfig = state.eventCategories?.[event.category];
      
      // Only send to analytics if configured
      if (!categoryConfig || !categoryConfig.destinations?.includes('analytics')) {
        return;
      }
      
      // Map old ingestCategories to new event categories
      const isUserWorkflow = ['startProcessing', 'stopProcessing', 'toggleProcessing', 'setMode'].includes(event.category);
      const isPerformanceSettings = ['setMaxNotes', 'setMotionThreshold', 'setAutoFPS'].includes(event.category);
      
      if (isUserWorkflow || isPerformanceSettings) {
        // Send to analytics via existing infrastructure
        trackFeatureUse(event.category, {
          ...event.data,
          timestamp: event.timestamp,
          traceId: event.traceId
        }).catch(err => {
          structuredLog('WARN', 'Failed to track feature use', {
            category: event.category,
            error: err.message
          });
        });
      }
    } catch (err) {
      // Isolate errors - don't break EventBus if analytics fails
      structuredLog('ERROR', 'Analytics subscriber error', {
        category: event.category,
        error: err.message
      });
    }
  });
  
  // Subscribe to ERROR-level logs for analytics tracking
  const unsubscribeErrors = eventBus.subscribe('log:ERROR', (event) => {
    try {
      const categoryConfig = state.eventCategories?.['ERROR'];
      
      if (!categoryConfig || !categoryConfig.destinations?.includes('analytics')) {
        return;
      }
      
      // Send ERROR logs to analytics
      trackFeatureUse('ERROR', {
        message: event.data.message,
        filename: event.data.filename,
        lineno: event.data.lineno,
        stack: event.data.stack,
        timestamp: event.timestamp,
        traceId: event.traceId
      }).catch(err => {
        structuredLog('WARN', 'Failed to track error', {
          error: err.message
        });
      });
    } catch (err) {
      // Isolate errors
      console.warn('Error analytics subscriber failed:', err);
    }
  });
  
  // Return cleanup function
  return () => {
    unsubscribeCommands();
    unsubscribeErrors();
  };
}
