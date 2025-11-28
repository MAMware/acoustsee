// filepath: future/web/core/scheduler.js
// NEW FILE NICE AND CLEAN

import { structuredLog } from '../utils/logging.js';

let engine = null;
let mainLoopId = null;
let lastTickTime = 0;

// PERF FIX (Nov 28): Delta-time accumulator to cap logic updates
// On 120Hz displays, rAF fires every 8.3ms but we only need ~60fps logic updates
// This prevents running diagnosticTick more frequently than necessary
let accumulator = 0;
const MIN_UPDATE_INTERVAL = 16; // Cap at ~60fps maximum for logic updates

function mainLoop(timestamp) {
  if (!mainLoopId) return; // Handle stop case
  const state = engine.getState();
  if (!state.isProcessing) {
    stopScheduler();
    return;
  }

  // Calculate delta time since last frame
  const delta = timestamp - lastTickTime;
  lastTickTime = timestamp;
  
  // Accumulate time and only tick when enough has passed
  accumulator += delta;
  
  // Use the updateInterval from state to decide when to tick
  // Ensure we don't tick faster than MIN_UPDATE_INTERVAL (caps at 60fps)
  const interval = Math.max(state.updateInterval || 100, MIN_UPDATE_INTERVAL);
  
  if (accumulator >= interval) {
    // Reset accumulator (don't let it grow unbounded on slow frames)
    accumulator = accumulator % interval;
    engine.dispatch('diagnosticTick');
  }

  requestAnimationFrame(mainLoop);
}

function startScheduler() {
  if (mainLoopId) return;
  structuredLog('INFO', 'Scheduler started.');
  lastTickTime = performance.now();
  accumulator = 0;  // Reset accumulator on start
  mainLoopId = requestAnimationFrame(mainLoop);
}

function stopScheduler() {
  if (mainLoopId) {
    cancelAnimationFrame(mainLoopId);
    mainLoopId = null;
    accumulator = 0;  // Reset accumulator on stop
    structuredLog('INFO', 'Scheduler stopped.');
  }
}

export function initializeScheduler(appEngine) {
  engine = appEngine;
  engine.registerCommandHandler('startProcessing', startScheduler);
  engine.registerCommandHandler('stopProcessing', stopScheduler);
}