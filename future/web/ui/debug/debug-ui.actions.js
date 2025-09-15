// File: web/ui/debug/debug-ui.actions.js

import { createButton } from './debug-ui.controls.js';
import { getWorkerStats } from '../../debug/worker-monitor.js';
import { RingBuffer, makeThrottledRenderer, scaleCanvasForDPR, drawMultiSparkline } from './worker-charts.js';

// The function signature is now updated to accept the `panel` element.
export function createAndWireActions(panel, engine, DOM, skipDiagnostics) {
  // Instead of querying the whole document, we find the container within the provided panel.
  // This makes the function more modular and less prone to errors.
  const actionsContainer = panel.querySelector('.debug-actions-grid');
  if (!actionsContainer) {
    console.error('createAndWireActions: Could not find .debug-actions-grid container in the provided panel.');
    return; // Stop if the container doesn't exist.
  }
  
  const { getAudioDiagnostics, debugLog, settings } = engine; // Destructure from engine for clarity

  // --- All the button creation and wiring logic remains the same ---
  // It will correctly append buttons to the `actionsContainer` we just found.

  const startStopBtn = createButton('Start/Stop Processing');
  // ... (and all other buttons: emitTestNoteBtn, resumeAudioBtn, etc.)

  actionsContainer.append(startStopBtn, /* ... all other buttons ... */);

  startStopBtn.querySelector('button').addEventListener('click', async () => {
    // ... (event handler logic is unchanged)
  });

  // ... (all other event handler logic is unchanged)

  // --- The Video Preview and Worker Explorer logic also remains the same ---
  // They will correctly append their UI to the `actionsContainer`.
  
  try {
    const vp = document.createElement('div');
    // ... (video preview creation logic)
    actionsContainer.appendChild(vp);
  } catch (e) {}

  (function workerExplorer() {
    const explorerPanel = document.createElement('div');
    // ... (worker explorer creation logic)
    actionsContainer.append(explorerPanel); // It appends to the correct container
  })();

  return { startStopBtn, /* ... all other buttons ... */ };
}