// File: web/ui/dev-panel/dev-panel-layout.js
// Manages responsive layout with proper cleanup to prevent memory leaks.
// Uses content-driven breakpoints (not device-class assumptions).

/**
 * Content-driven breakpoint: 900px is when right-edge overlay has comfortable width
 * - Wide viewports (≥900px): Right-edge overlay (400px wide × 100vh tall)
 * - Narrow viewports (<900px): Bottom-edge overlay (full width × 45vh tall)
 *  R221125vp please explain the rationale in the px selected, e.g. is it generic or is it based on our GUI?
 */
const COMFORTABLE_OVERLAY_WIDTH = 900;

export function applyLayoutAndBehaviors({ panel, DOM }) {
  const listeners = []; // Track for cleanup
  
  function applyResponsiveLayout() {
    try {
      // Use content-driven breakpoint, not device-class orientation detection
      const availableWidth = panel.parentElement?.clientWidth || window.innerWidth;
      
      if (availableWidth >= COMFORTABLE_OVERLAY_WIDTH) {
        // Right-edge overlay for wide viewports
        Object.assign(panel.style, {
          position: 'fixed',
          right: '0',
          top: '0',
          width: 'min(400px, 35vw)',
          height: '100vh',
          left: 'auto',
          bottom: 'auto',
          borderLeft: '2px solid #34495e',
          borderTop: '',
          borderRadius: '0'
        });
      } else {
        // Bottom-edge overlay for narrow viewports
        Object.assign(panel.style, {
          position: 'fixed',
          left: '8px',
          right: '8px',
          bottom: '8px',
          top: 'auto',
          width: 'calc(100% - 16px)',
          height: 'min(80vh, clamp(300px, 50vh, 600px))',
          borderLeft: 'none',
          borderTop: '2px solid #34495e',
          borderRadius: '8px'
        });
      }
    } catch (e) {
      console.error('[dev-panel-layout] Error applying responsive layout:', e);
    }
  }

  // Ensure z-index hierarchy (video < panel)
  (function ensureVideoOnTop() {
    try {
      const videoEl = DOM.videoFeed || document.querySelector('video');
      if (videoEl && !videoEl.style.zIndex) {
        videoEl.style.position = 'relative';
        videoEl.style.zIndex = '50';
      }
      panel.style.zIndex = '1000';
    } catch (e) {
      console.error('[dev-panel-layout] Error setting z-index:', e);
    }
  })();

  // Apply initial layout
  applyResponsiveLayout();
  
  // Track event listeners for cleanup
  listeners.push(['resize', applyResponsiveLayout, { passive: true }]);
  listeners.push(['orientationchange', applyResponsiveLayout, { passive: true }]);
  
  // Register listeners
  listeners.forEach(([event, fn, opts]) => {
    window.addEventListener(event, fn, opts);
  });
  
  // Return dispose function (fixes memory leak)
  return function dispose() {
    listeners.forEach(([event, fn, opts]) => {
      window.removeEventListener(event, fn, opts);
    });
  };
}
