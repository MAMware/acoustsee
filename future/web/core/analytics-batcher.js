/**
 * @fileoverview Analytics Batcher for Cloudflare Worker ingestion
 * 
 * Purpose: Accumulate events over a period (30-60 seconds) and send as a single batch
 * rather than real-time individual fetch() calls.
 * 
 * Architecture:
 * - Real-time: Console/Dev Panel (immediate, local processing)
 * - Batched: Cloudflare Worker (deferred, 30-60s intervals)
 * - Critical: Errors (immediate via navigator.sendBeacon)
 * 
 * Benefits:
 * - Reduces Cloudflare fetch calls from 60/sec to 0.03/sec (99% reduction)
 * - Aggregates related events server-side
 * - Allows for more efficient processing
 * - Maintains visibility via console/dev panel
 * 
 * @module core/analytics-batcher
 */

/**
 * Determine if an event should be batched vs sent immediately
 * 
 * Events to BATCH (deferred 30-60s):
 * - High-frequency commands (audioCuesReady, flowCuesReady, etc.)
 * - Performance metrics (frame timing, memory)
 * - DEBUG level logs
 * 
 * Events to SEND IMMEDIATELY:
 * - ERROR level logs (user-visible issues)
 * - User interactions (mode change, grid change)
 * - System warnings
 * 
 * @param {object} event - Event object from EventBus
 * @returns {boolean} - true if should batch, false if should send immediately
 */
export function shouldBatchEvent(event) {
  // Don't batch errors - send immediately
  if (event.category === 'ERROR' || event.type === 'error') {
    return false;
  }
  
  // Don't batch user interactions - send immediately
  const userActions = ['setMode', 'setGridType', 'setSynthEngine', 'setMaxNotes', 'setMotionThreshold'];
  if (userActions.includes(event.category)) {
    return false;
  }
  
  // Don't batch system warnings
  if (event.category === 'WARN' || event.category === 'WARNING') {
    return false;
  }
  
  // Batch everything else (DEBUG, INFO, high-frequency commands)
  return true;
}

/**
 * Analytics Batcher - Accumulate events and send periodically
 * 
 * Usage:
 * ```javascript
 * const batcher = new AnalyticsBatcher(30000); // 30-second batches
 * 
 * eventBus.subscribe('log', (event) => {
 *   if (shouldBatchEvent(event)) {
 *     batcher.add(event);
 *   }
 * });
 * ```
 */
export class AnalyticsBatcher {
  /**
   * Create a new AnalyticsBatcher instance
   * 
   * @param {number} flushInterval - How often to flush events (ms), default 30000
   * @param {string} endpoint - Cloudflare worker endpoint URL
   * @param {object} options - Additional options
   * @param {number} options.maxBatchSize - Max events per batch before forced flush, default 1000
   * @param {boolean} options.debugLogging - Enable debug output, default false
   */
  constructor(flushInterval = 30000, endpoint = null, options = {}) {
    this.buffer = [];
    this.flushInterval = flushInterval;
    this.endpoint = endpoint || (typeof process !== 'undefined' ? 
      'https://acoustsee-analytics.mamware.workers.dev' :
      'https://acoustsee-analytics.mamware.workers.dev');
    this.maxBatchSize = options.maxBatchSize || 1000;
    this.debugLogging = options.debugLogging || false;
    
    this.lastFlush = Date.now();
    this.isFlushInProgress = false;
    this.failedBatches = 0;
    this.successfulBatches = 0;
    
    // Start the periodic flush timer
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushInterval);
    
    // Cleanup on page unload
    if (typeof window !== 'undefined') {
      window.addEventListener('beforeunload', () => {
        this.dispose();
      });
    }
  }

  /**
   * Add an event to the batch buffer
   * 
   * If buffer reaches maxBatchSize, forces immediate flush
   * 
   * @param {object} event - Event to add to batch
   */
  add(event) {
    if (!event || typeof event !== 'object') {
      return;
    }

    this.buffer.push(event);

    if (this.debugLogging && Math.random() < 0.01) {
      console.debug(`[AnalyticsBatcher] Added event, buffer now: ${this.buffer.length}`);
    }

    // Force flush if buffer exceeds max size
    if (this.buffer.length >= this.maxBatchSize) {
      if (this.debugLogging) {
        console.debug(`[AnalyticsBatcher] Buffer full (${this.buffer.length}), forcing flush`);
      }
      this.flush();
    }
  }

  /**
   * Flush buffered events to Cloudflare worker
   * 
   * - Sends all events in current buffer as single request
   * - Re-tries failed batches on next flush
   * - Updates metrics (success count, failure count)
   * 
   * @returns {Promise<void>}
   */
  async flush() {
    // Prevent concurrent flushes
    if (this.isFlushInProgress) {
      return;
    }

    if (this.buffer.length === 0) {
      return;
    }

    this.isFlushInProgress = true;

    try {
      // Extract batch (don't splice until success)
      const batch = this.buffer.slice(0, this.buffer.length);
      
      if (this.debugLogging) {
        console.debug(`[AnalyticsBatcher] Flushing ${batch.length} events`);
      }

      const payload = {
        type: 'analytics_batch',
        events: batch,
        batchSize: batch.length,
        batchTimestamp: Date.now(),
        batchInterval: this.flushInterval
      };

      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        // Only remove from buffer on success
        this.buffer.splice(0, batch.length);
        this.successfulBatches++;
        this.failedBatches = 0; // Reset failure counter on success

        if (this.debugLogging) {
          console.debug(`[AnalyticsBatcher] Flush successful, ${this.buffer.length} events remaining`);
        }
      } else {
        this.failedBatches++;
        if (this.debugLogging) {
          console.warn(`[AnalyticsBatcher] Flush failed (${response.status}), will retry next interval`);
        }
      }
    } catch (err) {
      this.failedBatches++;
      if (this.debugLogging) {
        console.error(`[AnalyticsBatcher] Flush error:`, err?.message || String(err));
      }
      // Don't log repeatedly - errors in batcher could cause infinite recursion
    }

    this.isFlushInProgress = false;
  }

  /**
   * Get current batcher statistics
   * 
   * @returns {object} - Metrics object
   */
  getStats() {
    return {
      bufferSize: this.buffer.length,
      flushInterval: this.flushInterval,
      maxBatchSize: this.maxBatchSize,
      successfulBatches: this.successfulBatches,
      failedBatches: this.failedBatches,
      uptime: Date.now() - this.lastFlush
    };
  }

  /**
   * Change the flush interval
   * 
   * @param {number} newInterval - New interval in milliseconds
   */
  setFlushInterval(newInterval) {
    if (newInterval < 1000) {
      console.warn('[AnalyticsBatcher] Flush interval too low (<1s), ignoring');
      return;
    }
    this.flushInterval = newInterval;
    clearInterval(this.flushTimer);
    this.flushTimer = setInterval(() => {
      this.flush();
    }, newInterval);
  }

  /**
   * Force immediate flush (for testing or graceful shutdown)
   * 
   * @returns {Promise<void>}
   */
  async forceFlush() {
    await this.flush();
  }

  /**
   * Clean up batcher resources
   * 
   * - Clears timer
   * - Optionally flushes remaining events
   */
  dispose(flushBeforeDispose = false) {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }

    if (flushBeforeDispose && this.buffer.length > 0) {
      // Final flush attempt (fire and forget)
      this.flush().catch(() => {
        // Silent - we're shutting down anyway
      });
    }

    this.buffer = [];
  }

  /**
   * Make stats available to console
   * 
   * Usage: batcher.printStats()
   */
  printStats() {
    console.table(this.getStats());
  }
}

/**
 * Critical event handler - Send errors immediately via sendBeacon
 * 
 * Usage: Call this from event-bus-analytics when ERROR event occurs
 * 
 * @param {object} event - Error event
 * @param {string} endpoint - Cloudflare worker endpoint
 */
export function sendCriticalEventBeacon(event, endpoint) {
  try {
    if (typeof navigator === 'undefined' || !navigator.sendBeacon) {
      // Fallback to fetch if beacon not available
      fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        keepalive: true,
        body: JSON.stringify({
          type: 'error_beacon',
          event,
          isFallback: true
        })
      }).catch(() => {
        // Silent fail
      });
      return;
    }

    const payload = {
      type: 'error_beacon',
      event,
      timestamp: Date.now()
    };

    const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
    navigator.sendBeacon(endpoint, blob);
  } catch (err) {
    // Silent fail - don't log errors from error handler
  }
}
