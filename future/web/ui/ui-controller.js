import { setupAudioControls } from '../audio/audio-controls.js';
import { setupUISettings } from './ui-settings.js';
import { setupCleanupManager } from './cleanup-manager.js';
// Importa los módulos de configuración cuando los tengas
// import { setupSaveSettings, setupLoadSettings } from './settings-manager.js';

export function setupUIController({ dispatchEvent, DOM }) {
  console.log('setupUIController: Starting setup');
  setupAudioControls({ dispatchEvent, DOM });
  setupUISettings({ dispatchEvent, DOM });
  setupCleanupManager();

  // Inicialización futura para guardar y leer configuraciones
  // setupSaveSettings({ dispatchEvent, DOM });
  // setupLoadSettings({ dispatchEvent, DOM });

  console.log('setupUIController: Setup complete');
}