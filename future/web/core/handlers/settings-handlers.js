// settings-handlers.js
// Handles reading/writing settings from state and localStorage

import { settings, setSettings, loadConfigs, saveConfigs } from '../state.js';
import { structuredLog } from '../../utils/logging.js';

/**
 * Loads user preferences from localStorage using the new loadConfigs function.
 * Returns a promise for async usage.
 */
export async function loadConfig(context) {
  try {
    loadConfigs(); // Use the new loadConfigs function from state.js
    structuredLog('INFO', 'settingsHandlers.loadConfig: User preferences loaded');
    return settings;
  } catch (err) {
    structuredLog('ERROR', 'settingsHandlers.loadConfig: Failed to load', { error: err.message });
    throw err;
  }
}

/**
 * Saves user preferences to localStorage using the new saveConfigs function.
 * Returns a promise for async usage.
 */
export async function saveConfig(newSettings, context) {
  try {
    if (newSettings) {
      setSettings(newSettings);
    }
    saveConfigs(); // Use the new saveConfigs function from state.js
    structuredLog('INFO', 'settingsHandlers.saveConfig: User preferences saved');
    return true;
  } catch (err) {
    structuredLog('ERROR', 'settingsHandlers.saveConfig: Failed to save', { error: err.message });
    throw err;
  }
}
