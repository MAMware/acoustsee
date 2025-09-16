// File: web/ui/debug/debug-ui.behavior.js
// Handles the visual behavior of the debug panel, including its layout and positioning.

export function initializeDebugUIBehavior({ panel, DOM }) {
  // Responsive layout: landscape => panel right and video left; portrait => bottom sheet
  // --- Responsive Layout ---
  function applyResponsiveLayout() {
    try {
      const isLandscape = window.innerWidth > window.innerHeight;
      if (isLandscape) {
        Object.assign(panel.style, { position: 'fixed', right: '0', top: '0', width: '400px', height: '100vh', left: 'auto', bottom: 'auto', borderLeft: '2px solid #34495e', borderTop: '', borderRadius: '0' });
      } else {
        Object.assign(panel.style, { position: 'fixed', left: '8px', right: '8px', bottom: '8px', top: 'auto', width: 'calc(100% - 16px)', height: '45vh', borderLeft: 'none', borderTop: '2px solid #34495e', borderRadius: '8px' });
      }
    } catch (e) {}
  }

  // --- Z-Index Management ---
  (function ensureVideoOnTop() {
    try {
      const videoEl = DOM.videoFeed || document.querySelector('video');
      if (videoEl && !videoEl.style.zIndex) {
        videoEl.style.position = 'relative';
        videoEl.style.zIndex = '50';
      }
      panel.style.zIndex = '1000'; // Ensure panel is always on top
    } catch(e) {}
  })();

  applyResponsiveLayout();
  window.addEventListener('resize', applyResponsiveLayout, { passive: true });
  window.addEventListener('orientationchange', applyResponsiveLayout, { passive: true });
}
