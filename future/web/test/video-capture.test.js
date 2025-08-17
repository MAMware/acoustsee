// File: web/test/video-capture.test.js
import { setupVideoCapture, cleanupVideoCapture } from '../video/video-capture.js';
import { structuredLog } from '../utils/logging.js';
import { getDOM } from '../core/context.js';
import { dispatchEvent } from '../core/dispatcher.js';

jest.mock('../utils/logging.js', () => ({
  structuredLog: jest.fn()
}));
jest.mock('../core/context.js', () => ({
  getDOM: jest.fn()
}));
jest.mock('../core/dispatcher.js', () => ({
  dispatchEvent: jest.fn()
}));

describe('video-capture', () => {
  test('setupVideoCapture handles missing DOM elements', async () => {
    const DOM = { videoFeed: null, frameCanvas: null };
    const result = await setupVideoCapture(DOM);
    expect(result).toBe(false);
    expect(structuredLog).toHaveBeenCalledWith('ERROR', 'Missing videoFeed or frameCanvas in setupVideoCapture');
    expect(dispatchEvent).toHaveBeenCalledWith('logError', { message: 'Missing videoFeed or frameCanvas in setupVideoCapture' });
  });

  test('setupVideoCapture initializes video feed and canvas', async () => {
    const DOM = {
      videoFeed: { setAttribute: jest.fn() },
      frameCanvas: { style: { display: '' }, setAttribute: jest.fn() }
    };
    const result = await setupVideoCapture(DOM);
    expect(result).toBe(true);
    expect(DOM.videoFeed.setAttribute).toHaveBeenCalledWith('autoplay', '');
    expect(DOM.videoFeed.setAttribute).toHaveBeenCalledWith('muted', '');
    expect(DOM.videoFeed.setAttribute).toHaveBeenCalledWith('playsinline', '');
    expect(DOM.frameCanvas.style.display).toBe('none');
    expect(DOM.frameCanvas.setAttribute).toHaveBeenCalledWith('aria-hidden', 'true');
    expect(structuredLog).toHaveBeenCalledWith('INFO', 'setupVideoCapture: Video feed and canvas initialized');
  });

  test('cleanupVideoCapture clears video feed and canvas', async () => {
    const trackMock = { stop: jest.fn() };
    const srcObject = { getTracks: () => [trackMock] };
    const DOM = {
      videoFeed: { srcObject },
      frameCanvas: { width: 0, height: 0 }
    };
    getDOM.mockReturnValue(DOM);
    await cleanupVideoCapture({ force: true });
    // cleanupVideoCapture may null out DOM.videoFeed.srcObject, so assert against the
    // original track mock reference instead of reading srcObject after cleanup.
    expect(trackMock.stop).toHaveBeenCalled();
    expect(DOM.videoFeed.srcObject).toBe(null);
    expect(DOM.frameCanvas.width).toBe(0);
    expect(DOM.frameCanvas.height).toBe(0);
  expect(structuredLog).toHaveBeenCalled();
  });
});