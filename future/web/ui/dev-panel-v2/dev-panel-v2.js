/**
 * Dev Panel v2: Phase 1 Telemetry Dashboard
 *
 * A pluggable developer diagnostics UI following the AcoustSee hexagonal architecture.
 * Provides real-time monitoring of:
 * - Camera controls and video source selection
 * - Frame processing telemetry and worker metrics
 * - Audio-video synchronization
 * - Resource utilization (CPU, memory, GPU)
 *
 * Architecture:
 * - Modular structure: Each subsystem (Camera, Telemetry, Charts) is independently initialized
 * - Proper disposal: All event listeners, timers, and DOM elements cleaned up on dispose
 * - No core imports: Communication via engine.dispatch() and engine.onStateChange() only
 * - Responsive design: Mobile-friendly layout with collapsible sections
 *
 * Activation: ?devpanel=v2 or programmatic registration
 *
 * See README.md in this directory for detailed API and patterns.
 */

import { registerComponent } from '../ui-registry.js';
import { structuredLog } from '../../utils/logging.js';
import { initializeCameraControls } from '../dev-panel/camera-controls.js';
import { initializeTelemetryDashboard } from '../dev-panel/telemetry-dashboard.js';
import { initializeChartController } from '../dev-panel/dev-panel-chart-controller.js';

/**
 * ListenerRegistry: Tracks all event listeners for proper cleanup on disposal.
 * Solves the "zombie event listeners" problem where listeners persist across panel toggles.
 */
class ListenerRegistry {
  constructor() {
    this.listeners = [];
  }

  /**
   * Add a listener to an element and track it for cleanup.
   * @param {Element} element - DOM element to attach listener to
   * @param {string} event - Event name (e.g., 'click', 'input', 'change')
   * @param {Function} handler - Event handler function
   * @param {Object} options - Optional addEventListener options
   */
  on(element, event, handler, options = false) {
    if (!element) return;
    element.addEventListener(event, handler, options);
    this.listeners.push({ element, event, handler, options });
  }

  /**
   * Remove all tracked listeners from their elements.
   */
  removeAll() {
    for (const { element, event, handler, options } of this.listeners) {
      try {
        element.removeEventListener(event, handler, options);
      } catch {
        // Silently ignore removal failures
      }
    }
    this.listeners = [];
  }
}

/**
 * Initialize Dev Panel v2
 *
 * Contract: Follows the pluggable UI architecture from ui-registry.js
 * - Input: engine, DOM (or uiContext with standardized properties)
 * - Output: { dispose() } function for cleanup
 * - Mandatory: All listeners and resources cleaned up in dispose()
 *
 * @param {Object} arg1 - Engine instance or UI context
 * @param {Object} arg2 - DOM object (if arg1 is engine)
 * @returns {Object} - { dispose() } function
 */
export function initializeDevPanelV2(arg1, arg2) {
  // Support both signatures for flexibility
  let engine = null;
  let DOM = null;

  if (arg1 && arg1.engine && arg1.DOM) {
    // New: uiContext signature
    engine = arg1.engine;
    DOM = arg1.DOM;
  } else if (arg1 && typeof arg1.getState === 'function') {
    // Legacy: (engine, DOM) signature
    engine = arg1;
    DOM = arg2 || (typeof window !== 'undefined' ? window.DOM : undefined);
  } else {
    console.warn('Dev Panel v2: Invalid initialization parameters');
    return { dispose() {} };
  }

  engine = engine || { dispatch: () => {}, getState: () => ({}), onStateChange: () => {} };
  DOM = DOM || (typeof window !== 'undefined' ? window.DOM : undefined);

  const panel = document.createElement('div');
  panel.id = 'acoustsee-dev-panel-v2';
  const root = (DOM && DOM.uiPanelRoot) || document.body;
  root.appendChild(panel);

  const listenerRegistry = new ListenerRegistry();
  panel.__listenerRegistry = listenerRegistry;

  panel.style.display = 'none';

  // Future configuration options (reserved for extensibility)

  // Return object to hold references to sub-modules for cleanup
  const moduleRefs = {
    cameraControls: null,
    telemetryDashboard: null,
    chartController: null,
  };

  return {
    /**
     * Show the dev panel
     */
    show() {
      panel.style.display = 'block';
      if (panel.classList) panel.classList.remove('hidden');
    },

    /**
     * Hide the dev panel
     */
    hide() {
      panel.style.display = 'none';
      if (panel.classList) panel.classList.add('hidden');
    },

    /**
     * Toggle visibility
     */
    toggle() {
      if (panel.style.display === 'none') {
        this.show();
      } else {
        this.hide();
      }
    },

    /**
     * Clean up all resources
     * MANDATORY: Called when dev panel is being disposed or app is shutting down
     */
    dispose() {
      structuredLog('INFO', 'Disposing Dev Panel v2');

      // Remove all tracked listeners
      try {
        if (panel.__listenerRegistry && typeof panel.__listenerRegistry.removeAll === 'function') {
          panel.__listenerRegistry.removeAll();
        }
      } catch {
        // Silently ignore cleanup errors
      }

      // Dispose camera controls
      try {
        if (moduleRefs.cameraControls && typeof moduleRefs.cameraControls.dispose === 'function') {
          moduleRefs.cameraControls.dispose();
        }
      } catch (e) {
        console.error('Failed to dispose camera controls:', e);
      }

      // Dispose telemetry dashboard
      try {
        if (moduleRefs.telemetryDashboard && typeof moduleRefs.telemetryDashboard.dispose === 'function') {
          moduleRefs.telemetryDashboard.dispose();
        }
      } catch (e) {
        console.error('Failed to dispose telemetry dashboard:', e);
      }

      // Dispose chart controller
      try {
        if (moduleRefs.chartController && typeof moduleRefs.chartController.dispose === 'function') {
          moduleRefs.chartController.dispose();
        }
      } catch (e) {
        console.error('Failed to dispose chart controller:', e);
      }

      // Remove panel from DOM
      try {
        if (panel && panel.parentNode) {
          panel.parentNode.removeChild(panel);
        }
      } catch {
        // Silently ignore cleanup errors
      }

      structuredLog('INFO', 'Dev Panel v2 disposed');
    },

    /**
     * Initialize all Phase 1 components
     * Called automatically during activation
     */
    activate() {
      structuredLog('INFO', 'Activating Dev Panel v2');

      // Load CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = new URL('./dev-panel-v2.css', import.meta.url).href;
      document.head.appendChild(link);

      // Build HTML structure
      panel.innerHTML = `
        <div class="devpanel-v2-container">
          <div class="devpanel-v2-header">
            <h1>Dev Panel v2 - Phase 1 Telemetry</h1>
            <button class="devpanel-v2-close" data-action="close">×</button>
          </div>
          <div class="devpanel-v2-content">
            <div id="devpanel-v2-camera-section" class="devpanel-v2-section">
              <h2>Camera Controls (Workflow 1)</h2>
              <div class="devpanel-v2-controls"></div>
            </div>
            <div id="devpanel-v2-telemetry-section" class="devpanel-v2-section">
              <h2>Telemetry Dashboard (Workflow 3)</h2>
              <div id="telemetry-dashboard-container"></div>
            </div>
            <div id="devpanel-v2-charts-section" class="devpanel-v2-section">
              <h2>Performance Charts</h2>
              <div class="devpanel-v2-charts"></div>
            </div>
          </div>
        </div>
      `;

      // Wire close button
      const closeBtn = panel.querySelector('[data-action="close"]');
      if (closeBtn) {
        listenerRegistry.on(closeBtn, 'click', () => this.hide());
      }

      // Initialize Phase 1 components
      try {
        moduleRefs.cameraControls = initializeCameraControls(engine);
        structuredLog('INFO', 'Camera controls initialized');
      } catch (e) {
        console.error('Failed to initialize camera controls:', e);
      }

      try {
        moduleRefs.telemetryDashboard = initializeTelemetryDashboard(engine);
        structuredLog('INFO', 'Telemetry dashboard initialized');
      } catch (e) {
        console.error('Failed to initialize telemetry dashboard:', e);
      }

      try {
        moduleRefs.chartController = initializeChartController(engine);
        structuredLog('INFO', 'Chart controller initialized');
      } catch (e) {
        console.error('Failed to initialize chart controller:', e);
      }

      this.show();
    },
  };
}

// Register as pluggable component
registerComponent('dev-panel-v2', initializeDevPanelV2);

export default initializeDevPanelV2;
