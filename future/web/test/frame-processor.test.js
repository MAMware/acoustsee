import { cleanupFrameProcessor } from '../core/frame-processor.js';
import { structuredLog } from '../utils/logging.js';
import { dispatchEvent } from '../core/dispatcher.js';

jest.mock('../utils/logging.js', () => ({
  structuredLog: jest.fn(),
}));
jest.mock('../core/dispatcher.js', () => ({
  dispatchEvent: jest.fn(),
}));

describe('frame-processor', () => {
  test('cleanupFrameProcessor resets frame data', async () => {
    const result = await cleanupFrameProcessor();
    expect(result).toEqual({ prevFrameDataLeft: null, prevFrameDataRight: null });
    expect(structuredLog).toHaveBeenCalledWith('INFO', 'cleanupFrameProcessor: Resetting frame processor state');
  });

  test('cleanupFrameProcessor handles errors', async () => {
    structuredLog.mockImplementationOnce(() => {
      throw new Error('Test error');
    });
    const result = await cleanupFrameProcessor();
    expect(result).toEqual({ prevFrameDataLeft: null, prevFrameDataRight: null });
    expect(structuredLog).toHaveBeenCalledWith('ERROR', 'cleanupFrameProcessor error', expect.any(Object));
    expect(dispatchEvent).toHaveBeenCalledWith('logError', expect.any(Object));
  });
});