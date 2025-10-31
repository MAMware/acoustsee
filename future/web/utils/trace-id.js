/**
 * @fileoverview TraceId generation and utilities for event correlation
 * 
 * Two-tier tracing strategy:
 * 1. User Action Traces: High-level workflow tracking (sent to analytics)
 *    Format: {timestamp}-{random}-{seq} (e.g., "1730368747051-a4f3-001")
 * 
 * 2. Frame Traces: Low-level debug tracking (local only, opt-in)
 *    Format: frame-{N} (e.g., "frame-00042")
 * 
 * @module utils/trace-id
 */

let _sequenceCounter = 0;
let _frameCounter = 0;

/**
 * Generate a unique trace ID for user actions and high-level operations.
 * Format: {timestamp}-{random}-{seq}
 * Example: "1730368747051-a4f3-001"
 * 
 * This traceId is:
 * - Sent to analytics for workflow correlation
 * - Propagated through engine commands
 * - Inherited by all downstream events
 * 
 * @returns {string} Unique trace ID
 */
export function generateTraceId() {
  const timestamp = Date.now();
  const random = Math.random().toString(16).substring(2, 6); // 4 hex chars
  const sequence = String(_sequenceCounter).padStart(3, '0');
  
  _sequenceCounter = (_sequenceCounter + 1) % 1000; // Reset after 999
  
  return `${timestamp}-${random}-${sequence}`;
}

/**
 * Generate a frame trace ID for detailed frame-by-frame debugging.
 * Format: frame-{N}
 * Example: "frame-00042"
 * 
 * This traceId is:
 * - NOT sent to analytics (too high frequency)
 * - Only generated when debugConfig.traceFrames is enabled
 * - Links to parent user action via parentTrace field
 * 
 * @returns {string} Frame trace ID
 */
export function generateFrameTraceId() {
  const frameId = String(_frameCounter).padStart(5, '0');
  _frameCounter = (_frameCounter + 1) % 100000; // Reset after 99999
  return `frame-${frameId}`;
}

/**
 * Extract timestamp from user action traceId for filtering/sorting.
 * 
 * @param {string} traceId - TraceId to parse
 * @returns {number|null} Unix timestamp in milliseconds, or null if invalid
 */
export function getTraceTimestamp(traceId) {
  if (!traceId || typeof traceId !== 'string') return null;
  
  // Handle frame traces (no timestamp)
  if (traceId.startsWith('frame-')) return null;
  
  const parts = traceId.split('-');
  if (parts.length < 3) return null;
  
  const timestamp = parseInt(parts[0], 10);
  return isNaN(timestamp) ? null : timestamp;
}

/**
 * Check if traceId is valid user action format.
 * 
 * @param {string} traceId - TraceId to validate
 * @returns {boolean} True if valid user action traceId
 */
export function isValidTraceId(traceId) {
  if (!traceId || typeof traceId !== 'string') return false;
  
  // Frame traces are valid but different format
  if (traceId.startsWith('frame-')) {
    return /^frame-\d{5}$/.test(traceId);
  }
  
  // User action traces: {timestamp}-{random}-{seq}
  const pattern = /^\d{13}-[a-f0-9]{4}-\d{3}$/;
  return pattern.test(traceId);
}

/**
 * Check if traceId is a frame trace (vs user action trace).
 * 
 * @param {string} traceId - TraceId to check
 * @returns {boolean} True if frame trace
 */
export function isFrameTrace(traceId) {
  return traceId && typeof traceId === 'string' && traceId.startsWith('frame-');
}

/**
 * Reset counters (useful for testing).
 */
export function resetCounters() {
  _sequenceCounter = 0;
  _frameCounter = 0;
}
