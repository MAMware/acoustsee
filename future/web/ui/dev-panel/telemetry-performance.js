/**
 * @file telemetry-performance.js
 * @description Performance optimizer for telemetry collection and rendering
 * @module future/web/ui/dev-panel/telemetry-performance
 * 
 * Phase 5: Real Latency Instrumentation & Performance Optimization
 * 
 * Performance Targets (from DEV_PANEL_RESTRUCTURE_PHASES.md):
 * - Telemetry overhead: <2% CPU
 * - Memory usage: <50MB stable for 1-hour session
 * - Chart update: <50ms per frame
 * - Panel render: <100ms
 * 
 * Strategies:
 * 1. requestIdleCallback for non-critical updates
 * 2. Batched DOM updates via DocumentFragment
 * 3. Throttled event emission
 * 4. Memory-bounded circular buffers
 * 5. Lazy initialization of expensive components
 */

// === CONSTANTS ===
const PERFORMANCE_DEFAULTS = {
    // Timing budgets (milliseconds)
    IDLE_DEADLINE_BUDGET: 16,        // Target 60fps frame time
    CHART_UPDATE_BUDGET: 50,         // Max time for chart updates
    RENDER_BUDGET: 100,              // Max time for panel render
    
    // Throttle intervals
    DOM_UPDATE_INTERVAL: 100,        // Minimum time between DOM updates
    EVENT_BATCH_INTERVAL: 50,        // Batch events this often
    STATS_EMIT_INTERVAL: 1000,       // Performance stats emission interval
    
    // Memory limits
    MAX_PENDING_UPDATES: 100,        // Cap pending update queue
    MAX_EVENT_BATCH_SIZE: 50,        // Max events per batch
    BUFFER_TRIM_THRESHOLD: 0.9,      // Trim buffers at 90% capacity
    
    // Feature flags
    USE_IDLE_CALLBACK: true,         // Use requestIdleCallback when available
    USE_INTERSECTION_OBSERVER: true, // Only update visible elements
    PROFILE_PERFORMANCE: false       // Enable detailed performance logging
};

/**
 * Performance optimizer for telemetry systems
 * Uses requestIdleCallback, batching, and throttling to minimize overhead
 */
export class TelemetryPerformanceOptimizer {
    /**
     * @param {Object} engine - Application engine with event bus
     * @param {Object} options - Configuration options
     */
    constructor(engine, options = {}) {
        this.engine = engine;
        this.config = { ...PERFORMANCE_DEFAULTS, ...options };
        
        // Performance tracking
        this.performanceMetrics = {
            cpuSamples: new CircularSampleBuffer(60),    // 1 minute at 1Hz
            memorySnapshots: new CircularSampleBuffer(60),
            updateTimes: new CircularSampleBuffer(100),
            eventCounts: new CircularSampleBuffer(60)
        };
        
        // Batching state
        this.pendingUpdates = new Map();        // Element -> update function
        this.pendingEvents = [];                // Events to batch
        this.updateScheduled = false;
        this.eventBatchScheduled = false;
        
        // Throttling state
        this.lastDomUpdate = 0;
        this.lastStatsEmit = 0;
        
        // Intersection observer for visibility-based updates
        this.visibleElements = new Set();
        this.intersectionObserver = null;
        
        // Idle callback tracking
        this.idleCallbackId = null;
        this.rafId = null;
        
        // Bound methods for callbacks
        this._boundIdleCallback = this._processIdleWork.bind(this);
        this._boundRafCallback = this._processRafWork.bind(this);
        this._boundEmitBatchedEvents = this._emitBatchedEvents.bind(this);
        
        // Initialize
        this._initializeObservers();
        this._startPerformanceMonitoring();
        
        // Track initialization
        this._emitEvent('telemetry_optimizer_initialized', {
            config: this._getSafeConfig(),
            hasIdleCallback: typeof requestIdleCallback === 'function',
            hasIntersectionObserver: typeof IntersectionObserver === 'function'
        });
    }
    
    // === PUBLIC API ===
    
    /**
     * Schedule a DOM update to run during idle time
     * @param {string} elementId - Unique identifier for the element
     * @param {Function} updateFn - Function to perform the update
     * @param {Object} options - Update options
     * @param {boolean} options.priority - High priority updates skip idle scheduling
     * @param {boolean} options.visibilityGated - Only run if element is visible
     */
    scheduleUpdate(elementId, updateFn, options = {}) {
        const { priority = 'low', visibilityGated = true } = options;
        
        // Check capacity
        if (this.pendingUpdates.size >= this.config.MAX_PENDING_UPDATES) {
            // Drop oldest non-priority updates
            this._trimPendingUpdates();
        }
        
        // Store update (newer updates replace older ones for same element)
        this.pendingUpdates.set(elementId, {
            fn: updateFn,
            priority,
            visibilityGated,
            timestamp: performance.now()
        });
        
        // Schedule processing
        if (priority === 'high') {
            this._scheduleRaf();
        } else {
            this._scheduleIdleCallback();
        }
    }
    
    /**
     * Queue an event for batched emission
     * @param {string} eventType - Event type name
     * @param {Object} eventData - Event payload
     */
    queueEvent(eventType, eventData) {
        if (this.pendingEvents.length >= this.config.MAX_EVENT_BATCH_SIZE) {
            // Flush immediately if at capacity
            this._emitBatchedEvents();
        }
        
        this.pendingEvents.push({
            type: eventType,
            data: eventData,
            timestamp: performance.now()
        });
        
        // Schedule batch emission
        if (!this.eventBatchScheduled) {
            this.eventBatchScheduled = true;
            setTimeout(this._boundEmitBatchedEvents, this.config.EVENT_BATCH_INTERVAL);
        }
    }
    
    /**
     * Register an element for visibility tracking
     * @param {HTMLElement} element - DOM element to track
     * @param {string} elementId - Unique identifier
     */
    trackVisibility(element, elementId) {
        if (!this.intersectionObserver || !element) return;
        
        element.dataset.telemetryId = elementId;
        this.intersectionObserver.observe(element);
    }
    
    /**
     * Unregister an element from visibility tracking
     * @param {HTMLElement} element - DOM element to untrack
     */
    untrackVisibility(element) {
        if (!this.intersectionObserver || !element) return;
        
        const elementId = element.dataset.telemetryId;
        if (elementId) {
            this.visibleElements.delete(elementId);
        }
        this.intersectionObserver.unobserve(element);
    }
    
    /**
     * Check if an element is currently visible
     * @param {string} elementId - Element identifier
     * @returns {boolean}
     */
    isVisible(elementId) {
        return this.visibleElements.has(elementId);
    }
    
    /**
     * Create a throttled version of a function
     * @param {Function} fn - Function to throttle
     * @param {number} interval - Minimum interval between calls
     * @returns {Function} Throttled function
     */
    throttle(fn, interval) {
        let lastCall = 0;
        let pendingArgs = null;
        let timeoutId = null;
        
        const throttled = (...args) => {
            const now = performance.now();
            const elapsed = now - lastCall;
            
            if (elapsed >= interval) {
                lastCall = now;
                fn.apply(this, args);
            } else {
                // Store args for trailing call
                pendingArgs = args;
                if (!timeoutId) {
                    timeoutId = setTimeout(() => {
                        lastCall = performance.now();
                        fn.apply(this, pendingArgs);
                        pendingArgs = null;
                        timeoutId = null;
                    }, interval - elapsed);
                }
            }
        };
        
        throttled.cancel = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
                pendingArgs = null;
            }
        };
        
        return throttled;
    }
    
    /**
     * Create a debounced version of a function
     * @param {Function} fn - Function to debounce
     * @param {number} delay - Delay in milliseconds
     * @returns {Function} Debounced function
     */
    debounce(fn, delay) {
        let timeoutId = null;
        
        const debounced = (...args) => {
            if (timeoutId) {
                clearTimeout(timeoutId);
            }
            timeoutId = setTimeout(() => {
                fn.apply(this, args);
                timeoutId = null;
            }, delay);
        };
        
        debounced.cancel = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                timeoutId = null;
            }
        };
        
        debounced.flush = () => {
            if (timeoutId) {
                clearTimeout(timeoutId);
                fn.apply(this);
                timeoutId = null;
            }
        };
        
        return debounced;
    }
    
    /**
     * Run a function with performance measurement
     * @param {string} label - Label for the measurement
     * @param {Function} fn - Function to measure
     * @returns {*} Result of the function
     */
    measure(label, fn) {
        const start = performance.now();
        try {
            const result = fn();
            const duration = performance.now() - start;
            
            this.performanceMetrics.updateTimes.push({
                label,
                duration,
                timestamp: start
            });
            
            if (this.config.PROFILE_PERFORMANCE) {
                this._logPerformance(label, duration);
            }
            
            return result;
        } catch (error) {
            const duration = performance.now() - start;
            this._emitEvent('telemetry_operation_error', {
                label,
                duration,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Run an async function with performance measurement
     * @param {string} label - Label for the measurement
     * @param {Function} asyncFn - Async function to measure
     * @returns {Promise<*>} Result of the function
     */
    async measureAsync(label, asyncFn) {
        const start = performance.now();
        try {
            const result = await asyncFn();
            const duration = performance.now() - start;
            
            this.performanceMetrics.updateTimes.push({
                label,
                duration,
                timestamp: start
            });
            
            if (this.config.PROFILE_PERFORMANCE) {
                this._logPerformance(label, duration);
            }
            
            return result;
        } catch (error) {
            const duration = performance.now() - start;
            this._emitEvent('telemetry_operation_error', {
                label,
                duration,
                error: error.message
            });
            throw error;
        }
    }
    
    /**
     * Get current performance metrics
     * @returns {Object} Performance statistics
     */
    getMetrics() {
        const updateTimes = this.performanceMetrics.updateTimes.getAll();
        const cpuSamples = this.performanceMetrics.cpuSamples.getAll();
        const memorySnapshots = this.performanceMetrics.memorySnapshots.getAll();
        
        return {
            updates: {
                count: updateTimes.length,
                averageMs: this._calculateAverage(updateTimes.map(u => u.duration)),
                maxMs: Math.max(0, ...updateTimes.map(u => u.duration)),
                exceedingBudget: updateTimes.filter(u => u.duration > this.config.CHART_UPDATE_BUDGET).length
            },
            pending: {
                updates: this.pendingUpdates.size,
                events: this.pendingEvents.length
            },
            visibility: {
                trackedElements: this.visibleElements.size
            },
            memory: this._getLatestMemory(memorySnapshots),
            cpu: this._estimateCpuUsage(cpuSamples)
        };
    }
    
    /**
     * Force flush all pending updates and events
     */
    flush() {
        // Process all pending updates immediately
        for (const [elementId, update] of this.pendingUpdates) {
            try {
                update.fn();
            } catch (error) {
                console.warn(`[TelemetryPerformance] Flush update failed for ${elementId}:`, error);
            }
        }
        this.pendingUpdates.clear();
        
        // Emit all pending events
        this._emitBatchedEvents();
    }
    
    /**
     * Clean up all resources
     */
    dispose() {
        // Cancel scheduled callbacks
        if (this.idleCallbackId !== null && typeof cancelIdleCallback === 'function') {
            cancelIdleCallback(this.idleCallbackId);
        }
        if (this.rafId !== null) {
            cancelAnimationFrame(this.rafId);
        }
        
        // Stop monitoring
        if (this._monitoringInterval) {
            clearInterval(this._monitoringInterval);
        }
        
        // Disconnect observer
        if (this.intersectionObserver) {
            this.intersectionObserver.disconnect();
        }
        
        // Flush pending work
        this.flush();
        
        // Clear state
        this.visibleElements.clear();
        this.pendingUpdates.clear();
        this.pendingEvents = [];
        
        this._emitEvent('telemetry_optimizer_disposed', {
            finalMetrics: this.getMetrics()
        });
    }
    
    // === PRIVATE METHODS ===
    
    /**
     * Initialize intersection observer for visibility tracking
     * @private
     */
    _initializeObservers() {
        if (!this.config.USE_INTERSECTION_OBSERVER) return;
        if (typeof IntersectionObserver !== 'function') return;
        
        this.intersectionObserver = new IntersectionObserver(
            (entries) => {
                for (const entry of entries) {
                    const elementId = entry.target.dataset.telemetryId;
                    if (!elementId) continue;
                    
                    if (entry.isIntersecting) {
                        this.visibleElements.add(elementId);
                    } else {
                        this.visibleElements.delete(elementId);
                    }
                }
            },
            {
                root: null,         // Use viewport
                rootMargin: '50px', // Preload slightly outside viewport
                threshold: 0.1     // 10% visibility triggers
            }
        );
    }
    
    /**
     * Start periodic performance monitoring
     * @private
     */
    _startPerformanceMonitoring() {
        this._monitoringInterval = setInterval(() => {
            this._samplePerformance();
        }, this.config.STATS_EMIT_INTERVAL);
    }
    
    /**
     * Sample current performance metrics
     * @private
     */
    _samplePerformance() {
        const now = performance.now();
        
        // Sample memory if available
        if (typeof performance !== 'undefined' && performance.memory) {
            this.performanceMetrics.memorySnapshots.push({
                usedJSHeapSize: performance.memory.usedJSHeapSize,
                totalJSHeapSize: performance.memory.totalJSHeapSize,
                timestamp: now
            });
        }
        
        // Track event count for this period
        this.performanceMetrics.eventCounts.push({
            count: this._eventCountSinceLast || 0,
            timestamp: now
        });
        this._eventCountSinceLast = 0;
        
        // Emit stats periodically
        if (now - this.lastStatsEmit >= this.config.STATS_EMIT_INTERVAL) {
            this.lastStatsEmit = now;
            this._emitEvent('telemetry_performance_stats', this.getMetrics());
        }
    }
    
    /**
     * Schedule work via requestIdleCallback
     * @private
     */
    _scheduleIdleCallback() {
        if (this.updateScheduled) return;
        this.updateScheduled = true;
        
        if (this.config.USE_IDLE_CALLBACK && typeof requestIdleCallback === 'function') {
            this.idleCallbackId = requestIdleCallback(this._boundIdleCallback, {
                timeout: 100  // Force execution after 100ms if never idle
            });
        } else {
            // Fallback to setTimeout
            setTimeout(() => this._processIdleWork({ timeRemaining: () => 16 }), 0);
        }
    }
    
    /**
     * Schedule work via requestAnimationFrame (for high priority)
     * @private
     */
    _scheduleRaf() {
        if (this.rafId !== null) return;
        this.rafId = requestAnimationFrame(this._boundRafCallback);
    }
    
    /**
     * Process work during idle time
     * @param {IdleDeadline} deadline
     * @private
     */
    _processIdleWork(deadline) {
        this.updateScheduled = false;
        this.idleCallbackId = null;
        
        const startTime = performance.now();
        let processedCount = 0;
        
        // Process updates while we have time
        for (const [elementId, update] of this.pendingUpdates) {
            // Check deadline
            if (deadline.timeRemaining() < 1 && !deadline.didTimeout) {
                // Reschedule remaining work
                if (this.pendingUpdates.size > 0) {
                    this._scheduleIdleCallback();
                }
                break;
            }
            
            // Skip visibility-gated updates for non-visible elements
            if (update.visibilityGated && !this.visibleElements.has(elementId)) {
                this.pendingUpdates.delete(elementId);
                continue;
            }
            
            // Process update
            try {
                update.fn();
                processedCount++;
            } catch (error) {
                console.warn(`[TelemetryPerformance] Update failed for ${elementId}:`, error);
            }
            
            this.pendingUpdates.delete(elementId);
        }
        
        // Track processing time
        const duration = performance.now() - startTime;
        if (processedCount > 0) {
            this.performanceMetrics.updateTimes.push({
                label: 'idle_batch',
                duration,
                count: processedCount,
                timestamp: startTime
            });
        }
    }
    
    /**
     * Process high-priority work in animation frame
     * @param {number} _timestamp - RAF timestamp (unused, using performance.now() for consistency)
     * @private
     */
    _processRafWork(_timestamp) { // eslint-disable-line no-unused-vars
        this.rafId = null;
        
        const startTime = performance.now();
        let processedCount = 0;
        
        // Process high-priority updates
        for (const [elementId, update] of this.pendingUpdates) {
            if (update.priority !== 'high') continue;
            
            try {
                update.fn();
                processedCount++;
            } catch (error) {
                console.warn(`[TelemetryPerformance] High-priority update failed for ${elementId}:`, error);
            }
            
            this.pendingUpdates.delete(elementId);
            
            // Budget check - don't exceed frame budget
            if (performance.now() - startTime > this.config.IDLE_DEADLINE_BUDGET) {
                break;
            }
        }
        
        // Track processing time
        if (processedCount > 0) {
            const duration = performance.now() - startTime;
            this.performanceMetrics.updateTimes.push({
                label: 'raf_batch',
                duration,
                count: processedCount,
                timestamp: startTime
            });
        }
        
        // Schedule remaining high-priority work
        const remainingHighPriority = Array.from(this.pendingUpdates.values())
            .some(u => u.priority === 'high');
        if (remainingHighPriority) {
            this._scheduleRaf();
        }
    }
    
    /**
     * Emit batched events
     * @private
     */
    _emitBatchedEvents() {
        this.eventBatchScheduled = false;
        
        if (this.pendingEvents.length === 0) return;
        
        const events = this.pendingEvents;
        this.pendingEvents = [];
        
        this._eventCountSinceLast = (this._eventCountSinceLast || 0) + events.length;
        
        // Emit individual events
        for (const event of events) {
            this._emitEvent(event.type, event.data);
        }
        
        // Emit batch summary
        if (events.length > 1) {
            this._emitEvent('telemetry_events_batched', {
                count: events.length,
                types: [...new Set(events.map(e => e.type))]
            });
        }
    }
    
    /**
     * Trim pending updates when at capacity
     * @private
     */
    _trimPendingUpdates() {
        // Keep high-priority updates, remove oldest low-priority
        const entries = Array.from(this.pendingUpdates.entries());
        const lowPriority = entries.filter(([, u]) => u.priority !== 'high');
        
        // Sort by timestamp (oldest first)
        lowPriority.sort((a, b) => a[1].timestamp - b[1].timestamp);
        
        // Remove oldest 25%
        const removeCount = Math.ceil(lowPriority.length * 0.25);
        for (let i = 0; i < removeCount; i++) {
            this.pendingUpdates.delete(lowPriority[i][0]);
        }
    }
    
    /**
     * Emit an event through the engine
     * @param {string} type - Event type
     * @param {Object} data - Event data
     * @private
     */
    _emitEvent(type, data) {
        if (!this.engine?.emit) return;
        
        this.engine.emit(type, {
            ...data,
            source: 'telemetry-performance',
            timestamp: Date.now()
        });
    }
    
    /**
     * Calculate average of numeric array
     * @param {number[]} values
     * @returns {number}
     * @private
     */
    _calculateAverage(values) {
        if (values.length === 0) return 0;
        return values.reduce((sum, v) => sum + v, 0) / values.length;
    }
    
    /**
     * Get latest memory snapshot
     * @param {Array} snapshots
     * @returns {Object|null}
     * @private
     */
    _getLatestMemory(snapshots) {
        if (snapshots.length === 0) return null;
        const latest = snapshots[snapshots.length - 1];
        return {
            usedMB: latest.usedJSHeapSize / (1024 * 1024),
            totalMB: latest.totalJSHeapSize / (1024 * 1024),
            timestamp: latest.timestamp
        };
    }
    
    /**
     * Estimate CPU usage from event processing
     * @param {Array} _samples - CPU samples (future enhancement, currently using updateTimes)
     * @returns {Object}
     * @private
     */
    _estimateCpuUsage(_samples) { // eslint-disable-line no-unused-vars
        // This is a rough estimate based on update times
        // Future: Use _samples for more accurate CPU tracking
        const updateTimes = this.performanceMetrics.updateTimes.getAll();
        if (updateTimes.length === 0) return { estimatedPercent: 0 };
        
        const recentUpdates = updateTimes.filter(
            u => u.timestamp > performance.now() - 1000
        );
        const totalTime = recentUpdates.reduce((sum, u) => sum + u.duration, 0);
        
        // Estimate as percentage of last second
        return {
            estimatedPercent: Math.min(100, (totalTime / 1000) * 100),
            withinBudget: totalTime < 20  // <2% of 1 second
        };
    }
    
    /**
     * Get safe config for logging (no functions)
     * @returns {Object}
     * @private
     */
    _getSafeConfig() {
        const safe = {};
        for (const [key, value] of Object.entries(this.config)) {
            if (typeof value !== 'function') {
                safe[key] = value;
            }
        }
        return safe;
    }
    
    /**
     * Log performance measurement
     * @param {string} label
     * @param {number} duration
     * @private
     */
    _logPerformance(label, duration) {
        const status = duration > this.config.CHART_UPDATE_BUDGET ? '⚠️' : '✓';
        console.debug(`[TelemetryPerformance] ${status} ${label}: ${duration.toFixed(2)}ms`);
    }
}

/**
 * Simple circular buffer for performance samples
 */
class CircularSampleBuffer {
    /**
     * @param {number} capacity - Maximum samples to store
     */
    constructor(capacity) {
        this.capacity = capacity;
        this.samples = [];
        this.head = 0;
    }
    
    /**
     * Add a sample to the buffer
     * @param {*} sample
     */
    push(sample) {
        if (this.samples.length < this.capacity) {
            this.samples.push(sample);
        } else {
            this.samples[this.head] = sample;
            this.head = (this.head + 1) % this.capacity;
        }
    }
    
    /**
     * Get all samples in order (oldest first)
     * @returns {Array}
     */
    getAll() {
        if (this.samples.length < this.capacity) {
            return [...this.samples];
        }
        // Reconstruct order: from head to end, then start to head
        return [
            ...this.samples.slice(this.head),
            ...this.samples.slice(0, this.head)
        ];
    }
    
    /**
     * Get the most recent sample
     * @returns {*}
     */
    getLast() {
        if (this.samples.length === 0) return null;
        const lastIndex = this.samples.length < this.capacity
            ? this.samples.length - 1
            : (this.head - 1 + this.capacity) % this.capacity;
        return this.samples[lastIndex];
    }
    
    /**
     * Clear all samples
     */
    clear() {
        this.samples = [];
        this.head = 0;
    }
}

/**
 * Factory function for creating pre-configured optimizers
 * @param {Object} engine - Application engine
 * @param {string} profile - Performance profile name
 * @returns {TelemetryPerformanceOptimizer}
 */
export function createOptimizer(engine, profile = 'balanced') {
    const profiles = {
        // Minimal overhead, aggressive batching
        low: {
            DOM_UPDATE_INTERVAL: 250,
            EVENT_BATCH_INTERVAL: 100,
            MAX_PENDING_UPDATES: 50,
            PROFILE_PERFORMANCE: false
        },
        // Default balanced settings
        balanced: {
            DOM_UPDATE_INTERVAL: 100,
            EVENT_BATCH_INTERVAL: 50,
            MAX_PENDING_UPDATES: 100,
            PROFILE_PERFORMANCE: false
        },
        // Responsive but higher overhead
        high: {
            DOM_UPDATE_INTERVAL: 50,
            EVENT_BATCH_INTERVAL: 16,
            MAX_PENDING_UPDATES: 200,
            PROFILE_PERFORMANCE: false
        },
        // Debug mode with profiling
        debug: {
            DOM_UPDATE_INTERVAL: 100,
            EVENT_BATCH_INTERVAL: 50,
            MAX_PENDING_UPDATES: 100,
            PROFILE_PERFORMANCE: true
        }
    };
    
    return new TelemetryPerformanceOptimizer(engine, profiles[profile] || profiles.balanced);
}

// Default export
export default TelemetryPerformanceOptimizer;
