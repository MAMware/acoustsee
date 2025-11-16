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

    if (settings.fpsMode !== 'auto' || benchmarkHistory.count() < 15 || state.currentMode === 'flow') {
      return; // Respect user preference, wait for samples, and disable AutoFPS in flow mode
    }

    const currentInterval = state.updateInterval;
    const frameBudget = currentInterval * 0.85; // Target 85% of budget for safety.

    // Use a high percentile to be robust against outliers.
    const p90_duration = benchmarkHistory.percentile(0.9);

    // Select profile-derived targets if available R161125d lets document this
    const orchestration = state.orchestration || {};
    const profileName = settings.qualityProfileOverride || orchestration?.qualityProfile?.name || 'auto';
    const profile = orchestration?.qualityProfiles?.[profileName] || orchestration?.qualityProfile || null;
    const targetFps = profile?.fpsTarget || orchestration?.qualityProfile?.fpsTarget || 30;
    const targetWidth = profile?.targetWidth || orchestration?.qualityProfile?.resolutionWidth || null;
    const srcWidth = orchestration?.metrics?.resolutionWidth || 320;
    const desiredScale = targetWidth ? Math.max(0.1, Math.min(1.0, targetWidth / srcWidth)) : null;

    // Throttling decision logic
    let throttleAction = null;
    const currentThrottle = state.frameProviderThrottle || { skipRate: 1, scale: 1.0 };
    const isUnderperforming = p90_duration > frameBudget;
    const isOverperforming = p90_duration < frameBudget * 0.4;

    if (isUnderperforming) {
      // Performance is struggling. Increase throttling.
      let newSkipRate = currentThrottle.skipRate;
      let newScale = currentThrottle.scale;
      // First, try reducing resolution toward desiredScale if available R161125s SILENTLY REDUCING RESOLUTION IS A HUGE CODE SMELL
      if (desiredScale && newScale > desiredScale + 0.05) {
        const step = 0.25;
        newScale = Math.max(desiredScale, Math.max(0.1, newScale - step));
      } else {
        // If we're already at desiredScale, use skip rate to reduce CPU
        const estimatedSrcFps = Math.max(10, Math.round(orchestration?.metrics?.fps || 30));
        const desiredSkip = Math.max(1, Math.ceil(estimatedSrcFps / (targetFps || 3)));
        newSkipRate = Math.min(4, Math.max(1, desiredSkip));
      }
      
      if (newSkipRate !== currentThrottle.skipRate || newScale !== currentThrottle.scale) {
        throttleAction = { skipRate: newSkipRate, scale: newScale };
        structuredLog('INFO', 'AutoFPS: Increasing throttling.', throttleAction);
      }
    } else if (isOverperforming) {
      // Performance is excellent. Decrease throttling.
      let newSkipRate = currentThrottle.skipRate;
      let newScale = currentThrottle.scale;
      // First, stop skipping frames if present. R161125 what "if present"?
       if (newSkipRate > 1) newSkipRate = Math.max(1, newSkipRate - 1);
      // If we're already at skipRate=1, increase resolution up towards desiredScale/1.0
      else {
        const step = 0.25;
        const upTarget = desiredScale ? Math.min(1.0, Math.max(desiredScale, desiredScale)) : 1.0;
        newScale = Math.min(1.0, newScale + step);
      }

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

  // Handler to update orchestration state (capabilities, metrics, decision log, etc.)
  engine.registerCommandHandler('updateOrchestration', (payload) => {
    const currentState = engine.getState();
    const currentOrchestration = currentState.orchestration || {};
    
    // Log what we're updating for debugging
    if (payload.capabilities) {
      structuredLog('DEBUG', 'updateOrchestration: Updating capabilities', {
        mediaStreamTrackProcessor: payload.capabilities.mediaStreamTrackProcessor,
        canvas2D: payload.capabilities.canvas2D,
        webGL: payload.capabilities.webGL,
        webGPU: payload.capabilities.webGPU,
        offscreenCanvas: payload.capabilities.offscreenCanvas,
        wasm: payload.capabilities.wasm,
      });
    }
    
    // Phase 3.1b-Hotfix: Ensure orchestration never contains circular references
    // Remove 'state' property if accidentally included (Rule 1 violation)
    const sanitizedPayload = { ...payload };
    delete sanitizedPayload.state;  // Never store state inside orchestration
    
    // Merge the updates into the orchestration state
    const updatedOrchestration = {
      ...currentOrchestration,
      ...sanitizedPayload,
      lastUpdateTimestamp: performance.now(),
    };
    
    engine.setState({
      orchestration: updatedOrchestration,
    });
    
    // Log confirmation
    structuredLog('DEBUG', 'updateOrchestration: State updated', {
      hasCapabilities: !!updatedOrchestration.capabilities,
      timestamp: updatedOrchestration.lastUpdateTimestamp,
    });
  });
}
