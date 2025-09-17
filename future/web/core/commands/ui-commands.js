// Shim: UI commands were consolidated into settings-commands.js. Re-export
// a compatible registration function so existing import sites continue to work.
export { registerSettingsCommands as registerUICommands } from './settings-commands.js';
