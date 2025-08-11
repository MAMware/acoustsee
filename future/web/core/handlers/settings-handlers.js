// web/core/handlers/settings-handlers.js

import { settings } from '../state.js';
import { structuredLog } from '../../utils/logging.js';

export const settingsHandlers = {
  loadConfig: ({ context }) => {
    // TODO: read settings from state/localStorage
    structuredLog('DEBUG', 'settingsHandlers.loadConfig called');
  },

  saveConfig: ({ newSettings, context }) => {
    // TODO: write newSettings to state/localStorage
    structuredLog('DEBUG', 'settingsHandlers.saveConfig called', { newSettings });
  }
};
