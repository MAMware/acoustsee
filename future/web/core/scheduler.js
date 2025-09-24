// filepath: future/web/core/scheduler.js
// NEW FILE NICE AND CLEAN

import { structuredLog } from '../utils/logging.js';

let engine = null;
let mainLoopId = null;
let lastTickTime = 0;

function mainLoop(timestamp) {
  if (!mainLoopId) return; // Handle stop case
  const state = engine.getState();
  if (!state.isProcessing) {
    stopScheduler();
    return;
  }

  // Use the updateInterval from state to decide when to tick.
  const interval = state.updateInterval || 100;
  if (timestamp - lastTickTime >= interval) {
    lastTickTime = timestamp;
    engine.dispatch('diagnosticTick');
  }

  requestAnimationFrame(mainLoop);
}

function startScheduler() {
  if (mainLoopId) return;
  structuredLog('INFO', 'Scheduler started.');
  lastTickTime = performance.now();
  mainLoopId = requestAnimationFrame(mainLoop);
}

function stopScheduler() {
  if (mainLoopId) {
    cancelAnimationFrame(mainLoopId);
    mainLoopId = null;
    structuredLog('INFO', 'Scheduler stopped.');
  }
}

export function initializeScheduler(appEngine) {
  engine = appEngine;
  engine.registerCommandHandler('startProcessing', startScheduler);
  engine.registerCommandHandler('stopProcessing', stopScheduler);
}