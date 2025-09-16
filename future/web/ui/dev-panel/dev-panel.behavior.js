// File: web/ui/dev-panel/dev-panel.behavior.js
// Handles the visual behavior of the dev panel, including its layout and positioning.

export function initializeDevPanelBehavior({ panel, DOM }) {
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

  (function ensureVideoOnTop() {
    try {
      const videoEl = DOM.videoFeed || document.querySelector('video');
      if (videoEl && !videoEl.style.zIndex) {
        videoEl.style.position = 'relative';
        videoEl.style.zIndex = '50';
      }
      panel.style.zIndex = '1000';
    } catch(e) {}
  })();

  applyResponsiveLayout();
  window.addEventListener('resize', applyResponsiveLayout, { passive: true });
  window.addEventListener('orientationchange', applyResponsiveLayout, { passive: true });
}
