/**
 * @fileoverview EventBus analytics subscribers
 * Wires the unified EventBus to analytics endpoints via existing ingest infrastructure.
 * 
 * @module core/event-bus-analytics
 */
import { trackFeatureUse, sendToUnifiedAnalytics } from './ingest.js';
import { structuredLog } from '../utils/logging.js';
import { isFrameTrace } from '../utils/trace-id.js';

/**
 * Initialize analytics subscribers on the EventBus.
 * This replaces the direct engine.dispatch() tracking from ingest.js.
 * 
 * @param {object} eventBus - EventBus instance
 * @param {object} state - Application state (for category configuration)
 */
export function initializeAnalytics(eventBus, state) {
  // Subscribe to ALL events for unified analytics
  const unsubscribeAll = eventBus.subscribe('log', (event) => {
    try {
      // Filter out frame traces - they're for local debugging only
      if (event.traceId && isFrameTrace(event.traceId)) {
        return;
      }
      
      const categoryConfig = state.eventCategories?.[event.category];
      
      // Only send to analytics if configured
      if (!categoryConfig || !categoryConfig.destinations?.includes('analytics')) {
        return;
      }
      
      // Send to unified analytics (new traceId-enabled endpoint)
      sendToUnifiedAnalytics(event).catch(err => {
        structuredLog('WARN', 'Failed to send to unified analytics', {
          category: event.category,
          error: err.message
        });
      });
    } catch (err) {
      // Isolate errors - don't break EventBus if analytics fails
      structuredLog('ERROR', 'Analytics subscriber error', {
        category: event.category,
        error: err.message
      });
    }
  });
  
  // Subscribe to command events for unified analytics
  const unsubscribeCommands = eventBus.subscribe('command', (event) => {
    try {
      // Filter out frame traces - they're for local debugging only
      if (event.traceId && isFrameTrace(event.traceId)) {
        return;
      }
      
      const categoryConfig = state.eventCategories?.[event.category];
      
      // Only send to analytics if configured
      if (!categoryConfig || !categoryConfig.destinations?.includes('analytics')) {
        return;
      }
      
      // Send to unified analytics (new traceId-enabled endpoint)
      sendToUnifiedAnalytics(event).catch(err => {
        structuredLog('WARN', 'Failed to send command to unified analytics', {
          category: event.category,
          error: err.message
        });
      });
      
      // LEGACY: Also send user workflows to old endpoint for backward compatibility
      const isUserWorkflow = ['startProcessing', 'stopProcessing', 'toggleProcessing', 'setMode'].includes(event.category);
      const isPerformanceSettings = ['setMaxNotes', 'setMotionThreshold', 'setAutoFPS'].includes(event.category);
      
      if (isUserWorkflow || isPerformanceSettings) {
        trackFeatureUse(event.category, {
          ...event.data,
          timestamp: event.timestamp,
          traceId: event.traceId
        }).catch(err => {
          // Silent fail for legacy endpoint
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
  
  // Subscribe to ERROR-level logs for unified analytics
  const unsubscribeErrors = eventBus.subscribe('log:ERROR', (event) => {
    try {
      // Filter out frame traces - they're for local debugging only
      if (event.traceId && isFrameTrace(event.traceId)) {
        return;
      }
      
      const categoryConfig = state.eventCategories?.['ERROR'];
      
      if (!categoryConfig || !categoryConfig.destinations?.includes('analytics')) {
        return;
      }
      
      // Send to unified analytics
      sendToUnifiedAnalytics(event).catch(err => {
        // Silent fail
      });
      
      // LEGACY: Also send ERROR logs to old endpoint
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
