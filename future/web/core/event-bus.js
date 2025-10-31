/**
 * @fileoverview Unified Event Bus for logging, command tracking, and analytics.
 * Consolidates logging.js and ingest.js event collection.
 * 
 * Architecture Rules:
 * - Rule 3: Must be dependency-injected (created in main.js, passed to modules)
 * - Rule 5: All events sanitized to ensure JSON-serializability //TODO: R311025 is this lean? CPU cost?
 * 
 * @module core/event-bus
 */

import { structuredLog } from '../utils/logging.js';

/**
 * Sanitize event data to ensure JSON-serializability (Rule 5).
 * Removes functions, class instances, DOM nodes, MediaStreams, etc.
 * 
 * @param {object} obj - Object to sanitize
 * @returns {object} - JSON-serializable version
 */
function sanitizeEvent(obj) {
  if (obj === null || obj === undefined) return obj;
  
  // Primitive types are safe
  if (typeof obj !== 'object') return obj;
  
  // Arrays: recursively sanitize elements
  if (Array.isArray(obj)) {
    return obj.map(sanitizeEvent);
  }
  
  // Objects: filter out non-serializable properties
  const sanitized = {};
  for (const key in obj) {
    if (!obj.hasOwnProperty(key)) continue;
    
    const value = obj[key];
    const valueType = typeof value;
    
    // Skip functions
    if (valueType === 'function') continue;
    
    // Skip DOM nodes
    if (value instanceof Node) continue;
    
    // Skip MediaStreams, Workers, etc.
    if (value instanceof MediaStream || 
        value instanceof Worker ||
        value instanceof WebSocket) {
      continue;
    }
    
    // Recursively sanitize nested objects
    if (valueType === 'object' && value !== null) {
      sanitized[key] = sanitizeEvent(value);
    } else {
      sanitized[key] = value;
    }
  }
  
  return sanitized;
}

/**
 * Factory function to create EventBus instance.
 * 
 * @param {object} config - Configuration object
 * @param {object} config.state - Central application state (for eventCategories)
 * @param {number} [config.maxEvents=200] - Maximum events in ring buffer
 * @returns {object} EventBus instance
 */
export function createEventBus(config) {
  const { state, maxEvents = 200 } = config;
  
  // Ring buffer for event history (FIFO with fixed size)
  const eventLog = [];
  
  // Subscribers organized by category
  // Structure: { 'log:INFO': [fn1, fn2], 'command:updateGrid': [fn3] }
  const subscribers = {};
  
  /**
   * Emit an event to the bus.
   * Events are sanitized, stored in ring buffer, and dispatched to subscribers.
   * 
   * @param {object} event - Event object
   * @param {string} event.type - Event type ('log' or 'command')
   * @param {string} event.category - Category (e.g., 'INFO', 'audioCuesReady')
   * @param {number} event.timestamp - Unix timestamp (ms)
   * @param {object} [event.data] - Event payload
   * @param {string} [event.traceId] - Optional trace ID for correlated events
   */
  function emit(event) {
    // Validate required fields
    if (!event.type || !event.category) {
      structuredLog('WARN', 'EventBus.emit called with invalid event', { event });
      return;
    }
    
    // Sanitize event data (Rule 5)
    const sanitizedEvent = {
      type: event.type,
      category: event.category,
      timestamp: event.timestamp || Date.now(),
      data: sanitizeEvent(event.data || {}),
      traceId: event.traceId || null
    };
    
    // Add to ring buffer (FIFO eviction when full)
    eventLog.push(sanitizedEvent);
    if (eventLog.length > maxEvents) {
      eventLog.shift(); // Remove oldest event
    }
    
    // Check if event should be sampled/tracked based on state.eventCategories
    const categoryConfig = state.eventCategories?.[sanitizedEvent.category];
    if (categoryConfig && !shouldSampleEvent(sanitizedEvent, categoryConfig)) {
      return; // Skip this event based on sampling rules
    }
    
    // Notify subscribers
    const fullCategory = `${sanitizedEvent.type}:${sanitizedEvent.category}`;
    const categorySubscribers = subscribers[fullCategory] || [];
    const wildcardSubscribers = subscribers[sanitizedEvent.type] || [];
    
    // Call subscribers with error isolation
    [...categorySubscribers, ...wildcardSubscribers].forEach(callback => {
      try {
        callback(sanitizedEvent);
      } catch (error) {
        // Isolate subscriber errors - don't let one bad subscriber break the bus
        structuredLog('ERROR', 'EventBus subscriber error', {
          category: fullCategory,
          error: error.message,
          stack: error.stack
        });
      }
    });
  }
  
  /**
   * Subscribe to events of a specific type/category.
   * 
   * @param {string} pattern - Subscription pattern
   *   - 'log' or 'command' for all events of that type
   *   - 'log:INFO' for specific category within type
   * @param {function} callback - Function to call when event matches
   * @returns {function} Unsubscribe function
   */
  function subscribe(pattern, callback) {
    if (!subscribers[pattern]) {
      subscribers[pattern] = [];
    }
    subscribers[pattern].push(callback);
    
    // Return unsubscribe function
    return () => {
      const index = subscribers[pattern].indexOf(callback);
      if (index > -1) {
        subscribers[pattern].splice(index, 1);
      }
    };
  }
  
  /**
   * Get recent events from ring buffer.
   * 
   * @param {object} [filter] - Optional filter
   * @param {string} [filter.type] - Filter by event type
   * @param {string} [filter.category] - Filter by category
   * @param {string} [filter.traceId] - Filter by traceId (exact match)
   * @param {string} [filter.parentTrace] - Filter by parentTrace (for frame traces)
   * @param {number} [filter.since] - Filter by timestamp (get events after this)
   * @param {number} [filter.limit] - Maximum number of events to return
   * @returns {Array} Filtered events
   */
  function getEvents(filter = {}) {
    let filtered = [...eventLog];
    
    if (filter.type) {
      filtered = filtered.filter(e => e.type === filter.type);
    }
    
    if (filter.category) {
      filtered = filtered.filter(e => e.category === filter.category);
    }
    
    // Filter by traceId (exact match)
    if (filter.traceId) {
      filtered = filtered.filter(e => e.traceId === filter.traceId);
    }
    
    // Filter by parentTrace (for finding all events related to a user action)
    if (filter.parentTrace) {
      filtered = filtered.filter(e => 
        e.traceId === filter.parentTrace || e.data?.parentTrace === filter.parentTrace
      );
    }
    
    if (filter.since) {
      filtered = filtered.filter(e => e.timestamp >= filter.since);
    }
    
    if (filter.limit) {
      filtered = filtered.slice(-filter.limit);
    }
    
    return filtered;
  }
  
  /**
   * Determine if an event should be sampled based on category configuration.
   * 
   * @param {object} event - Sanitized event
   * @param {object} categoryConfig - Config from state.eventCategories
   * @returns {boolean} True if event should be processed
   */
  function shouldSampleEvent(event, categoryConfig) {
    // If no sample rate specified, include all events
    if (!categoryConfig.sampleRate) return true;
    
    // Apply sampling
    return Math.random() < categoryConfig.sampleRate;
  }
  
  /**
   * Clear the event log (useful for testing).
   */
  function clear() {
    eventLog.length = 0;
  }
  
  /**
   * Get current buffer size.
   */
  function size() {
    return eventLog.length;
  }
  
  return {
    emit,
    subscribe,
    getEvents,
    clear,
    size
  };
}
