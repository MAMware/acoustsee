import { computeAutoIntervalBenchmark } from '../utils/performance.js';

/**
 * UI effects handler: listens for engine benchmark requests and runs DOM-heavy computations.
 * @param {object} engine - headless engine instance
 * @param {object} DOM - app DOM elements
 */
export function setupUIEffectsHandler(engine, DOM) {
  if (!engine || !DOM) return;

  // Subscribe to benchmark requests via engine's onBenchmarkRequired-like API
  if (typeof engine.onBenchmarkRequired === 'function') {
    engine.onBenchmarkRequired(async (payload = {}) => {
      try {
        const video = DOM.videoFeed;
        const canvas = DOM.frameCanvas;
        if (!video || !canvas) return;
        const intervalMs = await computeAutoIntervalBenchmark(video, canvas, DOM.processFrame || (() => {}), 15);
        if (intervalMs && Number.isFinite(intervalMs)) {
          await engine.dispatch('setFrameInterval', { intervalMs, sampleCount: 1 });
        }
      } catch (e) {
        console.warn('benchmark handler failed', e);
      }
    });
  }
}
