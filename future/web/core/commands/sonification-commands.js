// filepath: future/web/core/commands/sonification-commands.js

import { playCues } from '../../audio/audio-processor.js';
import { structuredLog } from '../../utils/logging.js';

/**
 * Registers the command handler that bridges the video and audio pipelines.
 * @param {object} engine - The main application engine instance.
 */
export function registerSonificationCommands(engine) {
  if (!engine || typeof engine.registerCommandHandler !== 'function') {
    structuredLog('ERROR', 'sonification-commands: Cannot register, invalid engine provided.');
    return;
  }

  engine.registerCommandHandler('audioCuesReady', (payload) => {
    if (payload && Array.isArray(payload.cues)) {
      // This is the bridge: call the audio API with the data from video.
      playCues(payload.cues);
    } else {
      structuredLog('WARN', 'sonification-handler: received audioCuesReady event with invalid or missing cues payload.', { payload });
    }
  });
}