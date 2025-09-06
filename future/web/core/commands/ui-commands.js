// File: web/core/commands/ui-commands.js
// Handles general UI state commands, like toggling modes.
// MAMware review R250905: IDK if this file is needed, it has only 2 commands that i feel they could be resumed better consolidating into another file

import { structuredLog } from '../../utils/logging.js';
import { getText, speakText } from '../../utils/utils.js';

export function registerUICommands(engine) {
  const { registerCommandHandler } = engine;

  registerCommandHandler('toggleSettingsMode', async ({ state: s }) => {
    s.isSettingsMode = !s.isSettingsMode;
    // Announce the change as a side effect
    try {
  const key = s.isSettingsMode ? 'button6.tts.settingsToggle.on' : 'button6.tts.settingsToggle.off'; //R250905: the name "button6" is a legacy that should be improved
  // prefer new announce keys when present
  const preferredKey = s.isSettingsMode ? 'announce.settingsMode' : 'announce.settingsMode.off';
  const legacyKey = key;
  const msg = (await getText(preferredKey).catch(() => null)) || (await getText(legacyKey).catch(() => null));
      if (msg) speakText(msg);
    } catch (e) {
      structuredLog('WARN', 'announceSettingsMode failed during toggle', { error: e?.message });
    }
    return { isSettingsMode: s.isSettingsMode };
  });

  registerCommandHandler('announceSettingsMode', async ({ state: s }) => {
    try {
      const key = s.isSettingsMode ? 'button6.tts.settingsToggle.on' : 'button6.tts.settingsToggle.off';
      const msg = await getText(key).catch(() => null);
      if (msg) speakText(msg);
    } catch (e) {
      structuredLog('WARN', 'announceSettingsMode failed', { error: e?.message });
    }
  });
}
