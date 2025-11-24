/**
 * floating-export-btn.js
 *
 * Persistent floating export button for early logs.
 * 
 * Features:
 * - Always visible, even if dev panel fails
 * - Floating overlay (always-on-top)
 * - Minimizable/toggleable
 * - Works regardless of app state
 * - Non-intrusive, positioned in corner
 * - Smooth animations
 * - Accessible (keyboard + screen reader)
 * - Resilient to failures
 *
 * Phase 2A Task 2.2 Enhancement
 */

/**
 * Create and manage a floating export button overlay
 * @param {Object} earlyLogsModule - The early-logs.js module exports
 * @returns {Promise<{show: Function, hide: Function, dispose: Function}>}
 */
export async function createFloatingExportButton(earlyLogsModule) {
  const { downloadEarlyLogsAsJson, getEarlyLogsSummary } = earlyLogsModule;

  // Create container for floating button
  const container = document.createElement('div');
  container.id = 'floating-export-container';
  container.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    z-index: 999999;
    user-select: none;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', sans-serif;
  `;

  // Create main button
  const button = document.createElement('button');
  button.id = 'floating-export-btn';
  button.className = 'floating-export-btn';
  button.type = 'button';
  button.title = 'Export early logs (available anytime)';
  button.setAttribute('aria-label', 'Export early logs');
  button.setAttribute('aria-pressed', 'false');

  button.style.cssText = `
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background-color: #2196F3;
    color: white;
    border: none;
    border-radius: 50px;
    cursor: pointer;
    font-size: 14px;
    font-weight: 500;
    box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
    transition: all 0.2s ease;
    white-space: nowrap;
  `;

  button.innerHTML = `
    <span style="font-size: 1.2rem;">📥</span>
    <span class="export-btn-text">Export Logs</span>
  `;

  // Create collapsed version (small icon only)
  const collapsedButton = document.createElement('button');
  collapsedButton.id = 'floating-export-collapsed';
  collapsedButton.type = 'button';
  collapsedButton.title = 'Export logs (collapsed)';
  collapsedButton.setAttribute('aria-label', 'Show export logs button');
  collapsedButton.style.cssText = `
    display: none;
    width: 50px;
    height: 50px;
    padding: 0;
    background-color: #2196F3;
    color: white;
    border: none;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.5rem;
    box-shadow: 0 4px 12px rgba(33, 150, 243, 0.4);
    transition: all 0.2s ease;
    align-items: center;
    justify-content: center;
  `;
  collapsedButton.innerHTML = '📥';

  // Create tooltip
  const tooltip = document.createElement('div');
  tooltip.style.cssText = `
    position: absolute;
    bottom: 100%;
    right: 0;
    margin-bottom: 10px;
    padding: 8px 12px;
    background-color: rgba(0, 0, 0, 0.8);
    color: white;
    border-radius: 4px;
    font-size: 12px;
    white-space: nowrap;
    opacity: 0;
    pointer-events: none;
    transition: opacity 0.2s ease;
    text-align: center;
  `;

  // State management
  let isExporting = false;
  let isCollapsed = false;

  /**
   * Toggle between expanded and collapsed states
   */
  function toggleCollapse() {
    isCollapsed = !isCollapsed;
    if (isCollapsed) {
      button.style.display = 'none';
      collapsedButton.style.display = 'flex';
      tooltip.textContent = 'Click to expand';
    } else {
      button.style.display = 'flex';
      collapsedButton.style.display = 'none';
      tooltip.textContent = '';
    }
  }

  /**
   * Handle export button click
   */
  async function handleExport(evt) {
    evt.preventDefault();
    evt.stopPropagation();

    if (isExporting) return;

    try {
      isExporting = true;
      const originalText = button.querySelector('.export-btn-text').textContent;
      const originalIcon = button.querySelector('span:first-child').textContent;

      // Show loading state
      button.disabled = true;
      button.style.opacity = '0.6';
      button.querySelector('.export-btn-text').textContent = 'Exporting...';
      button.querySelector('span:first-child').textContent = '⏳';

      // Get summary for user feedback
      try {
        const summary = await getEarlyLogsSummary();
        structuredLog('DEBUG', 'Export summary', {
          total: summary.total,
          INFO: summary.INFO || 0,
          DEBUG: summary.DEBUG || 0,
          WARN: summary.WARN || 0,
          ERROR: summary.ERROR || 0
        });
      } catch (e) {
        structuredLog('WARN', 'Could not get early logs summary', { error: e.message });
      }

      // Perform export
      await downloadEarlyLogsAsJson();

      // Show success state
      button.querySelector('.export-btn-text').textContent = '✓ Exported';
      button.querySelector('span:first-child').textContent = '✅';
      button.style.opacity = '1';

      // Revert after 2 seconds
      await new Promise(resolve => setTimeout(resolve, 2000));
      button.querySelector('.export-btn-text').textContent = originalText;
      button.querySelector('span:first-child').textContent = originalIcon;

    } catch (error) {
      structuredLog('ERROR', 'Export failed', { error: error.message });
      button.querySelector('.export-btn-text').textContent = 'Export Failed';
      button.style.opacity = '1';

      // Revert after 3 seconds
      await new Promise(resolve => setTimeout(resolve, 3000));
      button.querySelector('.export-btn-text').textContent = 'Export Logs';
      button.querySelector('span:first-child').textContent = '📥';

    } finally {
      button.disabled = false;
      isExporting = false;
    }
  }

  /**
   * Add hover effects
   */
  function setupHoverEffects() {
    button.addEventListener('mouseenter', () => {
      if (!isExporting) {
        button.style.backgroundColor = '#1976D2';
        button.style.transform = 'scale(1.05)';
        button.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.5)';
      }
      tooltip.style.opacity = '1';
    });

    button.addEventListener('mouseleave', () => {
      button.style.backgroundColor = '#2196F3';
      button.style.transform = 'scale(1)';
      button.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.4)';
      tooltip.style.opacity = '0';
    });

    collapsedButton.addEventListener('mouseenter', () => {
      if (!isExporting) {
        collapsedButton.style.backgroundColor = '#1976D2';
        collapsedButton.style.transform = 'scale(1.1)';
        collapsedButton.style.boxShadow = '0 6px 16px rgba(33, 150, 243, 0.5)';
      }
      tooltip.style.opacity = '1';
    });

    collapsedButton.addEventListener('mouseleave', () => {
      collapsedButton.style.backgroundColor = '#2196F3';
      collapsedButton.style.transform = 'scale(1)';
      collapsedButton.style.boxShadow = '0 4px 12px rgba(33, 150, 243, 0.4)';
      tooltip.style.opacity = '0';
    });
  }

  /**
   * Setup keyboard support
   */
  function setupKeyboard() {
    button.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        handleExport(evt);
      }
      if (evt.key === 'Escape') {
        toggleCollapse();
      }
    });

    collapsedButton.addEventListener('keydown', (evt) => {
      if (evt.key === 'Enter' || evt.key === ' ') {
        evt.preventDefault();
        toggleCollapse();
      }
    });
  }

  // Assemble floating button
  button.addEventListener('click', handleExport);
  collapsedButton.addEventListener('click', toggleCollapse);
  setupHoverEffects();
  setupKeyboard();

  // Add tooltip and buttons to container
  button.style.position = 'relative';
  button.appendChild(tooltip);
  container.appendChild(button);
  container.appendChild(collapsedButton);

  // Add to document
  document.body.appendChild(container);

  // Log creation
  structuredLog('DEBUG', 'Floating export button created', {
    id: 'floating-export-container',
    zIndex: 999999,
    position: 'bottom-right'
  });

  /**
   * Public API
   */
  return {
    /**
     * Show the floating button
     */
    show() {
      container.style.display = 'block';
    },

    /**
     * Hide the floating button
     */
    hide() {
      container.style.display = 'none';
    },

    /**
     * Toggle collapse state
     */
    toggle() {
      toggleCollapse();
    },

    /**
     * Cleanup
     */
    dispose() {
      button.removeEventListener('click', handleExport);
      collapsedButton.removeEventListener('click', toggleCollapse);
      container.remove();
      structuredLog('DEBUG', 'Floating export button disposed');
    }
  };
}

/**
 * Initialize floating export button with error handling
 * @param {Object} engine - The engine instance
 * @param {Object} DOM - The DOM cache
 * @returns {Promise<Object>} - API with show/hide/dispose
 */
export async function initializeFloatingExportButton(engine, DOM) {
  try {
    // Dynamically import early-logs module
    const earlyLogsModule = await import('./early-logs.js');

    // Create floating button
    const floatingBtn = await createFloatingExportButton(earlyLogsModule);

    // Initially show the button
    floatingBtn.show();

    structuredLog('INFO', 'Floating export button initialized', {
      type: 'persistent-overlay',
      always_on_top: true,
      works_offline: true
    });

    return floatingBtn;

  } catch (error) {
    structuredLog('ERROR', 'Failed to initialize floating export button', {
      error: error.message,
      code: 'FLOATING_BTN_INIT_FAILED'
    });
    // Return empty API so code doesn't crash
    return {
      show: () => { },
      hide: () => { },
      toggle: () => { },
      dispose: () => { }
    };
  }
}

/**
 * Import structuredLog for consistent logging
 */
import { structuredLog } from './logging.js';
