import { mapFrameToNotes, processFrameWithState, cleanupFrameProcessor } from '../core/frame-processor.js';
import { structuredLog } from '../utils/logging.js';
import { dispatchEvent } from '../core/dispatcher.js';
import { settings } from '../core/state.js';

jest.mock('../utils/logging.js', () => ({
  structuredLog: jest.fn(),
}));
jest.mock('../core/dispatcher.js', () => ({
  dispatchEvent: jest.fn(),
}));
jest.mock('../core/state.js', () => ({
  settings: {
    availableGrids: [{ id: 'hex-tonnetz' }],
    gridType: 'hex-tonnetz',
    dayNightMode: 'day',
    resetStateOnError: true
  }
}));
jest.mock('../synthesis-grids/hex-tonnetz.js', () => ({
  mapFrameToHexTonnetz: jest.fn(() => ({
    notes: [{ pitch: 440, intensity: 0.05, harmonics: [], pan: -1 }],
    newFrameData: new Uint8ClampedArray(1000),
    avgIntensity: 50
  }))
}));

describe('frame-processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settings.resetStateOnError = true;
  });

  test('mapFrameToNotes handles invalid dimensions', async () => {
    const result = await mapFrameToNotes(new Uint8ClampedArray(1000), 0, 0, null, null);
    expect(result).toEqual({
      notes: [],
      prevFrameDataLeft: null,
      prevFrameDataRight: null,
      avgIntensity: 0
    });
    expect(structuredLog).toHaveBeenCalledWith('ERROR', 'Invalid dimensions for frame processing', { width: 0, height: 0 });
    expect(dispatchEvent).toHaveBeenCalledWith('logError', { message: 'Invalid dimensions for frame processing: 0x0' });
  });

  test('mapFrameToNotes handles invalid frameData', async () => {
    const result = await mapFrameToNotes(null, 100, 100, null, null);
    expect(result).toEqual({
      notes: [],
      prevFrameDataLeft: null,
      prevFrameDataRight: null,
      avgIntensity: 0
    });
    expect(structuredLog).toHaveBeenCalledWith('ERROR', 'Invalid frameData for processing', { frameDataLength: 0 });
  });

  test('mapFrameToNotes preserves state when resetStateOnError is false', async () => {
    settings.resetStateOnError = false;
    const prevLeft = new Uint8ClampedArray(1000);
    const prevRight = new Uint8ClampedArray(1000);
    const result = await mapFrameToNotes(null, 100, 100, prevLeft, prevRight);
    expect(result).toEqual({
      notes: [],
      prevFrameDataLeft: prevLeft,
      prevFrameDataRight: prevRight,
      avgIntensity: 0
    });
  });

  test('mapFrameToNotes processes valid data', async () => {
    const frameData = new Uint8ClampedArray(100 * 100 * 4);
    const result = await mapFrameToNotes(frameData, 100, 100, null, null);
    expect(result.notes).toHaveLength(2); // One from each side
    expect(result.avgIntensity).toBe(50); // (50 + 50) / 2
    expect(result.prevFrameDataLeft).toBeInstanceOf(Uint8ClampedArray);
    expect(result.prevFrameDataRight).toBeInstanceOf(Uint8ClampedArray);
  });

  test('processFrameWithState updates module state', async () => {
    const frameData = new Uint8ClampedArray(100 * 100 * 4);
    const result = await processFrameWithState(frameData, 100, 100);
    expect(result.notes).toHaveLength(2);
    expect(result.avgIntensity).toBe(50);
    expect(result.prevFrameDataLeft).toBeInstanceOf(Uint8ClampedArray);
    expect(result.prevFrameDataRight).toBeInstanceOf(Uint8ClampedArray);
  });

  test('cleanupFrameProcessor resets module state', async () => {
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