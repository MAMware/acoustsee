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

export async function cleanupVideoCapture() {
  const DOM = getDOM();
  if (DOM.videoFeed?.srcObject) {
    DOM.videoFeed.srcObject.getTracks().forEach(track => track.stop());
    DOM.videoFeed.srcObject = null;
  }
  DOM.frameCanvas.width = 0;
  DOM.frameCanvas.height = 0;
  structuredLog('INFO', 'cleanupVideoCapture: Video capture cleaned up');
}