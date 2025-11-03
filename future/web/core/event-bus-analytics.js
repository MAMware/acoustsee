/**
 * @fileoverview EventBus analytics subscribers
 * Wires the unified EventBus to analytics endpoints via existing ingest infrastructure.
 * 
 * ARCHITECTURE:
 * - Real-time: Console/Dev Panel (local processing, no network)
 * - Batched: Cloudflare Worker (30-60s intervals, deferred)
 * - Critical: Errors (immediate via navigator.sendBeacon)
 * 
 * @module core/event-bus-analytics
 */
import { trackFeatureUse, sendToUnifiedAnalytics } from './ingest.js';
import { structuredLog } from '../utils/logging.js';
import { isFrameTrace } from '../utils/trace-id.js';
import { AnalyticsBatcher, shouldBatchEvent, sendCriticalEventBeacon } from './analytics-batcher.js';

// Global analytics batcher instance (30-second batches)
let globalBatcher = null;

/**
 * Initialize analytics subscribers on the EventBus.
 * This replaces the direct engine.dispatch() tracking from ingest.js.
 * 
 * OPTIMIZATION: High-frequency events (audioCuesReady, etc.) are batched
 * rather than sent individually, reducing network traffic by 99%.
 * 
 * @param {object} eventBus - EventBus instance
 * @param {object} state - Application state (for category configuration)
 * @param {object} options - Additional options
 * @param {number} options.batchInterval - Batch flush interval in ms (default 30000)
 * @param {string} options.endpoint - Cloudflare worker endpoint
 */
export function initializeAnalytics(eventBus, state, options = {}) {
  const batchInterval = options.batchInterval || 30000; // 30 seconds
  const endpoint = options.endpoint || 'https://acoustsee-analytics.mamware.workers.dev';
  
  // Create global batcher instance
  globalBatcher = new AnalyticsBatcher(batchInterval, endpoint, {
    maxBatchSize: 1000,
    debugLogging: state?.debugLogging || false
  });

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
      
      // OPTIMIZATION: Use batcher for non-critical events
      if (shouldBatchEvent(event)) {
        globalBatcher.add(event);
      } else {
        // Send ERROR/WARNING immediately
        sendCriticalEventBeacon(event, endpoint);
      }
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
      
      // OPTIMIZATION: User commands (setMode, setGridType) sent immediately
      // High-frequency commands (audioCuesReady) sent via batcher
      if (shouldBatchEvent(event)) {
        globalBatcher.add(event);
      } else {
        // User interaction - send immediately via beacon
        sendCriticalEventBeacon(event, endpoint);
      }
      
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
      
      // ERROR events: Send immediately via beacon (critical)
      sendCriticalEventBeacon(event, endpoint);
      
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
    unsubscribeAll();
    unsubscribeCommands();
    unsubscribeErrors();
    if (globalBatcher) {
      globalBatcher.dispose(true); // Flush remaining events before dispose
    }
  };
}

/**
 * Get global batcher instance (for testing, console access)
 * 
 * Usage: window.__audioSeeDebug.getAnalyticsBatcher().getStats()
 */
export function getGlobalBatcher() {
  return globalBatcher;
}
