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
    
    // Extract the actual payload from nested structure if needed
    let actualPayload = payload;
    if (payload.payload && !payload.cues) {
      actualPayload = payload.payload;
    }
    
    if (actualPayload.startTime) {
      const totalDuration = endTime - actualPayload.startTime;
      // Dispatch a new event with the measurement for the diagnostics system.
      engine.dispatch('logFrameBenchmark', {
        frameId: actualPayload.frameId,
        duration: totalDuration
      });
    }
    // --- END BENCHMARK ---

    // Handle both Flow mode (simple cues array) and Focus mode (complex payload)
    let cuesToProcess = null;
    
    if (Array.isArray(actualPayload.cues)) {
      // Flow mode: simple cues array
      cuesToProcess = actualPayload.cues;
      // Reduced logging frequency - only log every 30th frame to reduce performance impact
      if (actualPayload.frameId % 30 === 0) {
        structuredLog('DEBUG', 'Sonification: Processing Flow mode cues', { 
          cuesCount: actualPayload.cues.length, 
          frameId: actualPayload.frameId 
        });
      }
    } else if (actualPayload.primaryCue && actualPayload.secondaryCues) {
      // Focus mode: complex payload with primary and secondary cues
      cuesToProcess = { primaryCue: actualPayload.primaryCue, secondaryCues: actualPayload.secondaryCues };
      // Reduced logging frequency - only log every 30th frame to reduce performance impact
      if (actualPayload.frameId % 30 === 0) {
        structuredLog('DEBUG', 'Sonification: Processing Focus mode cues', { 
          primaryCue: actualPayload.primaryCue,
          secondaryCuesCount: actualPayload.secondaryCues.length,
          frameId: actualPayload.frameId 
        });
      }
    } else {
      structuredLog('WARN', 'sonification-handler: received audioCuesReady with invalid payload structure.', { 
        payload: actualPayload,
        originalPayload: payload 
      });
      return;
    }

    if (cuesToProcess) {
      // This is the bridge: call the audio API with the data from video.
      playCues(cuesToProcess);
    }
  });
}