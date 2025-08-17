import { setupAudioControls } from '../audio/audio-controls.js';
import { setupVideoCapture } from '../video/video-capture.js';
import { setupDebugPanelLongPress } from './debug-panel.js';
// Importa los módulos de configuración cuando los tengas
// import { setupSaveSettings, setupLoadSettings } from './settings-manager.js';

export function setupUIController({ DOM }) {
  console.log('setupUIController: Starting setup');
  // Wire audio controls (these will use DOM.audioManager or create their own)
  setupAudioControls({ dispatchEvent: (evName, payload) => {
    try { const d = (typeof window !== 'undefined' && window.getDispatchEvent) ? window.getDispatchEvent() : null; if (typeof d === 'function') d(evName, payload); } catch (e) {}
  }, DOM });
  // Enable debug panel long press on button6
  setupDebugPanelLongPress(DOM);

  // Inicialización futura para guardar y leer configuraciones
  // setupSaveSettings({ dispatchEvent, DOM });
  // setupLoadSettings({ dispatchEvent, DOM });

  console.log('setupUIController: Setup complete');
}