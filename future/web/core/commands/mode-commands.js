// File: web/core/commands/mode-commands.js

import { structuredLog } from '../../utils/logging.js';

/**
 * Register mode-related commands with the engine.
 */
export function registerModeCommands(engine) {
  engine.registerCommand('setMode', ({ mode }) => {
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