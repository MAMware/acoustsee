// filepath: future/web/core/commands/sonification-commands.js
// MODIFIED - Calculates duration and dispatches benchmark log. /R24925: Validate and clarify

import { playCues } from '../../audio/audio-processor.js';
import { structuredLog } from '../../utils/logging.js';

/**
 * Registers the command handler that bridges the video and audio pipelines.
 * @param {object} engine - The main application engine instance. //R24925: Validate claims
 */
export function registerSonificationCommands(engine) {
  if (!engine || typeof engine.registerCommandHandler !== 'function') {
    structuredLog('ERROR', 'sonification-commands: Cannot register, invalid engine provided.');
    return;
  }

  engine.registerCommandHandler('audioCuesReady', (payload) => {
    // --- BENCHMARK CALCULATION ---
    const endTime = performance.now();
    if (payload.startTime) {
      const totalDuration = endTime - payload.startTime;
      // Dispatch a new event with the measurement for the diagnostics system.
      engine.dispatch('logFrameBenchmark', {
        frameId: payload.frameId,
        duration: totalDuration
      });
    }
    // --- END BENCHMARK ---

    if (payload && Array.isArray(payload.cues)) {
      // This is the bridge: call the audio API with the data from video.
      playCues(payload.cues);
    } else {
      structuredLog('WARN', 'sonification-handler: received audioCuesReady with invalid cues payload.', { payload });
    }
  });
}