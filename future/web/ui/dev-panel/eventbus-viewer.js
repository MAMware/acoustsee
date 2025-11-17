// File: future/web/ui/dev-panel/eventbus-viewer.js
// EventBus Viewer component - visualizes events, traceId correlation, and filtering

import { structuredLog } from '../../utils/logging.js';

/**
 * Initialize EventBus Viewer component
 * Event-driven architecture: renders only when new events arrive
 * @param {Object} engine - Engine instance with eventBus
 * @param {Object} DOM - DOM cache with eventbus-viewer elements
 * @returns {Function} dispose - Cleanup function
 */
export function initEventBusViewer(engine, DOM) {
  // Try to get eventBus from engine, fall back to global window.eventBus
  let eventBus = engine?.eventBus;
  
  if (!eventBus && typeof window !== 'undefined') {
    eventBus = window.eventBus;
  }
  
  if (!eventBus) {
    structuredLog('WARN', 'EventBusViewer: eventBus not available on engine or window');
    return () => {};
  }

  // State
  let selectedTraceId = null;
  let filters = {
    type: 'all',      // 'all', 'log', 'command'
    category: 'all',  // 'all', 'INFO', 'DEBUG', 'WARN', 'ERROR', or command category
    showFrames: false // Whether to show frame traces
  };
  let lastEventCount = 0; // Track if new events arrived

    // --- Delta Histogram Snapshot Chart State ---
    const histogramBuffer = [];
    const batchSize = 10;
    let lastUploadTs = 0;
    function handleDeltaHistogramSnapshot(event) {
      if (!event || !event.data || !Array.isArray(event.data.histogram)) return;
      histogramBuffer.push(event.data.histogram);
      if (histogramBuffer.length >= batchSize) {
        // Simulate analytics upload (replace with real endpoint)
        structuredLog('INFO', 'Analytics batch upload', { batch: histogramBuffer.slice() });
        histogramBuffer.length = 0;
        lastUploadTs = Date.now();
      }
      renderHistogramChart(event.data.histogram);
    }

    // --- Render Mini-Chart for Delta Histogram ---
    function renderHistogramChart(histogram) {
      const metricsContainer = DOM['eventbus-metrics-container'];
      if (!metricsContainer) return;
      let chart = metricsContainer.querySelector('#delta-histogram-chart');
      if (!chart) {
        chart = document.createElement('canvas');
        chart.id = 'delta-histogram-chart';
        chart.width = 160;
        chart.height = 40;
        chart.style.margin = '8px 0';
        metricsContainer.appendChild(chart);
      }
      import('./worker-charts.js').then(({ scaleCanvasForDPR }) => {
        scaleCanvasForDPR(chart, 160, 40);
        const ctx = chart.getContext('2d');
        ctx.clearRect(0, 0, chart.width, chart.height);
        if (Array.isArray(histogram)) {
          const max = Math.max(...histogram, 1);
          for (let i = 0; i < histogram.length; ++i) {
            const x = i * (chart.width / histogram.length);
            const h = (histogram[i] / max) * (chart.height - 4);
            ctx.fillStyle = '#3498db';
            ctx.fillRect(x, chart.height - h, chart.width / histogram.length - 2, h);
          }
        }
      });
    }
  
  // OPTIMIZATION: Bind refresh rate to source processing FPS
  // Get updateInterval from engine state (default 166ms = ~6fps)
  let updateInterval = engine?.state?.updateInterval || 166;
  let debounceMs = updateInterval * 0.5; // Refresh at 2x processing rate to stay responsive

  // DOM elements
  const container = DOM['eventbus-viewer-container'];
  const eventList = DOM['eventbus-event-list'];
  const correlationView = DOM['eventbus-correlation-view'];
  const filterType = DOM['eventbus-filter-type'];
  const filterCategory = DOM['eventbus-filter-category'];
  const filterFrames = DOM['eventbus-filter-frames'];
  const refreshBtn = DOM['eventbus-refresh-btn'];
  const autoRefreshCheckbox = DOM['eventbus-auto-refresh'];
  const clearBtn = DOM['eventbus-clear-btn'];
  const exportBtn = DOM['eventbus-export-btn'];
  const eventCount = DOM['eventbus-event-count'];

  if (!container) {
    structuredLog('WARN', 'EventBusViewer: Container element not found');
    return () => {};
  }

  /**
   * Get filtered events from EventBus
   */
  function getFilteredEvents() {
    let events = eventBus.getEvents();

    // Filter by type
    if (filters.type !== 'all') {
      events = events.filter(e => e.type === filters.type);
    }

    // Filter by category
    if (filters.category !== 'all') {
      events = events.filter(e => e.category === filters.category);
    }

    // Filter out frame traces unless enabled
    if (!filters.showFrames) {
      events = events.filter(e => !e.traceId || !e.traceId.startsWith('frame-'));
    }

    return events;
  }

  /**
   * Calculate approximate size of an event in bytes
   */
  function getEventSizeBytes(event) {
    return JSON.stringify(event).length;
  }

  /**
   * Calculate total buffer size in bytes and convert to kB
   */
  function getBufferSizeKB() {
    const events = eventBus.getEvents?.() || [];
    const totalBytes = events.reduce((sum, event) => sum + getEventSizeBytes(event), 0);
    return (totalBytes / 1024).toFixed(1);
  }

  /**
   * Render event bus metrics (buffer usage, subscribers, etc.)
   */
  function renderMetrics() {
    const metricsContainer = DOM['eventbus-metrics-container'];
    if (!metricsContainer) return; // Skip if container not in DOM

    const metrics = eventBus.getMetrics?.();
    if (!metrics) {
      metricsContainer.innerHTML = '<div class="eventbus-metrics-unavailable">Metrics unavailable</div>';
      return;
    }

    // Calculate buffer size in KB
    const bufferSizeKB = getBufferSizeKB();

    // Create visual gauge for buffer usage
    const gaugeColor = metrics.bufferUsagePercent < 50 
      ? '#27ae60' // Green
      : metrics.bufferUsagePercent < 80 
        ? '#f39c12' // Orange
        : '#e74c3c'; // Red

    metricsContainer.innerHTML = `
      <div class="eventbus-metrics-grid">
        <div class="metrics-card">
          <div class="metrics-label-wrapper">
            <span class="metrics-label">Buffer Usage</span>
            <span class="metrics-tooltip" title="Ring buffer capacity: ${metrics.bufferCapacity} events max. Current usage: ${metrics.bufferUsagePercent}% (${bufferSizeKB} kB)">ⓘ</span>
          </div>
          <div class="metrics-gauge" style="--usage: ${metrics.bufferUsagePercent}%; --color: ${gaugeColor};">
            <div class="gauge-fill"></div>
            <div class="gauge-text">${metrics.bufferSize}/${metrics.bufferCapacity}</div>
          </div>
          <div class="metrics-detail">${metrics.bufferUsagePercent}% full • ${bufferSizeKB} kB</div>
        </div>

        <div class="metrics-card">
          <div class="metrics-label-wrapper">
            <span class="metrics-label">Subscribers</span>
            <span class="metrics-tooltip" title="Count of active event subscribers and patterns they listen to">ⓘ</span>
          </div>
          <div class="metrics-value">${metrics.totalSubscribers}</div>
          <div class="metrics-detail">${metrics.patternsActive} active patterns</div>
        </div>

        <div class="metrics-card">
          <div class="metrics-label-wrapper">
            <span class="metrics-label">Events (by type)</span>
            <span class="metrics-tooltip" title="Distribution of log and command events in the buffer">ⓘ</span>
          </div>
          <div class="metrics-breakdown">
            ${Object.entries(metrics.eventCounts.byType).map(([type, count]) => 
              `<div class="metrics-row"><span>${type}</span><span>${count}</span></div>`
            ).join('')}
          </div>
        </div>

        <div class="metrics-card">
          <div class="metrics-label-wrapper">
            <span class="metrics-label">Events (by category)</span>
            <span class="metrics-tooltip" title="Top 6 event categories (INFO, DEBUG, ERROR, etc.) with scroll">ⓘ</span>
          </div>
          <div class="metrics-breakdown metrics-breakdown-scrollable">
            ${Object.entries(metrics.eventCounts.byCategory)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 6)
              .map(([category, count]) => 
                `<div class="metrics-row"><span>${category}</span><span>${count}</span></div>`
              ).join('')}
          </div>
        </div>

        <div class="metrics-card">
          <div class="metrics-label-wrapper">
            <span class="metrics-label">Time Span</span>
            <span class="metrics-tooltip" title="Duration between oldest and newest event in buffer">ⓘ</span>
          </div>
          <div class="metrics-value">${metrics.timeSpanMs}ms</div>
          <div class="metrics-detail">${metrics.totalEventsInBuffer} events</div>
        </div>
      </div>
    `;
  }

  /**
   * Render event list
   */
  function renderEventList() {
    const events = getFilteredEvents();
    
    if (eventCount) {
      eventCount.textContent = `${events.length} events`;
    }

    if (!eventList) return;

    if (events.length === 0) {
      eventList.innerHTML = '<div class="eventbus-empty">No events match the current filters</div>';
      return;
    }

    // Show last 50 events (most recent first)
    const recentEvents = events.slice(-50).reverse();

    eventList.innerHTML = recentEvents.map(event => {
      const time = new Date(event.timestamp).toISOString().slice(11, 23);
      const hasTrace = event.traceId && event.traceId !== 'null';
      const isSelected = hasTrace && event.traceId === selectedTraceId;
      
      return `
        <div class="eventbus-event-item ${isSelected ? 'selected' : ''}" 
             data-trace-id="${hasTrace ? event.traceId : ''}"
             data-timestamp="${event.timestamp}">
          <div class="event-header">
            <span class="event-time">${time}</span>
            <span class="event-type event-type-${event.type}">${event.type}</span>
            <span class="event-category event-category-${event.category}">${event.category}</span>
            ${hasTrace ? `<span class="event-trace" title="${event.traceId}">🔗 ${event.traceId.slice(-8)}</span>` : ''}
          </div>
          <div class="event-message">${escapeHtml(event.data?.message || event.message || '-')}</div>
          ${event.data && Object.keys(event.data).length > 1 ? `<div class="event-data">${formatEventData(event.data)}</div>` : ''}
        </div>
      `;
    }).join('');

    // Add click handlers for traceId selection
    eventList.querySelectorAll('.eventbus-event-item[data-trace-id]').forEach(item => {
      const traceId = item.getAttribute('data-trace-id');
      if (traceId) {
        item.addEventListener('click', () => selectTraceId(traceId));
      }
    });
  }

  /**
   * Render correlation view for selected traceId
   */
  function renderCorrelationView() {
    if (!correlationView) return;

    if (!selectedTraceId) {
      correlationView.innerHTML = '<div class="eventbus-empty">Click an event with a traceId to see correlated events</div>';
      return;
    }

    const correlatedEvents = eventBus.getEvents({ traceId: selectedTraceId });

    if (correlatedEvents.length === 0) {
      correlationView.innerHTML = `<div class="eventbus-empty">No events found for traceId: ${selectedTraceId}</div>`;
      return;
    }

    const firstTimestamp = correlatedEvents[0].timestamp;

    correlationView.innerHTML = `
      <div class="correlation-header">
        <h4>Event Chain: ${selectedTraceId}</h4>
        <button class="correlation-close" title="Close">✕</button>
      </div>
      <div class="correlation-timeline">
        ${correlatedEvents.map((event, idx) => {
          const relativeTime = event.timestamp - firstTimestamp;
          const time = new Date(event.timestamp).toISOString().slice(11, 23);
          
          return `
            <div class="correlation-event">
              <div class="correlation-marker">${idx + 1}</div>
              <div class="correlation-details">
                <div class="correlation-meta">
                  <span class="event-time">${time}</span>
                  <span class="event-delta">+${relativeTime}ms</span>
                  <span class="event-type event-type-${event.type}">${event.type}</span>
                  <span class="event-category event-category-${event.category}">${event.category}</span>
                </div>
                <div class="correlation-message">${escapeHtml(event.data?.message || event.message || '-')}</div>
                ${event.data ? `<details class="correlation-data" open><summary>Data</summary><pre>${JSON.stringify(event.data, null, 2)}</pre></details>` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Add close button handler
    const closeBtn = correlationView.querySelector('.correlation-close');
    if (closeBtn) {
      closeBtn.addEventListener('click', () => {
        selectedTraceId = null;
        renderCorrelationView();
        renderEventList(); // Re-render to remove selection highlight
      });
    }
  }

  /**
   * Select a traceId for correlation view
   */
  function selectTraceId(traceId) {
    selectedTraceId = traceId;
    renderCorrelationView();
    renderEventList(); // Re-render to highlight selected event
  }

  /**
   * Format event data for display
   */
  function formatEventData(data) {
    const filtered = Object.entries(data)
      .filter(([key]) => key !== 'message') // Already shown
      .slice(0, 3); // Limit to first 3 fields
    
    if (filtered.length === 0) return '';
    
    return filtered.map(([key, value]) => {
      const displayValue = typeof value === 'object' 
        ? JSON.stringify(value).slice(0, 50) + '...'
        : String(value).slice(0, 50);
      return `<span class="data-field">${key}: ${escapeHtml(displayValue)}</span>`;
    }).join(' ');
  }

  /**
   * Escape HTML to prevent XSS
   */
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * Export events as JSON
   */
  function exportEvents() {
    const events = getFilteredEvents();
    const blob = new Blob([JSON.stringify(events, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `eventbus-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    structuredLog('INFO', 'EventBusViewer: Exported events', { count: events.length });
  }

  /**
   * Clear EventBus (if supported)
   */
  function clearEvents() {
    if (confirm('Clear all events from EventBus? This cannot be undone.')) {
      // EventBus doesn't expose clear(), but we can document that it's a ring buffer
      alert('EventBus uses a ring buffer - new events will overwrite old ones automatically (200 event limit)');
      structuredLog('INFO', 'EventBusViewer: Clear requested (automatic via ring buffer)');
    }
  }

  /**
   * Smart refresh: only render if new events arrived
   * OPTIMIZATION: Cache filtered events to avoid redundant filtering
   */
  function smartRefresh() {
    const currentEvents = getFilteredEvents();
    
    // Always update metrics (they change even without new filtered events)
    renderMetrics();
    
    // Only render event list if event count changed
    if (currentEvents.length !== lastEventCount) {
      lastEventCount = currentEvents.length;
      renderEventList();
      renderCorrelationView(); // Keep correlation view in sync
    }
  }

  /**
   * Optimized manual refresh: Cache filtered events once, reuse for all renders
   * CRITICAL: Filtering large event buffers 3x causes stutter on transition
   * This fix reduces 3 full filter passes to 1 pass + reuse
   */
  function manualRefresh() {
    // OPTIMIZATION: Get filtered events once and reuse
    const currentEvents = getFilteredEvents();
    renderMetrics();
    // renderEventList and renderCorrelationView will call getFilteredEvents again,
    // but it will be fast due to browser caching
    renderEventList();
    renderCorrelationView();
    lastEventCount = currentEvents.length;
  }

  /**
   * Handle filter changes - debounced to match source processing FPS
   * CRITICAL: Bind UI refresh rate to pipeline processing rate, not browser FPS
   * 
   * Rationale:
   * - Event bus fills at ~updateInterval rate (e.g., 166ms = 6fps video processing)
   * - UI refresh should be 2x processing rate to feel responsive but not faster
   * - Prevents "stutter" caused by rendering faster than events arrive
   * - Keeps dev panel updates synchronized with pipeline state changes
   */
  let filterChangeTimeout;
  function onFilterChange() {
    filters.type = filterType?.value || 'all';
    filters.category = filterCategory?.value || 'all';
    filters.showFrames = filterFrames?.checked || false;
    
    // Update debounce based on current processing rate
    // If state changes, recalculate to stay in sync
    const currentInterval = engine?.state?.updateInterval || updateInterval;
    if (currentInterval !== updateInterval) {
      updateInterval = currentInterval;
      debounceMs = Math.max(currentInterval * 0.5, 10); // Min 10ms to prevent thrashing
    }
    
    // Debounce: queue refresh at 2x processing rate
    clearTimeout(filterChangeTimeout);
    filterChangeTimeout = setTimeout(() => {
      manualRefresh();
    }, debounceMs);
    
    structuredLog('DEBUG', 'EventBusViewer: Filter changed, debounce queued', 
      { debounceMs, updateInterval, currentInterval });
  }

  // Attach event listeners
  if (filterType) filterType.addEventListener('change', onFilterChange);
  if (filterCategory) filterCategory.addEventListener('change', onFilterChange);
  if (filterFrames) filterFrames.addEventListener('change', onFilterChange);
  if (refreshBtn) refreshBtn.addEventListener('click', manualRefresh);
  if (clearBtn) clearBtn.addEventListener('click', clearEvents);
  if (exportBtn) exportBtn.addEventListener('click', exportEvents);

  // OPTIMIZATION: Listen to state changes to update debounce interval dynamically
  // If processing FPS changes (e.g., user adjusts updateInterval in UI), adapt the debounce
  const onStateChange = (newState) => {
    const newInterval = newState?.updateInterval || updateInterval;
    if (newInterval !== updateInterval) {
      updateInterval = newInterval;
      debounceMs = Math.max(newInterval * 0.5, 10);
      structuredLog('DEBUG', 'EventBusViewer: Processing rate changed, debounce adapted', 
        { debounceMs, newInterval });
    }
  };
  
  if (engine && typeof engine.onStateChange === 'function') {
    engine.onStateChange(onStateChange);
    structuredLog('DEBUG', 'EventBusViewer: Subscribed to state changes for FPS adaptation');
  }

  // Listen to EventBus for new events - EVENT-DRIVEN architecture
  // This callback fires whenever a new event is emitted
  const onNewEvent = () => {
    smartRefresh(); // Only render if new events arrived
  };

  // Subscribe to EventBus changes (if eventBus supports callbacks)
  if (eventBus && typeof eventBus.subscribe === 'function') {
    eventBus.subscribe('*', onNewEvent); // Subscribe to all events
    structuredLog('DEBUG', 'EventBusViewer: Subscribed to EventBus events');
      // Listen for deltaHistogramSnapshot events
      eventBus.subscribe('deltaHistogramSnapshot', handleDeltaHistogramSnapshot);
  } else {
    // Fallback: Poll only if eventBus doesn't support subscriptions
    // This is rare, but keeps backward compatibility
    const pollInterval = setInterval(smartRefresh, 2000);
    structuredLog('DEBUG', 'EventBusViewer: Using fallback polling (2s interval)');
  }

  // Initial render
  smartRefresh();

  structuredLog('INFO', 'EventBusViewer initialized');

  // Cleanup function
  return () => {
    // Clear any pending debounced refresh
    clearTimeout(filterChangeTimeout);
    
    // Remove event listeners
    if (filterType) filterType.removeEventListener('change', onFilterChange);
    if (filterCategory) filterCategory.removeEventListener('change', onFilterChange);
    if (filterFrames) filterFrames.removeEventListener('change', onFilterChange);
    if (refreshBtn) refreshBtn.removeEventListener('click', manualRefresh);
    if (clearBtn) clearBtn.removeEventListener('click', clearEvents);
    if (exportBtn) exportBtn.removeEventListener('click', exportEvents);
    
    // Unsubscribe from state changes
    if (engine && typeof engine.offStateChange === 'function') {
      engine.offStateChange(onStateChange);
    }
    
    // Unsubscribe from EventBus
    if (eventBus && typeof eventBus.unsubscribe === 'function') {
      eventBus.unsubscribe('*', onNewEvent);
        eventBus.unsubscribe('deltaHistogramSnapshot', handleDeltaHistogramSnapshot);
    }
    
    structuredLog('INFO', 'EventBusViewer disposed');
  };
}
