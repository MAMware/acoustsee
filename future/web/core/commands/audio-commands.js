// File: web/core/commands/audio-commands.js
// Registers audio-related command handlers for the engine.

import { structuredLog } from '../../utils/logging.js';
import logger from '../../utils/logging.js';
import * as audioProcessor from '../../audio/audio-processor.js';

export function registerAudioCommands(engine) {
  const { registerCommandHandler } = engine;

  // Play cues handler - invokes audio subsystem to render cues
  registerCommandHandler('audioPlayCues', async ({ state: s, payload }) => {
    try {
      const cues = payload?.cues || [];
      if (!Array.isArray(cues) || cues.length === 0) return { played: false };
      await audioProcessor.playCues(cues);
      return { played: true, count: cues.length };
    } catch (e) {
      structuredLog('WARN', 'audioPlayCues handler failed', { error: e?.message || String(e) });
      try { logger.logError && logger.logError(e); } catch (_) {}
      return { played: false };
    }
  });
}
