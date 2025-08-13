// settings-handlers.js
// Handles reading/writing settings from state and localStorage

import { settings, setSettings } from '../state.js';
import { structuredLog } from '../../utils/logging.js';

/**
 * Loads settings from localStorage (if available) and merges with current state.
 * Returns a promise for async usage.
 */
export async function loadConfig(context) {
  try {
    const stored = localStorage.getItem('acoustsee-settings');
    let loaded = stored ? JSON.parse(stored) : {};
    // Merge loaded settings into current state
    setSettings({ ...settings, ...loaded });
    structuredLog('INFO', 'settingsHandlers.loadConfig: Loaded settings', { loaded });
    return loaded;
  } catch (err) {
    structuredLog('ERROR', 'settingsHandlers.loadConfig: Failed to load', { error: err.message });
    throw err;
  }
}

/**
 * Saves new settings to localStorage and updates state.
 * Returns a promise for async usage.
 */
export async function saveConfig(newSettings, context) {
  try {
    setSettings(newSettings);
    localStorage.setItem('acoustsee-settings', JSON.stringify(newSettings));
    structuredLog('INFO', 'settingsHandlers.saveConfig: Saved settings', { newSettings });
    return true;
  } catch (err) {
    structuredLog('ERROR', 'settingsHandlers.saveConfig: Failed to save', { error: err.message });
    throw err;
  }
}
