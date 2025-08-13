// web/core/handlers/audio-handlers.js

import { structuredLog } from '../../utils/logging.js';
import { availableEnginesData } from '../../audio/synths/available-synths.js';
import { resizeOscillatorPool, initializeAudio } from '../../audio/audio-processor.js';
import { settings } from '../state.js';
import { applyHRTF as hrtfSpatialize } from '../../audio/hrtf-processor.js';

export const audioHandlers = {
  playNote: async ({ note, synth, context }) => {
    // Use synth from state if not provided
    const synthId = synth || settings.selectedSynth || 'sine-wave';
    const engine = availableEnginesData.find(e => e.id === synthId);
    if (!engine) {
      structuredLog('ERROR', 'audioHandlers.playNote: Synth engine not found', { synth: synthId });
      return;
    }
    // Optionally resize oscillator pool before playing
    if (settings.maxNotes) resizeOscillatorPool(settings.maxNotes);
    // Optionally initialize audio context
    if (!context) {
      context = await initializeAudio();
    }
    // Dynamic import of synth engine module
    try {
      const modulePath = `../../audio/synths/${engine.id}.js`;
      const synthModule = await import(modulePath);
      // Assume exported play function is named play{EngineId}
      const playFnName = Object.keys(synthModule).find(fn => fn.startsWith('play'));
      if (playFnName && typeof synthModule[playFnName] === 'function') {
        synthModule[playFnName]([note]);
        structuredLog('DEBUG', 'audioHandlers.playNote: Played note with engine', { synth: engine.id, note });
      } else {
        structuredLog('ERROR', 'audioHandlers.playNote: No play function found in module', { synth: engine.id });
      }
    } catch (err) {
      structuredLog('ERROR', 'audioHandlers.playNote: Dynamic import failed', { synth: engine.id, error: err.message });
    }
  },

  applyHRTF: ({ sourceNode, position, context }) => {
    // Only apply HRTF if enabled in state
    if (!settings.hrtfEnabled) {
      structuredLog('INFO', 'audioHandlers.applyHRTF: HRTF disabled in settings');
      return sourceNode;
    }
    if (!context || !sourceNode) {
      structuredLog('ERROR', 'audioHandlers.applyHRTF: Missing context or sourceNode');
      return null;
    }
    // Dynamic import for hrtf-processor (if you want to keep it agnostic)
    // Otherwise, use static import as before
    try {
      // Static import for now
      const panner = require('../../audio/hrtf-processor.js').applyHRTF(context, sourceNode, position);
      structuredLog('DEBUG', 'audioHandlers.applyHRTF: Applied HRTF', { position });
      return panner;
    } catch (err) {
      structuredLog('ERROR', 'audioHandlers.applyHRTF: Failed to apply HRTF', { error: err.message });
      return sourceNode;
    }
  }
};
