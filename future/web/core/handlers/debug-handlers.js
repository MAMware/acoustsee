// web/core/handlers/debug-handlers.js

import { structuredLog } from '../../utils/logging.js';
import { getLogs } from '../state.js';

export const debugHandlers = {
  logEvent: ({ event, context }) => {
    structuredLog('DEBUG', 'debugHandlers.logEvent called', { event });
  },

  inspectState: ({ context }) => {
    getLogs().then(logs => {
      console.log('State logs:', logs);
    });
  }
};
