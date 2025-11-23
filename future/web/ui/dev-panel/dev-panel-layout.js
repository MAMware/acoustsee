// File: web/ui/dev-panel/dev-panel-layout.js
// Manages fullscreen layout for dev panel (primary UI when active).
// No responsive breakpoints needed - panel is always fullscreen.
//
// Architecture:
// - Dev panel becomes the main UI when active (fullscreen, 100% width/height)
// - Live Video Preview section shows processed output (engine canvas)
// - Proper cleanup of event listeners prevents memory leaks

export function applyLayoutAndBehaviors({ panel, DOM }) {
  try {
    // Dev panel is fullscreen when active - replaces main UI
    // No responsive breakpoints needed (always 100% × 100%)
    Object.assign(panel.style, {
      position: 'fixed',
      top: '0',
      left: '0',
      width: '100%',
      height: '100%',
      right: 'auto',
      bottom: 'auto',
      zIndex: '9999',
      backgroundColor: 'rgba(30, 40, 50, 0.98)',
      borderRadius: '0',
      borderLeft: 'none',
      borderTop: 'none'
    });
  } catch (e) {
    console.error('[dev-panel-layout] Error applying fullscreen layout:', e);
  }

  // No event listeners needed for fullscreen layout
  // Return empty dispose function for consistency with architecture
  return function dispose() {
    // Fullscreen layout has no listeners to clean up
  };
}
