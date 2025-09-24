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

  engine.registerCommandHandler('diagnosticTick', () => {
    const state = engine.getState();
    const settings = state.settings || {};

    // Respect user preference: if not in auto mode, do nothing.
    if (settings.fpsMode !== 'auto') {
      return;
    }

    if (benchmarkHistory.count() < 15) return; // Wait for enough samples.

    const currentInterval = state.updateInterval;
    const frameBudget = currentInterval * 0.85; // Target 85% of budget for safety.

    // Use a high percentile to be robust against outliers.
    const p90_duration = benchmarkHistory.percentile(0.9);

    if (p90_duration > frameBudget) {
      // Performance is struggling. Slow down (increase interval).
      const newInterval = Math.min(250, currentInterval + 20); // Slower, max 4 FPS
      if (newInterval !== currentInterval) {
        structuredLog('INFO', 'AutoFPS: Performance struggling, slowing down.', { p90_duration, frameBudget, newInterval });
        engine.dispatch('setUpdateInterval', { interval: newInterval });
      }
    } else if (p90_duration < frameBudget * 0.4) {
      // Performance is excellent. Speed up (decrease interval).
      const newInterval = Math.max(33, currentInterval - 20); // Faster, min 30 FPS
      if (newInterval !== currentInterval) {
        structuredLog('INFO', 'AutoFPS: Performance good, speeding up.', { p90_duration, frameBudget, newInterval });
        engine.dispatch('setUpdateInterval', { interval: newInterval });
      }
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