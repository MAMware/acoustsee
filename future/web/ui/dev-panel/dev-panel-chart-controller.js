import { structuredLog } from '../../utils/logging.js';

/**
 * Initializes the worker performance chart controller.
 * 
 * @param {HTMLElement} panel - The dev panel root element
 * @param {Object} engine - The engine instance with onStateChange method
 * @returns {Object} Object with start(), stop(), and dispose() methods
 */
export async function initializeChartController(panel, engine) {
  try {
    const workerCanvas = panel.querySelector('#worker-explorer-canvas');
    const legendEl = panel.querySelector('#worker-explorer-legend');

    if (!workerCanvas || !legendEl) {
      return {
        start: () => {},
        stop: () => {},
        dispose: () => {}
      };
    }

    // Dynamic import of chart utilities
    const { RingBuffer, scaleCanvasForDPR, drawMultiSparkline } = (await import('./worker-charts.js'));
    const workerDataBuffers = new Map();
    scaleCanvasForDPR(workerCanvas);

    let workerChartRenderLoopId = null;
    let lastRenderTime = 0;
    let visibilityHandler = null;
    let stateChangeUnsubscribe = null;

    /**
     * Renders the worker charts by fetching stats and drawing the sparklines
     */
    const renderCharts = () => {
      if (!window.__acoustseeDevPanelGetWorkerStats) return;
      const stats = window.__acoustseeDevPanelGetWorkerStats();
      
      // Include aggregated stats from video worker
      if (window.__acoustseeWorkerStats) {
        window.__acoustseeWorkerStats.forEach((stat, id) => stats.push(stat));
      }
      
      const seriesMap = new Map();
      let legendHTML = '';
      
      stats.forEach((workerStat, i) => {
        if (!workerDataBuffers.has(workerStat.id)) {
          workerDataBuffers.set(workerStat.id, new RingBuffer(64));
        }
        const buffer = workerDataBuffers.get(workerStat.id);
        buffer.push(workerStat.last ? workerStat.last.util : 0);
        seriesMap.set(workerStat.id, buffer.toArray());
        const color = `hsl(${(i * 137) % 360}, 72%, 58%)`;
        legendHTML += `<span style="color: ${color}; margin-right: 10px;">■ ${workerStat.name || workerStat.id}</span>`;
      });
      
      if (legendEl) legendEl.innerHTML = legendHTML;
      drawMultiSparkline(workerCanvas, seriesMap);
    };

    /**
     * Rendering loop using requestAnimationFrame (limited to ~4 FPS)
     */
    const renderLoop = (timestamp) => {
      // Limit rendering to ~4 FPS (once every 250ms)
      if (timestamp - lastRenderTime >= 250) {
        lastRenderTime = timestamp;
        renderCharts();
      }
      // Continue the loop
      workerChartRenderLoopId = requestAnimationFrame(renderLoop);
    };

    /**
     * Starts the chart rendering loop
     */
    const startChart = () => {
      if (workerChartRenderLoopId === null) {
        lastRenderTime = performance.now();
        workerChartRenderLoopId = requestAnimationFrame(renderLoop);
        try { panel.__workerChartRAFId = workerChartRenderLoopId; } catch (e) {
          structuredLog('WARN', 'Chart Controller: Failed to store RAF ID', { error: e?.message || String(e) });
        }
      }
    };

    /**
     * Stops the chart rendering loop
     */
    const stopChart = () => {
      if (workerChartRenderLoopId !== null) {
        try { cancelAnimationFrame(workerChartRenderLoopId); } catch (e) {
          structuredLog('WARN', 'Chart Controller: Failed to cancel animation frame', { 
            rafId: workerChartRenderLoopId, 
            error: e?.message || String(e) 
          });
        }
        workerChartRenderLoopId = null;
        try { panel.__workerChartRAFId = null; } catch (e) {
          structuredLog('WARN', 'Chart Controller: Failed to clear RAF ID', { error: e?.message || String(e) });
        }
      }
    };

    // Set up Page Visibility API to pause chart when hidden
    visibilityHandler = () => {
      const workerSection = panel.querySelector('#worker-explorer-container');
      if (!workerSection) return;

      if (document.hidden) {
        stopChart();
      } else if (!workerSection.classList.contains('collapsed')) {
        // Only restart if it was supposed to be running
        startChart();
      }
    };
    document.addEventListener('visibilitychange', visibilityHandler);

    // Subscribe to engine state changes to auto-start/stop based on isProcessing
    if (engine.onStateChange) {
      const onStateChangeCb = (state) => {
        const workerSection = panel.querySelector('#worker-explorer-container');
        if (workerSection && !workerSection.classList.contains('collapsed')) {
          if (state.isProcessing && workerChartRenderLoopId === null) {
            // Processing started and chart isn't running - start it
            startChart();
          } else if (!state.isProcessing && workerChartRenderLoopId !== null) {
            // Processing stopped - stop chart
            stopChart();
          }
        }
      };
      const maybeUnsub = engine.onStateChange(onStateChangeCb);
      if (typeof maybeUnsub === 'function') {
        stateChangeUnsubscribe = maybeUnsub;
      }
    }

    // Auto-start chart if worker section is visible on initial load
    const workerSection = panel.querySelector('#worker-explorer-container');
    if (workerSection && !workerSection.classList.contains('collapsed')) {
      // Add a small delay to ensure workers are registered and data is available
      setTimeout(() => {
        startChart();
      }, 500);
    }

    // Return public API
    return {
      start: startChart,
      stop: stopChart,
      dispose() {
        stopChart();
        
        // Remove visibility listener
        if (visibilityHandler) {
          try {
            document.removeEventListener('visibilitychange', visibilityHandler);
          } catch (e) {
            structuredLog('WARN', 'Chart Controller: Failed to remove visibility listener', { 
              error: e?.message || String(e) 
            });
          }
        }
        
        // Unsubscribe from state changes
        if (stateChangeUnsubscribe && typeof stateChangeUnsubscribe === 'function') {
          try {
            stateChangeUnsubscribe();
          } catch (e) {
            structuredLog('WARN', 'Chart Controller: Failed to unsubscribe from state changes', { 
              error: e?.message || String(e) 
            });
          }
        }
        
        // Clear data buffers
        workerDataBuffers.clear();
        
        structuredLog('DEBUG', 'Chart Controller: Disposed successfully');
      }
    };

  } catch (e) {
    structuredLog('ERROR', 'Chart Controller: Initialization failed', { error: e?.message || String(e) });
    return {
      start: () => {},
      stop: () => {},
      dispose: () => {}
    };
  }
}
