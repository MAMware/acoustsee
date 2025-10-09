// filepath: future/web/core/commands/sonification-commands.js
// MODIFIED - Calculates duration and dispatches benchmark log. /R24925: Validate and clarify

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
    const endTime = performance.now();

    if (payload.startTime) {
      const totalDuration = endTime - payload.startTime;
      engine.dispatch('logFrameBenchmark', {
        frameId: payload.frameId,
        duration: totalDuration
      });
    }

    const cuesToProcess = payload.cues;

    if (!cuesToProcess || !Array.isArray(cuesToProcess) || cuesToProcess.length === 0) {
      return; // Nothing to play
    }
    
    // This is the bridge: call the audio API with the standardized data. Use
    // the initialized API attached to the engine to ensure we use the active
    // AudioContext and oscillator pool.
    if (engine.audioApi && typeof engine.audioApi.playCues === 'function') {
      engine.audioApi.playCues(cuesToProcess);
    } else {
      structuredLog('ERROR', 'Audio API not initialized on engine. Cannot play cues.');
    }
  });
}