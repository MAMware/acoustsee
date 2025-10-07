/**
 * Minimal DOM Shim for Testing UI Modules
 * 
 * Provides stub DOM elements that UI modules expect to exist.
 * 
 * LIMITATIONS:
 * - Does NOT render to screen
 * - Does NOT support real event propagation (no bubbling, capturing)
 * - Does NOT compute layout or styles
 * - Does NOT support querySelector or DOM traversal
 * 
 * USE FOR:
 * - Testing UI module initialization
 * - Verifying appendChild and event listener registration patterns
 * - Smoke testing modules that require DOM references
 * 
 * For real DOM behavior, use browser integration tests (Playwright/Puppeteer).
 */

export const DOM = {
  uiPanelRoot: { appendChild: (node) => { console.log('[DOM] appendChild', node && node.id); } },
  mainContainer: { addEventListener: (evt, cb) => { console.log('[DOM] mainContainer.addEventListener', evt); } },
  videoFeed: { play: () => {}, pause: () => {} },
  frameCanvas: { getContext: () => ({ putImageData: () => {} }) },
  button1: null,
  audioManager: null
};
