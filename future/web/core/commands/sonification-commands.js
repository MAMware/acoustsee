// filepath: future/web/core/commands/sonification-commands.js

import { getEngine } from '../context.js';
import { playCues } from '../../audio/audio-processor.js';
import { structuredLog } from '../../utils/logging.js';

/**
 * Registers the command handler that bridges the video and audio pipelines.
 * It listens for the 'audioCuesReady' event dispatched by the video orchestrator
 * and passes the generated cues to the audio conductor for playback.
 */
export function registerSonificationCommands() {
  const engine = getEngine();
  if (!engine) {
    structuredLog('ERROR', 'sonification-commands: Cannot register, engine not available.');
    return;
  }

  engine.registerCommandHandler('audioCuesReady', (payload) => {
    if (payload && Array.isArray(payload.cues)) {
      // This is the bridge: call the audio API with the data from video.
      playCues(payload.cues);
    } else {
      // Add a defensive log in case a malformed event is ever dispatched.
      structuredLog('WARN', 'sonification-handler: received audioCuesReady event with invalid or missing cues payload.', { payload });
    }
  });
}