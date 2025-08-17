// Silence console during tests and mock structuredLog to avoid noisy output
jest.mock('../core/media-controller.js', () => ({
  startCamera: jest.fn(),
  stopCamera: jest.fn(),
  isCameraActive: jest.fn()
}));

jest.mock('../core/microphone-controller.js', () => ({
  startMic: jest.fn(),
  stopMic: jest.fn()
}));

jest.mock('../core/state.js', () => {
  const settings = { autoFPS: true, updateInterval: 15, autoFpsBenchmark: {}, micStream: null };
  return {
    settings,
    setAutoFpsBenchmark: jest.fn()
  };
});
// structuredLog is mocked globally in setup.js

import { createEngine } from '../core/engine.js';
import * as media from '../core/media-controller.js';
import { settings, setAutoFpsBenchmark } from '../core/state.js';

describe('engine camera and benchmark handlers', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('toggleCamera calls mediaStartCamera when camera is off', async () => {
    const videoEl = { srcObject: null };
    media.isCameraActive.mockReturnValue(false);
    media.startCamera.mockImplementation(async (video) => { video.srcObject = {}; return {}; });

    const engine = createEngine();
    const res = await engine.dispatch('toggleCamera', { videoEl });

    expect(media.startCamera).toHaveBeenCalledWith(videoEl, { facingMode: 'environment' });
    expect(videoEl.srcObject).toBeDefined();
  });

  test('toggleCamera calls mediaStopCamera when camera is on', async () => {
    const videoEl = { srcObject: {} };
    media.isCameraActive.mockReturnValue(true);
    const engine = createEngine();
    const res = await engine.dispatch('toggleCamera', { videoEl });

    expect(media.stopCamera).toHaveBeenCalledWith(videoEl);
  });

  test('cameraDidStart triggers benchmark when settings.autoFPS is true', async () => {
    settings.autoFPS = true;
    const engine = createEngine();
    const cb = jest.fn();
    engine.onBenchmarkRequired(cb);

    await engine.dispatch('cameraDidStart', { foo: 'bar' });
    expect(cb).toHaveBeenCalled();
  });

  test('cameraDidStart does not trigger benchmark when settings.autoFPS is false', async () => {
    settings.autoFPS = false;
    const engine = createEngine();
    const cb = jest.fn();
    engine.onBenchmarkRequired(cb);

    await engine.dispatch('cameraDidStart', { foo: 'bar' });
    expect(cb).not.toHaveBeenCalled();
  });

  test('setFrameInterval calls setAutoFpsBenchmark and updates state', async () => {
    const engine = createEngine();
    const payload = { intervalMs: 66.7, sampleCount: 3 };
    const res = await engine.dispatch('setFrameInterval', payload);

    expect(setAutoFpsBenchmark).toHaveBeenCalledWith(expect.objectContaining({ intervalMs: payload.intervalMs, sampleCount: payload.sampleCount }));
    // updateInterval should be set to nearest fps
    expect(settings.updateInterval).toBeGreaterThan(0);
  });

  test('toggleMicrophone starts and stops mic stream and updates state', async () => {
    const fakeStream = { getTracks: () => [{ stop: jest.fn() }] };
    const mic = require('../core/microphone-controller.js');
    mic.startMic.mockResolvedValue(fakeStream);
    const engine = createEngine();

    // Start mic
    const startRes = await engine.dispatch('toggleMicrophone');
    expect(mic.startMic).toHaveBeenCalledWith({ audio: true });
    expect(settings.micStream).toBe(fakeStream);

    // Stop mic
    const stopRes = await engine.dispatch('toggleMicrophone');
    expect(mic.stopMic).toHaveBeenCalled();
    expect(settings.micStream).toBeNull();
  });
});
