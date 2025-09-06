// File: web/core/commands/performance-commands.js
// Handles commands related to performance measurement and tuning.
// MAMware review R250905: is this benchmark runnable from the UI? if yes, it is explain more.
// it runs only when called as toggleAutoFps ? 
// how this benchmark reflect the device performance ?

import { setAutoFpsBenchmark } from '../state.js';
import { structuredLog } from '../../utils/logging.js';

export function registerPerformanceCommands(engine) {
  const { registerCommandHandler } = engine;

  registerCommandHandler('toggleAutoFps', async ({ state: s }) => {
    s.autoFPS = !s.autoFPS;
    return { autoFPS: s.autoFPS };
  });

  // Handles the result of a UI-driven benchmark run
  registerCommandHandler('setFrameInterval', async ({ state: s, payload }) => {
    try {
      const { intervalMs, sampleCount = 1 } = payload || {};
        if (typeof intervalMs !== 'number' || Number.isNaN(intervalMs) || intervalMs <= 0) {
          return { ok: false };
        }
      
      const fps = Math.max(8, Math.min(30, Math.round(1000 / intervalMs)));
      s.updateInterval = 1000 / fps; // Store the interval, not the rounded FPS
      
      setAutoFpsBenchmark({ intervalMs, sampleCount, safetyFactor: s.autoFpsBenchmark?.safetyFactor || 0.7 });
      
      return { fps, intervalMs };
    } catch (e) {
      structuredLog('WARN', 'setFrameInterval failed', { error: e?.message || String(e) });
      return { ok: false };
    }
  });

  // Listens for when the camera starts to trigger a new benchmark if needed.
  registerCommandHandler('cameraDidStart', async ({ state: s, payload }) => {
    try {
      if (s.autoFPS) {
        // The engine may expose benchmark listeners; call them if available.
        try {
            const listeners = (typeof engine.getBenchmarkListeners === 'function') ? engine.getBenchmarkListeners() : [];
            Array.isArray(listeners) && listeners.forEach((l) => { try { l(payload); } catch (e) { structuredLog('perf:cameraDidStart', 'listener error', { e }) } });
        } catch (e) { structuredLog('WARN', 'cameraDidStart: invoking benchmark listeners failed', { error: e?.message }); }
      }
    } catch (e) {
      structuredLog('WARN', 'cameraDidStart failed', { error: e?.message || String(e) });
    }
  });
}
