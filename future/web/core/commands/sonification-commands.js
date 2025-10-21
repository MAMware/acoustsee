// filepath: future/web/core/commands/sonification-commands.js
// MODIFIED - Calculates duration and dispatches benchmark log. /R24925: Validate and clarify

import { structuredLog } from '../../utils/logging.js';

/**
 * Registers the command handler that bridges the video and audio pipelines.
 * @param {object} engine - The main application engine instance. //R24925: Validate claims
 */
export function registerSonificationCommands(engine) {
  structuredLog('INFO', 'SONIFICATION-COMMANDS: registerSonificationCommands function has been entered.');
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
    structuredLog('DEBUG', 'sonification: audioCuesReady handler received', { cuesCount: cuesToProcess ? cuesToProcess.length : 'undefined', isArray: Array.isArray(cuesToProcess) }, false, Math.random() < 0.1);

    if (!cuesToProcess || !Array.isArray(cuesToProcess) || cuesToProcess.length === 0) {
      structuredLog('DEBUG', 'sonification: No cues to process', { cuesToProcess: !!cuesToProcess, isArray: Array.isArray(cuesToProcess), length: cuesToProcess?.length }, false, Math.random() < 0.1);
      return; // Nothing to play
    }
    
    // This is the bridge: call the audio API with the standardized data. Use
    // the initialized API attached to the engine to ensure we use the active
    // AudioContext and oscillator pool.
    if (engine.audioApi && typeof engine.audioApi.playCues === 'function') {
      structuredLog('DEBUG', 'audioCuesReady -> invoking playCues', { hasAudioApi: !!engine.audioApi, playCuesIsFunction: typeof engine.audioApi.playCues, cuesCount: cuesToProcess.length }, false, Math.random() < 0.1);
      engine.audioApi.playCues(cuesToProcess);
    } else {
      structuredLog('ERROR', 'Audio API not initialized on engine. Cannot play cues.', { hasAudioApi: !!engine.audioApi, hasPlayCues: engine.audioApi ? typeof engine.audioApi.playCues : 'N/A' });
    }
  });
}