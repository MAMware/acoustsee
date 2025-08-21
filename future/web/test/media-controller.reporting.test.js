import { startCamera, stopCamera } from '../core/media-controller.js';

jest.mock('../core/reporting.js', () => ({ reportError: jest.fn(), reportInfo: jest.fn() }));

describe('media-controller reporting', () => {
  beforeEach(() => {
    jest.resetAllMocks();
  });

  test('startCamera reports error when getUserMedia rejects', async () => {
    // Make navigator.mediaDevices.getUserMedia reject
    global.navigator = global.navigator || {};
    global.navigator.mediaDevices = {
      getUserMedia: jest.fn().mockRejectedValue(new Error('simulated-ugm-failure'))
    };

    const reporting = require('../core/reporting.js');

    const videoEl = { play: jest.fn().mockRejectedValue(new Error('play failed')) };

    await expect(startCamera(videoEl)).rejects.toThrow('simulated-ugm-failure');

    expect(reporting.reportError).toHaveBeenCalled();
    const callArg = reporting.reportError.mock.calls[0][0];
    expect(callArg).toBeInstanceOf(Error);
    expect(callArg.message).toMatch(/simulated-ugm-failure/);
  });
});
