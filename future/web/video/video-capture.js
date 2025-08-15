import { settings } from '../core/state.js';
import { structuredLog } from '../utils/logging.js';
import { getText } from '../utils/utils.js';
import { dispatchEvent } from '../core/dispatcher.js';
import { getDOM } from '../core/context.js';

export async function setupVideoCapture(DOM) {
  try {
    if (!DOM.videoFeed || !DOM.frameCanvas) {
      const msg = 'Missing videoFeed or frameCanvas in setupVideoCapture';
      structuredLog('ERROR', msg);
      dispatchEvent('logError', { message: msg });
      return false;
    }

    DOM.videoFeed.setAttribute('autoplay', '');
    DOM.videoFeed.setAttribute('muted', '');
    DOM.videoFeed.setAttribute('playsinline', '');
    DOM.frameCanvas.style.display = 'none';
    DOM.frameCanvas.setAttribute('aria-hidden', 'true');

    structuredLog('INFO', 'setupVideoCapture: Video feed and canvas initialized');
    return true;
  } catch (err) {
    structuredLog('ERROR', 'setupVideoCapture error', { message: err.message });
    dispatchEvent('logError', { message: `Video capture setup error: ${err.message}` });
    return false;
  }
}

/**
 * Cleanup video capture resources.
 *
 * Options:
 *  - force (boolean): when true, always zero the canvas dimensions.
 *
 * Behavior:
 *  - In browser when the document is visible, the canvas dimensions are left
 *    untouched unless `force` is true. This avoids clearing the canvas while
 *    the page is visible (useful for visual debugging or inspecting frames).
 *  - In non-browser or test environments (no document.visibilityState), the
 *    function preserves the previous behavior and zeros the canvas for
 *    compatibility with existing tests.
 */
export async function cleanupVideoCapture(options = {}) {
  const { force = false } = options;
  const DOM = getDOM();
  try {
    if (DOM.videoFeed?.srcObject) {
      DOM.videoFeed.srcObject.getTracks().forEach(track => track.stop());
      DOM.videoFeed.srcObject = null;
    }

    // Detect whether we're running in a real browser with visibility API
    const inBrowser = typeof document !== 'undefined' && typeof document.visibilityState !== 'undefined';
    const docVisible = inBrowser ? (document.visibilityState === 'visible' && !document.hidden) : false;

    // Zero the canvas when forced, when not running in a browser (tests),
    // or when the document is not visible.
    const shouldZero = force || !inBrowser || !docVisible;

    if (DOM.frameCanvas && shouldZero) {
      DOM.frameCanvas.width = 0;
      DOM.frameCanvas.height = 0;
    }

    structuredLog('INFO', 'cleanupVideoCapture: Video capture cleaned up', { zeroed: shouldZero });
  } catch (err) {
    structuredLog('WARN', 'cleanupVideoCapture error', { message: err.message });
  }
}