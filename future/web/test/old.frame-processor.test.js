import { structuredLog } from '../utils/logging.js';
import { settings } from '../core/state.js';

jest.mock('../utils/logging.js', () => ({
  structuredLog: jest.fn(),
}));
jest.mock('../core/context.js', () => ({
  // We'll provide a mock for getDispatchEvent and configure its returned
  // inner dispatch function immediately after requiring the mocked module.
  getDispatchEvent: jest.fn(),
}));
jest.mock('../core/state.js', () => ({
  settings: {
    // availableGrids will be populated after we mock the grid map function below
    availableGrids: [{ id: 'hex-tonnetz' }],
    gridType: 'hex-tonnetz',
    dayNightMode: 'day',
    resetStateOnError: true
  }
}));
// Provide a lightweight mapFunction via the grid object to avoid importing the full
// implementation during tests. mapFunction returns predictable cues and a newFrameData.
jest.mock('../video/grids/hex-tonnetz.js', () => ({
  mapFrameToCues: jest.fn((frameData, width, height, prev) => ({
    cues: [{ objectType: 'default_motion', intensity: 0.2, position: { x: 0, y: 0, z: 0 } }],
    // prior implementation returned newFrameData/avgIntensity; new API returns cues only
  }))
}));

// After mocking the grid module, update settings.availableGrids to include the
// actual mapFunction reference so frame-processor's settings.availableGrids finds it.
const { mapFrameToCues } = require('../video/grids/hex-tonnetz.js');
settings.availableGrids = [{ id: 'hex-tonnetz', mapFunction: mapFrameToCues }];

// Now configure the core/context mocked module to return a stable inner mock
// so assertions can check that the code under test invoked it.
const context = require('../core/context.js');
const frameDispatchMock = jest.fn();
context.getDispatchEvent.mockImplementation(() => frameDispatchMock);

// Require the frame-processor module after wiring the context mock
const { processFrameToCues, processFrameWithState, cleanupFrameProcessor } = require('../video/frame-processor.js');

describe('frame-processor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    settings.resetStateOnError = true;
  });

  test('processFrameToCues handles invalid dimensions', async () => {
    const result = await processFrameToCues(new Uint8ClampedArray(1000), 0, 0, null);
    expect(result).toEqual({
      cues: [],
      prevFrameData: null
    });
    expect(structuredLog).toHaveBeenCalledWith('ERROR', 'Invalid dimensions for frame processing', { width: 0, height: 0 });
  expect(frameDispatchMock).toHaveBeenCalledWith('logError', { message: 'Invalid dimensions for frame processing: 0x0' });
  });

  test('processFrameToCues handles invalid frameData', async () => {
    const result = await processFrameToCues(null, 100, 100, null);
    expect(result).toEqual({
      cues: [],
      prevFrameData: null
    });
    expect(structuredLog).toHaveBeenCalledWith('ERROR', 'Invalid frameData for processing', { frameDataLength: 0 });
  });

  test('processFrameToCues preserves state when resetStateOnError is false', async () => {
    settings.resetStateOnError = false;
    const prev = new Uint8ClampedArray(1000);
    const result = await processFrameToCues(null, 100, 100, prev);
    expect(result).toEqual({
      cues: [],
      prevFrameData: prev
    });
  });

  test('processFrameToCues processes valid data', async () => {
    const frameData = new Uint8ClampedArray(100 * 100 * 4);
    // Fill with sample RGB data to produce variance
    for (let i = 0; i < frameData.length; i += 4) {
      frameData[i] = 100; // R
      frameData[i+1] = 50; // G
      frameData[i+2] = 25; // B
      frameData[i+3] = 255; // A
    }
  const result = await processFrameToCues(frameData, 100, 100, null);
  expect(result.cues).toHaveLength(1);
  expect(result.prevFrameData).toBeInstanceOf(Uint8ClampedArray);
  });

  test('processFrameWithState updates module state', async () => {
    const frameData = new Uint8ClampedArray(100 * 100 * 4);
    for (let i = 0; i < frameData.length; i += 4) {
      frameData[i] = 100;
      frameData[i+1] = 50;
      frameData[i+2] = 25;
      frameData[i+3] = 255;
    }
  const result = await processFrameWithState(frameData, 100, 100);
  expect(result.cues).toHaveLength(1);
  expect(result.prevFrameData).toBeInstanceOf(Uint8ClampedArray);
  });

  test('cleanupFrameProcessor resets module state', async () => {
  const result = await cleanupFrameProcessor();
  expect(result).toEqual({ prevFrameData: null });
    expect(structuredLog).toHaveBeenCalledWith('INFO', 'cleanupFrameProcessor: Resetting frame processor state');
  });

  test('cleanupFrameProcessor handles errors', async () => {
    structuredLog.mockImplementationOnce(() => {
      throw new Error('Test error');
    });
  const result = await cleanupFrameProcessor();
  expect(result).toEqual({ prevFrameData: null });
    expect(structuredLog).toHaveBeenCalledWith('ERROR', 'cleanupFrameProcessor error', expect.any(Object));
    // The module uses getDispatchEvent() to obtain the dispatch function. Ensure
    // the inner dispatch mock was invoked with logError.
    expect(frameDispatchMock).toHaveBeenCalledWith('logError', expect.any(Object));
  });
});