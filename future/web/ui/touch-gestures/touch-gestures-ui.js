// The Blind/User Accessible UI moved into touch-gestures namespace
// Settings / config injected here to avoid implicit global coupling
let _uiConfig = {};

import { registerComponent } from '../ui-registry.js';

export function initializeAccessibleUI(arg1, arg2) {
  // Support both signatures:
  // - New (v0.10.0+): initializeAccessibleUI(uiContext)
  // - Legacy: initializeAccessibleUI(engine, DOM)
  
  let engine = null;
  let DOM = null;
  let eventBus = null;
  let generateTraceId = null;
  
  // Detect new signature (uiContext object with standardized properties)
  if (arg1 && arg1.engine && arg1.DOM && arg1.eventBus) {
    // New standardized signature
    engine = arg1.engine;
    DOM = arg1.DOM;
    eventBus = arg1.eventBus;
    generateTraceId = arg1.generateTraceId;
    _uiConfig = Object.assign({}, _uiConfig, {
      settings: arg1.settings,
      basePath: arg1.basePath,
      importMetaUrl: arg1.importMetaUrl
    });
  } else if (arg1 && typeof arg1.getState === 'function') {
    // Legacy signature: initializeAccessibleUI(engine, DOM)
    engine = arg1;
    DOM = arg2 || (typeof window !== 'undefined' ? window.DOM : undefined);
    _uiConfig = Object.assign({}, _uiConfig, (typeof arg2 === 'object' ? arg2 : {}));
    
    // Import helpers manually for legacy mode
    import('../utils/trace-id.js').then(mod => {
      generateTraceId = mod.generateTraceId;
    });
  } else {
    // Old DI signature (deprecated)
    const cfg = arg1 || {};
    engine = cfg.engine || (cfg.engineDispatch ? { dispatch: cfg.engineDispatch, getState: cfg.getEngineState || (()=>({})) } : null);
    DOM = cfg.dom || arg2 || (typeof window !== 'undefined' ? window.DOM : undefined);
    _uiConfig = Object.assign({}, _uiConfig, cfg || {});
  }
  
  engine = engine || { dispatch: () => {}, getState: () => ({}) };
  DOM = DOM || (typeof window !== 'undefined' ? window.DOM : undefined);
  console.log('Initializing Accessible UI...');
  
  // This UI is primarily for end-users. It will be gesture-based.
  // The original "Start/Stop" button overlay on the video is a good
  // fit for this UI's primary interaction.

  // Guard DOM elements - add listeners only when present
  try {
    const startStopButton = DOM && DOM.button1;
    if (startStopButton && typeof startStopButton.addEventListener === 'function') {
      let lastClickTime = 0;
      const DEBOUNCE_MS = 500; // Prevent rapid clicks within 500ms
      
      startStopButton.addEventListener('click', (e) => {
        e.preventDefault();
        
        // Debounce: ignore clicks within 500ms of previous click
        const now = Date.now();
        if (now - lastClickTime < DEBOUNCE_MS) {
          console.log('Ignoring rapid click on Start/Stop button');
          return;
        }
        lastClickTime = now;
        
        // Generate traceId for user action (if available)
        const traceId = generateTraceId ? generateTraceId() : undefined;
        
        const isProcessing = engine.getState().isProcessing;
        if (isProcessing) {
          engine.dispatch('stopProcessing', { videoEl: DOM && DOM.videoFeed }, { traceId });
          engine.dispatch('announceMessage', { message: 'Stopping' }, { traceId }); // Placeholder for proper getText
        } else {
          engine.dispatch('startProcessing', { videoEl: DOM && DOM.videoFeed, canvasEl: DOM && DOM.frameCanvas });
          engine.dispatch('announceMessage', { message: 'Starting' });
        }
      });
    }
  } catch (e) { /* best effort */ }

    // --- Simple Swipe Detection Helper ---
    function createSwipeDetector(element, onSwipe) {
      let touchstartX = 0;
      let touchstartY = 0;
      let touchendX = 0;
      let touchendY = 0;
      const threshold = 50; // Minimum distance for a swipe

      element.addEventListener('touchstart', (event) => {
        touchstartX = event.changedTouches[0].screenX;
        touchstartY = event.changedTouches[0].screenY;
      }, false);

      element.addEventListener('touchend', (event) => {
        touchendX = event.changedTouches[0].screenX;
        touchendY = event.changedTouches[0].screenY;
        handleSwipe();
      }, false);

      function handleSwipe() {
        const deltaX = touchendX - touchstartX;
        const deltaY = touchendY - touchstartY;

        if (Math.abs(deltaX) > Math.abs(deltaY)) { // Horizontal swipe
          if (Math.abs(deltaX) > threshold) {
            onSwipe(deltaX > 0 ? 'right' : 'left');
          }
        } else { // Vertical swipe
          if (Math.abs(deltaY) > threshold) {
            onSwipe(deltaY > 0 ? 'down' : 'up');
          }
        }
      }
    }

    // --- Gesture State ---
    let tapCount = 0;
    let tapTimer = null;
    let longPressTimer = null;
    const TAP_DELAY = 300; // ms
    const LONG_PRESS_DELAY = 1000; // 1 second

    // --- Event Handlers ---
    function handlePointerDown() {
      // Start a timer for long-press
      longPressTimer = setTimeout(() => {
        // If the timer fires, it's a long press.
        tapCount = 0; // Cancel any pending taps
        clearTimeout(tapTimer);

        const state = engine.getState();
        if (state.isSettingsMode) {
          engine.dispatch('exitSettingsMode');
        } else {
          engine.dispatch('enterSettingsMode');
        }
      }, LONG_PRESS_DELAY);
    }

    function handlePointerUp() {
      // If the pointer is lifted, it's not a long press.
      clearTimeout(longPressTimer);
    }

    function handleClick() {
      // Every click increments the tap counter.
      tapCount++;
      if (tapTimer) clearTimeout(tapTimer);

      tapTimer = setTimeout(() => {
        const state = engine.getState();
      
        // We don't process clicks if we're in settings mode
        if (state.isSettingsMode) {
            tapCount = 0;
            return;
        }

        // Process taps for "Live Mode"
        if (tapCount === 1) {
          engine.dispatch('toggleProcessing', { videoEl: DOM.videoFeed, canvasEl: DOM.frameCanvas });
        } else if (tapCount === 2) {
          engine.dispatch('announceStatus');
        } else if (tapCount >= 3) {
          engine.dispatch('gatherAndSendUserReport');
        }
      
        tapCount = 0; // Reset after processing
      }, TAP_DELAY);
    }

    function handleSwipe(direction) {
      const state = engine.getState();
      // Swipes only work in settings mode
      if (!state.isSettingsMode) return;

      // A swipe cancels any pending taps
      tapCount = 0;
      clearTimeout(tapTimer);

      switch (direction) {
        case 'left':
          engine.dispatch('cycleSettingCategory', { direction: -1 });
          break;
        case 'right':
          engine.dispatch('cycleSettingCategory', { direction: 1 });
          break;
        case 'up':
          engine.dispatch('changeCurrentSettingValue', { direction: 1 });
          break;
        case 'down':
          engine.dispatch('changeCurrentSettingValue', { direction: -1 });
          break;
      }
    }

    // --- Attach Listeners ---
    const mainArea = DOM && DOM.mainContainer;
    if (mainArea && typeof mainArea.addEventListener === 'function') {
      mainArea.addEventListener('click', handleClick);
      mainArea.addEventListener('pointerdown', handlePointerDown);
      mainArea.addEventListener('pointerup', handlePointerUp);
      createSwipeDetector(mainArea, handleSwipe);
    }

  // Named timers and swipe detector cleanup
  return {
    dispose() {
      try {
        if (mainArea && mainArea.removeEventListener) {
          mainArea.removeEventListener('click', handleClick);
          mainArea.removeEventListener('pointerdown', handlePointerDown);
          mainArea.removeEventListener('pointerup', handlePointerUp);
        }

        // Clean up swipe detector listeners / instance if present
        try {
          if (swipeDetector) {
            if (typeof swipeDetector.dispose === 'function') {
              swipeDetector.dispose();
            } else if (typeof swipeDetector.off === 'function') {
              swipeDetector.off('swipe');
            } else if (typeof swipeDetector.removeEventListener === 'function') {
              swipeDetector.removeEventListener('swipe', () => {});
            }
            swipeDetector = null;
          }
        } catch (e) {
          structuredLog('WARN', 'swipeDetector dispose failed', { message: String(e) });
        }

        // Clear timers
        try { clearTimeout(tapTimer); } catch (_) {}
        try { clearTimeout(longPressTimer); } catch (_) {}
        tapTimer = 0;
        longPressTimer = 0;

        structuredLog('INFO', 'Touch Gestures UI disposed');
      } catch (err) {
        structuredLog('ERROR', 'touch-gestures dispose error', { message: String(err) });
      }
    }
  };
}
// Provide a canonical export for the touch gestures initializer (legacy name)
export const initializeTouchGesturesUI = initializeAccessibleUI;

// Auto-register with standardized id so main.js / selector can load it
try { registerComponent('touch-gestures', initializeAccessibleUI); } catch (_) {}
