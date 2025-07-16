// future/web/ui-controller.js
import { setupAudioControls } from './audio-controls.js';
import { setupUISettings } from './ui-settings.js';
import { setupCleanupManager } from './cleanup-manager.js';

export function setupUIController({ dispatchEvent, DOM }) {
  console.log('setupUIController: Starting setup');
  setupAudioControls({ dispatchEvent, DOM });
  setupUISettings({ dispatchEvent, DOM });
  setupCleanupManager();
  console.log('setupUIController: Setup complete');
}
