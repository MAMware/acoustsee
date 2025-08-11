// web/core/handlers/audio-handlers.js

import { settings } from '../state.js';
import { initializeMicAudio, resizeOscillatorPool } from '../../audio/audio-processor.js';
import { structuredLog } from '../../utils/logging.js';
import { getText } from '../../utils/utils.js';

export const audioHandlers = {
  playNote: ({ note, context }) => {
    // TODO: wire up note synthesis logic (e.g., playAudio)
    structuredLog('DEBUG', 'audioHandlers.playNote called', { note });
  },

  applyHRTF: ({ position, context }) => {
    // TODO: apply HRTF using PannerNode or hrtf-processor
    structuredLog('DEBUG', 'audioHandlers.applyHRTF called', { position });
  }
};
