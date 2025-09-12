// File: web/core/commands/debug-commands.js
// Handles commands related to debugging and diagnostics, typically triggered from the debug UI.

import { structuredLog } from '../../utils/logging.js';

export function registerDebugCommands(engine) {
  const { registerCommandHandler, dispatch, getState } = engine;

  // Helper to play a short test cue for debugging audio
  registerCommandHandler('playTestNote', async ({ state: s, payload }) => {
    try {
      // Attempt to resume AudioContext before playing, as it might be suspended.
      try {
        const { resumeAudioContext } = await import('../../audio/audio-processor.js');
        const resumeRes = await resumeAudioContext();
        if (!resumeRes || !resumeRes.ok) {
          structuredLog('WARN', 'playTestNote: audio context not running', { resumeRes });
        }
      } catch (e) {
        structuredLog('WARN', 'playTestNote: resumeAudioContext attempt failed', { error: e?.message || String(e) });
      }

  const cues = [{ id: 'test-note', pitch: payload?.pitch || 440, pan: 0, intensity: 1.0, objectType: 'default_motion', position: { x: 0 } }];
      await dispatch('audioPlayCues', { cues });
      return { ok: true };
    } catch (e) {
      structuredLog('WARN', 'playTestNote failed', { error: e?.message });
      return { ok: false, error: e?.message };
    }
  });

  // Handler to resume audio context from UI
  registerCommandHandler('resumeAudio', async () => {
    try {
      structuredLog('INFO', 'resumeAudio: request received');
      const { resumeAudioContext } = await import('../../audio/audio-processor.js');
      const res = await resumeAudioContext();
      structuredLog(res.ok ? 'INFO' : 'WARN', 'resumeAudio: result', { ok: !!res.ok, state: res.state, error: res.error });
      if (!res.ok) structuredLog('WARN', 'resumeAudio failed', { error: res.error });
      return res;
    } catch (e) {
      structuredLog('ERROR', 'resumeAudio handler failed', { error: e?.message || String(e) });
      return { ok: false, error: e?.message || String(e) };
    }
  });

  // --- NEW HANDLER ---
  // Provide a simple inspectState command that returns the engine state.
  registerCommandHandler('inspectState', async () => {
    try {
      const state = typeof getState === 'function' ? getState() : null;
      return { ok: true, result: state };
    } catch (e) {
      structuredLog('WARN', 'inspectState failed', { error: e?.message || String(e) });
      return { ok: false, error: e?.message || String(e) };
    }
  });
}
