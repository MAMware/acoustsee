/**
 * orchestration-inspector.js
 * 
 * OrchestrationInspector UI Component - displays real-time orchestration state
 * to developers in the dev panel.
 * 
 * Part of Phase 2A: Orchestration Visibility (Week 2)
 * Purpose: Visual display of orchestration metrics, capabilities, and decisions
 * 
 * This module follows the AcoustSee UI pattern:
 * - Exports an initializer function for registration
 * - Returns a dispose() function for cleanup
 * - Uses dependency injection (engine, DOM)
 * - Manages state via engine.onStateChange()
 * - No external npm dependencies
 */

import { structuredLog } from '../utils/logging.js';

/**
 * Initializes the OrchestrationInspector UI component
 * 
 * @param {Object} engine - Command bus with dispatch, getState, onStateChange
 * @param {Object} DOM - DOM cache (uiPanelRoot, etc.)
 * @param {Object} options - Configuration options
 * @returns {Object} { dispose() } - cleanup function
 */
export function initializeOrchestrationInspector(engine, DOM, options = {}) {
  // Validate dependencies
  if (!engine || typeof engine.getState !== 'function') {
    structuredLog('ERROR', 'orchestration-inspector', { message: 'Engine missing getState' });
    return { dispose: () => {} };
  }
  
  if (!engine.onStateChange || typeof engine.onStateChange !== 'function') {
    structuredLog('WARN', 'orchestration-inspector', { message: 'Engine missing onStateChange' });
  }
  
  // Create container
  const container = document.createElement('div');
  container.id = 'orchestration-inspector-container';
  container.className = 'orchestration-inspector';
  
  // Load CSS
  const cssLink = document.createElement('link');
  cssLink.rel = 'stylesheet';
  cssLink.href = new URL('./orchestration-inspector.css', import.meta.url).href;
  cssLink.onload = () => {
    structuredLog('DEBUG', 'orchestration-inspector', { message: 'CSS loaded' });
  };
  document.head.appendChild(cssLink);
  
  // Initialize state
  let currentOrchestrationState = null;
  let unsubscribeStateChange = null;
  
  /**
   * Updates the UI based on orchestration and metrics data from selectors
   * ADR-0011: Use engine selectors to avoid Law of Demeter violations
   */
  function updateUI() {
    // Try to get orchestration/metrics from engine methods, fallback to safe defaults
    let orchestration = null;
    let metrics = null;
    
    try {
      if (typeof engine.getOrchestration === 'function') {
        orchestration = engine.getOrchestration();
      }
    } catch (err) {
      structuredLog('DEBUG', 'orchestration-inspector', { message: 'getOrchestration() unavailable', error: err?.message });
    }
    
    try {
      if (typeof engine.getMetrics === 'function') {
        metrics = engine.getMetrics();
      }
    } catch (err) {
      structuredLog('DEBUG', 'orchestration-inspector', { message: 'getMetrics() unavailable', error: err?.message });
    }
    
    // If neither method is available, provide a minimal placeholder
    if (!orchestration && !metrics) {
      container.innerHTML = `
        <div style="color: #95a5a6; font-size: 12px; padding: 12px; background: #ecf0f1; border-radius: 4px; text-align: center;">
          <strong>Orchestration Inspector</strong><br>
          <span style="font-size: 11px;">Waiting for orchestration data...</span>
        </div>
      `;
      return;
    }
    
    // Store for export functionality
    currentOrchestrationState = { ...orchestration, metrics };
    
    // Build the HTML structure
    container.innerHTML = buildInspectorHTML(orchestration, metrics);
    
    // Wire event listeners after rendering
    wireEventListeners();
  }
  
  /**
   * Builds the complete inspector HTML
   * ADR-0011: Accepts selector results, not raw state
   */
  function buildInspectorHTML(orchestration, metrics) {
    return `
      <a href="#orchestration-main-content" class="orch-skip-link">Skip to main content</a>
      <div class="orch-inspector" role="region" aria-label="Orchestration Inspector">
        <!-- Header -->
        <div class="orch-header">
          <h3 class="orch-title" id="orchestration-title">🎵 Orchestration Visibility</h3>
          <div class="orch-header-buttons" role="toolbar" aria-label="Inspector controls">
            <button 
              class="orch-btn orch-btn-refresh" 
              aria-label="Refresh metrics" 
              title="Refresh metrics (R)"
              tabindex="0"
            >⟳</button>
            <button 
              class="orch-btn orch-btn-export" 
              aria-label="Export metrics as JSON" 
              title="Export metrics as JSON (E)"
              tabindex="0"
            >↓</button>
            <button 
              class="orch-btn orch-btn-toggle" 
              aria-label="Minimize inspector" 
              title="Minimize inspector (M)"
              aria-expanded="true"
              aria-controls="orchestration-content"
              tabindex="0"
            >−</button>
          </div>
        </div>
        
        <div id="orchestration-main-content">
          <!-- Active Extractor Section -->
          <section class="orch-section" aria-labelledby="extractor-heading">
            <h4 class="orch-section-title" id="extractor-heading">ACTIVE EXTRACTOR</h4>
            <div class="orch-extractor-display">
              ${buildExtractorIndicator(orchestration.activeExtractor, orchestration.capabilities)}
            </div>
          </section>
          
          <!-- Capabilities Matrix -->
          <section class="orch-section" aria-labelledby="capabilities-heading">
            <h4 class="orch-section-title" id="capabilities-heading">BROWSER CAPABILITIES</h4>
            <div class="orch-capabilities-grid" role="list">
              ${buildCapabilitiesGrid(orchestration.capabilities)}
            </div>
          </section>
          
          <!-- Real-Time Metrics -->
          <section class="orch-section" aria-labelledby="metrics-heading">
            <h4 class="orch-section-title" id="metrics-heading">REAL-TIME METRICS</h4>
            <div class="orch-metrics-display">
              ${buildMetricsDisplay(metrics)}
            </div>
          </section>
          
          <!-- Utilization Bars -->
          <section class="orch-section orch-utilization" aria-labelledby="utilization-heading">
            <h4 class="orch-section-title" id="utilization-heading">UTILIZATION</h4>
            <div class="orch-util-bars">
              ${buildUtilizationBars(metrics)}
            </div>
          </section>
          
          <!-- Decision Log -->
          <section class="orch-section orch-log-section" aria-labelledby="log-heading">
            <h4 class="orch-section-title" id="log-heading">DECISION LOG (Last 5 Events)</h4>
            <div class="orch-decision-log" role="log" aria-live="polite" aria-label="Decision log">
              ${buildDecisionLog(orchestration.decisionLog)}
            </div>
          </section>
          
          <!-- Video Worker Debug Config (Phase 2A Debug Feature) -->
          ${buildVideoWorkerDebugConfig(orchestration.videoWorkerDebugConfig)}
          
          <!-- Current Mode -->
          <footer class="orch-section orch-mode-footer" aria-label="Current system state">
            <div class="orch-mode-item">
              <span class="orch-label">Mode:</span>
              <span class="orch-value" aria-label="Current mode">${orchestration.currentMode || 'unknown'}</span>
            </div>
            <div class="orch-mode-item">
              <span class="orch-label">Memory:</span>
              <span class="orch-value" aria-label="Memory usage">${metrics.memoryUsageMB.toFixed(1)} MB</span>
            </div>
          </footer>
        </div>
      </div>
    `;
  }
  
  /**
   * Builds the active extractor indicator
   */
  function buildExtractorIndicator(activeExtractor, capabilities) {
    const isActive = activeExtractor !== null && activeExtractor !== undefined;
    const statusClass = isActive ? 'orch-status-active' : 'orch-status-inactive';
    const statusIcon = isActive ? '✓' : '✗';
    
    let displayName = 'None';
    let description = 'No extractor active';
    
    if (activeExtractor === 'mediaStreamTrackProcessor') {
      displayName = 'mediaStreamTrackProcessor';
      description = 'GPU-accelerated frame extraction';
    } else if (activeExtractor === 'canvasFallback') {
      displayName = 'Canvas 2D Fallback';
      description = 'CPU-based frame extraction';
    }
    
    return `
      <div class="orch-extractor-item ${statusClass}">
        <span class="orch-status-icon">${statusIcon}</span>
        <div class="orch-extractor-info">
          <div class="orch-extractor-name">${displayName}</div>
          <div class="orch-extractor-desc">${description}</div>
        </div>
      </div>
    `;
  }
  
  /**
   * Builds the capabilities grid (6 capabilities)
   */
  function buildCapabilitiesGrid(capabilities) {
    const capList = [
      { key: 'mediaStreamTrackProcessor', label: 'MSTP' },
      { key: 'canvas2D', label: 'Canvas 2D' },
      { key: 'webGL', label: 'WebGL' },
      { key: 'webGPU', label: 'WebGPU' },
      { key: 'offscreenCanvas', label: 'Offscreen' },
      { key: 'wasm', label: 'WebAssembly' }
    ];
    
    return capList.map(({ key, label }) => {
      const available = capabilities?.[key] || false;
      const className = available ? 'orch-cap-available' : 'orch-cap-unavailable';
      const icon = available ? '✓' : '✗';
      const statusText = available ? 'available' : 'unavailable';
      return `
        <div 
          class="orch-capability ${className}" 
          role="listitem"
          aria-label="${label}: ${statusText}"
          title="${label}: ${statusText}"
        >
          <span class="orch-cap-icon" aria-hidden="true">${icon}</span>
          <span class="orch-cap-label">${label}</span>
        </div>
      `;
    }).join('');
  }
  
  /**
   * Builds the metrics display table
   */
  function buildMetricsDisplay(metrics) {
    if (!metrics) {
      return '<div class="orch-metrics-empty">No metrics available</div>';
    }
    
    const m = metrics;
    
    return `
      <div class="orch-metrics-table">
        <div class="orch-metric-row">
          <span class="orch-metric-label">FPS:</span>
          <span class="orch-metric-value">${(m.fps || 0).toFixed(1)} fps</span>
        </div>
        <div class="orch-metric-row">
          <span class="orch-metric-label">Extraction:</span>
          <span class="orch-metric-value">${(m.frameExtractionTimeMs || 0).toFixed(2)} ms</span>
        </div>
        <div class="orch-metric-row">
          <span class="orch-metric-label">Mapping:</span>
          <span class="orch-metric-value">${(m.gridMappingTimeMs || 0).toFixed(2)} ms</span>
        </div>
        <div class="orch-metric-row">
          <span class="orch-metric-label">Processing:</span>
          <span class="orch-metric-value">${(m.audioProcessingTimeMs || 0).toFixed(2)} ms</span>
        </div>
        <div class="orch-metric-row">
          <span class="orch-metric-label">Total Cycle:</span>
          <span class="orch-metric-value">${(m.totalCycleTimeMs || 0).toFixed(2)} ms</span>
        </div>
        <div class="orch-metric-row">
          <span class="orch-metric-label">Resolution:</span>
          <span class="orch-metric-value">${m.resolutionWidth || 0}×${m.resolutionHeight || 0}</span>
        </div>
      </div>
    `;
  }
  
  /**
   * Builds utilization percentage bars
   */
  function buildUtilizationBars(metrics) {
    if (!metrics) return '<div class="orch-util-empty">No utilization data</div>';
    
    const gpuUtil = Math.min(100, Math.max(0, metrics.gpuUtilization || 0));
    const cpuUtil = Math.min(100, Math.max(0, metrics.underutilization || 0));
    
    // Determine color classes based on utilization
    const gpuClass = gpuUtil > 80 ? 'orch-util-high' : gpuUtil > 50 ? 'orch-util-medium' : 'orch-util-low';
    const cpuClass = cpuUtil > 80 ? 'orch-util-high' : cpuUtil > 50 ? 'orch-util-medium' : 'orch-util-low';
    
    return `
      <div class="orch-util-item">
        <label class="orch-util-label">GPU:</label>
        <div class="orch-util-bar-container">
          <div class="orch-util-bar ${gpuClass}" style="width: ${gpuUtil}%"></div>
        </div>
        <span class="orch-util-percent">${gpuUtil.toFixed(0)}%</span>
      </div>
      <div class="orch-util-item">
        <label class="orch-util-label">CPU Idle:</label>
        <div class="orch-util-bar-container">
          <div class="orch-util-bar ${cpuClass}" style="width: ${cpuUtil}%"></div>
        </div>
        <span class="orch-util-percent">${cpuUtil.toFixed(0)}%</span>
      </div>
    `;
  }
  
  /**
   * Builds the video worker debug config display (Phase 2A debug feature)
   * Shows which video workers are currently enabled/disabled for A/B testing
   */
  function buildVideoWorkerDebugConfig(debugConfig) {
    if (!debugConfig || typeof debugConfig !== 'object' || Object.keys(debugConfig).length === 0) {
      return ''; // Don't show section if no debug config
    }
    
    const workers = [
      { key: 'fast-motion-worker', label: 'Fast Motion Worker' },
      { key: 'fast-grid-aggregator', label: 'Fast Grid Aggregator' },
      { key: 'pan-intensity-mapper', label: 'Pan-Intensity Mapper' }
    ];
    
    return `
      <section class="orch-section orch-debug-section" aria-labelledby="debug-heading">
        <h4 class="orch-section-title" id="debug-heading">VIDEO WORKER DEBUG CONFIG (A/B Testing)</h4>
        <div class="orch-debug-config">
          ${workers.map(({ key, label }) => {
            const enabled = debugConfig[key] !== false; // default true if not explicitly false
            const statusClass = enabled ? 'orch-debug-enabled' : 'orch-debug-disabled';
            const statusIcon = enabled ? '✓' : '✗';
            const statusText = enabled ? 'Enabled' : 'Disabled';
            return `
              <div class="orch-debug-item ${statusClass}" title="${label}: ${statusText}">
                <span class="orch-debug-icon">${statusIcon}</span>
                <span class="orch-debug-label">${label}</span>
              </div>
            `;
          }).join('')}
        </div>
        <p style="font-size: 11px; color: #95a5a6; margin-top: 8px;">
          Use dev panel checkboxes under "Video Worker Filters (Debug)" to toggle workers for A/B testing.
        </p>
      </section>
    `;
  }
  
  /**
   * Builds the decision log (last 5 events)
   */
  function buildDecisionLog(decisionLog) {
    if (!decisionLog || decisionLog.length === 0) {
      return '<div class="orch-log-empty">No decisions logged yet</div>';
    }
    
    // Show last 5 events
    const recentEvents = decisionLog.slice(0, 5);
    
    return `
      <ul class="orch-log-list">
        ${recentEvents.map(event => `
          <li class="orch-log-item">
            <span class="orch-log-event">${event.event || 'Unknown'}</span>
            <span class="orch-log-reason">${event.reason ? `(${event.reason})` : ''}</span>
          </li>
        `).join('')}
      </ul>
    `;
  }
  
  /**
   * Wires up button event listeners
   */
  function wireEventListeners() {
    // Refresh button - force state update
    const refreshBtn = container.querySelector('.orch-btn-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', () => {
        // ADR-0011: Use selectors instead of direct state access
        updateUI();
        structuredLog('DEBUG', 'orchestration-inspector', { message: 'Metrics refreshed' });
      });
    }
    
    // Export button - download metrics as JSON
    const exportBtn = container.querySelector('.orch-btn-export');
    if (exportBtn) {
      exportBtn.addEventListener('click', () => {
        if (currentOrchestrationState) {
          const json = JSON.stringify(currentOrchestrationState, null, 2);
          const blob = new Blob([json], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.href = url;
          link.download = `acoustsee-orchestration-${Date.now()}.json`;
          link.click();
          URL.revokeObjectURL(url);
          structuredLog('DEBUG', 'orchestration-inspector', { message: 'Metrics exported' });
        }
      });
    }
    
    // Toggle button - minimize/expand section
    const toggleBtn = container.querySelector('.orch-btn-toggle');
    if (toggleBtn) {
      let isCollapsed = false;
      toggleBtn.addEventListener('click', () => {
        const mainContent = container.querySelector('#orchestration-main-content');
        
        if (isCollapsed) {
          mainContent.style.display = '';
          toggleBtn.textContent = '−';
          toggleBtn.setAttribute('aria-expanded', 'true');
          isCollapsed = false;
        } else {
          mainContent.style.display = 'none';
          toggleBtn.textContent = '+';
          toggleBtn.setAttribute('aria-expanded', 'false');
          isCollapsed = true;
        }
      });
    }
    
    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      // Don't interfere with text input
      if (e.target.matches('input, textarea')) return;
      
      switch (e.key.toUpperCase()) {
        case 'R':
          if (refreshBtn) {
            refreshBtn.click();
            e.preventDefault();
          }
          break;
        case 'E':
          if (exportBtn) {
            exportBtn.click();
            e.preventDefault();
          }
          break;
        case 'M':
          if (toggleBtn) {
            toggleBtn.click();
            e.preventDefault();
          }
          break;
      }
    });
  }
  
  /**
   * Attaches the container to the DOM
   */
  function attachToDOM() {
    const root = (DOM && DOM.uiPanelRoot) || document.body;
    root.appendChild(container);
    structuredLog('DEBUG', 'orchestration-inspector', { 
      message: 'Container attached to DOM', 
      rootId: root.id,
      containerHasContent: container.innerHTML.length > 0
    });
  }
  
  /**
   * Initial setup and state subscription
   * ADR-0011: Use selectors to access state
   */
  function initialize() {
    try {
      // Eagerly fetch and render orchestration data immediately (v0.9.7.4 pattern)
      // This ensures data appears as soon as dev panel opens
      // updateUI() handles cases where methods don't exist or return null with safe fallbacks
      updateUI();
      
      // Subscribe to state changes for reactive updates
      if (engine.onStateChange) {
        unsubscribeStateChange = engine.onStateChange(() => {
          // ADR-0011: updateUI() now uses selectors internally
          updateUI();
        });
      }
      
      attachToDOM();
      structuredLog('INFO', 'orchestration-inspector', { message: 'Initialized successfully' });
    } catch (error) {
      structuredLog('ERROR', 'orchestration-inspector', { message: 'Initialization failed', error: error.message });
      container.innerHTML = `<div class="orch-error">Failed to initialize: ${error.message}</div>`;
    }
  }
  
  // Start initialization
  initialize();
  
  /**
   * Cleanup and disposal
   */
  return {
    dispose() {
      try {
        // Unsubscribe from state changes
        if (unsubscribeStateChange && typeof unsubscribeStateChange === 'function') {
          unsubscribeStateChange();
        }
        
        // Remove CSS
        if (cssLink && cssLink.parentNode) {
          cssLink.parentNode.removeChild(cssLink);
        }
        
        // Remove from DOM
        if (container && container.parentNode) {
          container.parentNode.removeChild(container);
        }
        
        structuredLog('INFO', 'orchestration-inspector', { message: 'Disposed successfully' });
      } catch (error) {
        structuredLog('WARN', 'orchestration-inspector', { message: 'Dispose error', error: error.message });
      }
    }
  };
}


