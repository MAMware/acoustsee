// The Blind/User Accessible UI moved into touch-gestures namespace
export function initializeAccessibleUI(engine, DOM) {
  console.log('Initializing Accessible UI...');
  
  // This UI is primarily for end-users. It will be gesture-based.
  // The original "Start/Stop" button overlay on the video is a good
  // fit for this UI's primary interaction.

  const startStopButton = DOM.button1;
  if (startStopButton) {
    startStopButton.addEventListener('click', (e) => {
      e.preventDefault();
      const isProcessing = engine.getState().isProcessing;
      if (isProcessing) {
        engine.dispatch('stopProcessing', { videoEl: DOM.videoFeed });
        engine.dispatch('announceMessage', { message: 'Stopping' }); // Placeholder for proper getText
      } else {
        engine.dispatch('startProcessing', { videoEl: DOM.videoFeed, canvasEl: DOM.frameCanvas });
        engine.dispatch('announceMessage', { message: 'Starting' });
      }
    });
  }

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
    const mainArea = DOM.mainContainer;
    mainArea.addEventListener('click', handleClick);
    mainArea.addEventListener('pointerdown', handlePointerDown);
    mainArea.addEventListener('pointerup', handlePointerUp);
    createSwipeDetector(mainArea, handleSwipe);
}
// Moved from accessible-ui.js to touch-gestures/touch-gestures-ui.js
// Export the local implementation (moved from accessible-ui.js) so we don't depend on the legacy root file.
export { initializeAccessibleUI as initializeTouchGesturesUI } from '../touch-gestures/touch-gestures-ui.js';
