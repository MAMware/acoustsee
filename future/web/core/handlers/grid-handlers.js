// File: web/core/handlers/grid-handlers.js

import { settings } from '../state.js';
import { dispatchEvent } from '../dispatcher.js';
import { structuredLog } from '../../utils/logging.js';
import { getText, speakText } from '../../utils/utils.js';
import { resizeOscillatorPool } from '../../audio/audio-processor.js';

/**
 * Cycles to the next available grid in the settings.
 */
export async function toggleGrid() {
  try {
    const { availableGrids } = settings;
    if (availableGrids.length === 0) {
      structuredLog('WARN', 'toggleGrid: No available grids to toggle.');
      return;
    }
    
    const currentIndex = availableGrids.findIndex(g => g.id === settings.gridType);
    const nextIndex = (currentIndex + 1) % availableGrids.length;
    const newGrid = availableGrids[nextIndex];
    settings.gridType = newGrid.id;

    // We still need to resize the oscillator pool based on the new grid's requirements.
    // However, this should eventually be fully managed by the audio system based on the
    // global `maxNotes` setting, making this line unnecessary in the future.
    if (newGrid.maxNotes) {
        resizeOscillatorPool(newGrid.maxNotes);
    }

    const msg = await getText('button1.tts.gridSelect', { state: settings.gridType });
    speakText(msg);

  } catch (err) {
    structuredLog('ERROR', 'toggleGrid error', { message: err.message, stack: err.stack });
  } finally {
    dispatchEvent('updateUI', { 
      settingsMode: settings.isSettingsMode, 
      streamActive: !!settings.stream, 
      micActive: !!settings.micStream 
    });
  }
}