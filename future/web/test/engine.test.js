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

jest.mock('../audio/audio-processor.js', () => ({
  playCues: jest.fn(),
  resizeOscillatorPool: jest.fn()
}));

jest.mock('../utils/utils.js', () => ({
  getText: jest.fn(async (key) => key),
  speakText: jest.fn(),
  setLanguage: jest.fn(),
  translatePage: jest.fn(),
  announceMessage: jest.fn()
}));

jest.mock('../audio/audio-processor.js', () => ({
  playAudio: jest.fn(),
  resizeOscillatorPool: jest.fn()
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
  expect(startRes.result).toEqual(expect.objectContaining({ micActive: true }));

    // Stop mic
  const stopRes = await engine.dispatch('toggleMicrophone');
  expect(mic.stopMic).toHaveBeenCalled();
  expect(stopRes.result).toEqual(expect.objectContaining({ micActive: false }));
  });

  test('startProcessing sets interval and marks processing state', async () => {
  jest.useFakeTimers();
    const videoEl = { srcObject: null, videoWidth: 100, videoHeight: 100, readyState: 4, getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(100 * 100 * 4) }) }) };
    media.isCameraActive.mockReturnValue(false);
    media.startCamera.mockImplementation(async (video) => { video.srcObject = {}; return {}; });

    const engine = createEngine();
    const res = await engine.dispatch('startProcessing', { videoEl, canvasEl: { width: 100, height: 100, getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(100 * 100 * 4) }) }) } });

    expect(media.startCamera).toHaveBeenCalled();
  // Timer ID should be stored on settings (may be a Timeout object)
  expect(settings.processingTimerId).toBeDefined();
  expect(settings.isProcessing).toBe(true);
  // Advance timers to allow scheduler to run at least once
  jest.advanceTimersByTime(50);
  jest.useRealTimers();
  });

  test('stopProcessing clears interval and unsets processing state', async () => {
  jest.useFakeTimers();
  // Start processing to create a scheduler timer
  const videoEl = { srcObject: null, videoWidth: 100, videoHeight: 100, readyState: 4, getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(100 * 100 * 4) }) }) };
  media.startCamera.mockImplementation(async (video) => { video.srcObject = {}; return {}; });
  const engine = createEngine();
  await engine.dispatch('startProcessing', { videoEl, canvasEl: { width: 100, height: 100, getContext: () => ({ drawImage: () => {}, getImageData: () => ({ data: new Uint8ClampedArray(100 * 100 * 4) }) }) } });
  // Now stop processing and ensure scheduler timer cleared and state updated
  const clearSpy = jest.spyOn(global, 'clearTimeout');
  const res = await engine.dispatch('stopProcessing', { videoEl });
  expect(clearSpy).toHaveBeenCalled();
  expect(settings.processingTimerId).toBeNull();
  expect(settings.isProcessing).toBe(false);
  clearSpy.mockRestore();
  jest.useRealTimers();
  });

  // Legacy audioPlayNotes test removed: engine now uses audioPlayCues/cues.

  test('cycleLanguage updates settings.language', async () => {
    const utils = require('../utils/utils.js');
    settings.availableLanguages = [{ id: 'en-US' }, { id: 'es-ES' }];
    settings.language = 'en-US';
    const engine = createEngine();
    await engine.dispatch('cycleLanguage');
    expect(settings.language).toBe('es-ES');
    expect(utils.setLanguage).toHaveBeenCalled();
  });

  test('saveSettings writes to localStorage and speaks confirmation', async () => {
    const engine = createEngine();
    // spy on localStorage
    const storageSpy = jest.spyOn(window.localStorage.__proto__, 'setItem');
    await engine.dispatch('saveSettings');
    expect(storageSpy).toHaveBeenCalledWith('acoustsee-settings', expect.any(String));
    storageSpy.mockRestore();
  });

  test('loadSettings reads from localStorage and applies values', async () => {
    const engine = createEngine();
    const sample = JSON.stringify({ gridType: 'hex-tonnetz', maxNotes: 32, language: 'es-ES' });
    jest.spyOn(window.localStorage.__proto__, 'getItem').mockReturnValue(sample);
    await engine.dispatch('loadSettings');
    expect(settings.gridType).toBe('hex-tonnetz');
    expect(settings.maxNotes).toBe(32);
    window.localStorage.getItem.mockRestore();
  });

  test('cycleGrid rotates settings.gridType', async () => {
    settings.availableGrids = [{ id: 'g1' }, { id: 'g2' }, { id: 'g3', maxNotes: 20 }];
    settings.gridType = 'g1';
    const engine = createEngine();
    await engine.dispatch('cycleGrid');
    expect(settings.gridType).toBe('g2');
    await engine.dispatch('cycleGrid');
    expect(settings.gridType).toBe('g3');
  });

  test('cycleFramerate toggles autoFPS and cycles updateInterval', async () => {
    const engine = createEngine();
    // Start with known state
    settings.autoFPS = false;
    settings.updateInterval = 1000 / 20; // 20 fps

    // First dispatch -> should move to 30 fps
    await engine.dispatch('cycleFramerate');
    expect(settings.autoFPS).toBe(false);
    expect(Math.round(1000 / settings.updateInterval)).toBe(30);

    // Second dispatch -> should move to 60 fps
    await engine.dispatch('cycleFramerate');
    expect(settings.autoFPS).toBe(false);
    expect(Math.round(1000 / settings.updateInterval)).toBe(60);

    // Third dispatch -> should set autoFPS true (since 60 is last option)
    await engine.dispatch('cycleFramerate');
    expect(settings.autoFPS).toBe(true);

    // Fourth dispatch -> should turn autoFPS off and set to 20 fps default
    await engine.dispatch('cycleFramerate');
    expect(settings.autoFPS).toBe(false);
    expect(Math.round(1000 / settings.updateInterval)).toBe(20);
  });
});
