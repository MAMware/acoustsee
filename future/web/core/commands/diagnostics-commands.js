// filepath: future/web/core/commands/diagnostics-commands.js
// NEW FILE OK

import { structuredLog } from '../../utils/logging.js';

// A simple RingBuffer implementation for storing benchmark history.
class RingBuffer {
  constructor(size) { this.arr = []; this.size = size; }
  push(item) { this.arr.push(item); if (this.arr.length > this.size) this.arr.shift(); }
  getValues() { return [...this.arr].sort((a, b) => a - b); }
  count() { return this.arr.length; }
  percentile(p) {
    const sorted = this.getValues();
    const index = Math.floor(sorted.length * p);
    return sorted[index];
  }
}

const benchmarkHistory = new RingBuffer(30);

export function registerDiagnosticsCommands(engine) {
  if (!engine) return;

  engine.registerCommandHandler('logFrameBenchmark', (payload) => {
    if (payload && typeof payload.duration === 'number') {
      benchmarkHistory.push(payload.duration);
    }
  });

  // New handler to send throttle commands to the worker
  engine.registerCommandHandler('setFrameProviderThrottle', (payload) => {
    // Note: window.frameProviderWorker is a deliberate shortcut for the dev panel.
    const worker = window.frameProviderWorker;
    if (!worker) return;

    if (payload.skipRate) {
      worker.postMessage({ type: 'setFrameSkipRate', payload: { skipRate: payload.skipRate } });
    }
    if (payload.scale) {
      worker.postMessage({ type: 'setResolutionScale', payload: { scale: payload.scale } });
    }
  });

  engine.registerCommandHandler('diagnosticTick', () => {
    const state = engine.getState();
    const settings = state.settings || {};

    if (settings.fpsMode !== 'auto' || benchmarkHistory.count() < 15) {
      return; // Respect user preference and wait for samples
    }

    const currentInterval = state.updateInterval;
    const frameBudget = currentInterval * 0.85; // Target 85% of budget for safety.

    // Use a high percentile to be robust against outliers.
    const p90_duration = benchmarkHistory.percentile(0.9);

    // Throttling decision logic
    let throttleAction = null;
    const currentThrottle = state.frameProviderThrottle || { skipRate: 1, scale: 1.0 };
    const isUnderperforming = p90_duration > frameBudget;
    const isOverperforming = p90_duration < frameBudget * 0.4;

    if (isUnderperforming) {
      // Performance is struggling. Increase throttling.
      let newSkipRate = currentThrottle.skipRate;
      let newScale = currentThrottle.scale;
      // First, try reducing resolution.
      if (newScale > 0.5) newScale = Math.max(0.5, newScale - 0.25);
      // If that's not enough, start skipping frames.
      else newSkipRate = Math.min(4, newSkipRate + 1);
      
      if (newSkipRate !== currentThrottle.skipRate || newScale !== currentThrottle.scale) {
        throttleAction = { skipRate: newSkipRate, scale: newScale };
        structuredLog('INFO', 'AutoFPS: Increasing throttling.', throttleAction);
      }
    } else if (isOverperforming) {
      // Performance is excellent. Decrease throttling.
      let newSkipRate = currentThrottle.skipRate;
      let newScale = currentThrottle.scale;
      // First, stop skipping frames.
      if (newSkipRate > 1) newSkipRate = Math.max(1, newSkipRate - 1);
      // If that's stable, increase resolution.
      else newScale = Math.min(1.0, newScale + 0.25);

      if (newSkipRate !== currentThrottle.skipRate || newScale !== currentThrottle.scale) {
        throttleAction = { skipRate: newSkipRate, scale: newScale };
        structuredLog('INFO', 'AutoFPS: Decreasing throttling.', throttleAction);
      }
    }

    if (throttleAction) {
      engine.dispatch('setFrameProviderThrottle', throttleAction);
      engine.setState({ frameProviderThrottle: throttleAction });
    }
  });

  // Handler for user to manually set FPS mode
  engine.registerCommandHandler('setFpsMode', (payload) => {
    const newState = { settings: { ...engine.getState().settings, fpsMode: payload.mode } };
    if (payload.mode === 'manual' && payload.interval) {
      newState.updateInterval = payload.interval;
    }
    engine.setState(newState);
  });
}