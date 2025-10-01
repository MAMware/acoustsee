// File: web/core/commands/mode-commands.js

import { structuredLog } from '../../utils/logging.js';

/**
 * Register mode-related commands with the engine.
 */
export function registerModeCommands(engine) {
  const { registerCommandHandler } = engine;
  
  registerCommandHandler('setMode', ({ payload }) => {
    const { mode } = payload;
    const validModes = ['flow', 'focus'];
    if (!validModes.includes(mode)) {
      structuredLog('WARN', 'Invalid mode requested', { mode, validModes });
      return;
    }
    
    const currentState = engine.getState();
    if (currentState.currentMode === mode) {
      structuredLog('DEBUG', 'Mode already set', { mode });
      return;
    }
    
    structuredLog('INFO', 'Switching operating mode', { 
      from: currentState.currentMode, 
      to: mode 
    });
    
    engine.setState({ currentMode: mode });
  });
  
  structuredLog('DEBUG', 'Mode commands registered');
}