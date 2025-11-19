// File: web/core/commands/audio-commands.js
// Registers audio-related command handlers for the engine.

import { structuredLog } from '../../utils/logging.js';
import logger from '../../utils/logging.js';
// Do not import audio-processor directly; use engine.audioApi provided at runtime

export function registerAudioCommands(engine) {
  const { registerCommandHandler } = engine;

  // Play cues handler - invokes audio subsystem to render cues
  registerCommandHandler('audioPlayCues', ({ state: s, payload, metadata }) => {
    const traceId = metadata?.traceId;
    try {
      const cues = payload?.cues || [];
      if (!Array.isArray(cues) || cues.length === 0) return { played: false };
      
      // CRITICAL: Audio system is non-negotiable for this application
      // The entire purpose is visual-to-audio conversion. If audio isn't available, we must fail loudly.
      const api = engine.audioApi;
      if (!api) {
        // Audio system not initialized - this is a critical failure, not graceful degradation
        structuredLog('ERROR', 'audioPlayCues FAILED: Audio system not initialized. App requires audio to function.', 
          { cueCount: cues.length, audioApiState: engine.audioApi }, 
          { traceId }
        );
        // Return error state so caller knows audio functionality is unavailable
        return { played: false, reason: 'AUDIO_SYSTEM_NOT_READY', critical: true };
      }
      
      if (typeof api.playCues !== 'function') {
        structuredLog('ERROR', 'audioPlayCues FAILED: playCues method not available on audioApi', 
          { hasApi: !!api, methodExists: typeof api.playCues }, 
          { traceId }
        );
        return { played: false, reason: 'AUDIO_METHOD_NOT_AVAILABLE', critical: true };
      }
      
      // Audio system is ready - proceed with playback
      api.playCues(cues);
      return { played: true, count: cues.length };
      
    } catch (e) {
      structuredLog('ERROR', 'audioPlayCues FAILED with exception', 
        { error: e?.message || String(e), type: e?.constructor?.name }, 
        { traceId }
      );
      try { logger.logError && logger.logError(e); } catch (_) {}
      return { played: false, reason: 'AUDIO_EXCEPTION', critical: true };
    }
  });
}
