/**
 * Default Settings Facade for Testing
 * 
 * Provides minimal application settings object for module testing.
 * 
 * USE FOR:
 * - Providing default configuration to modules during tests
 * - Testing settings-dependent behavior
 * - Smoke testing modules that read settings
 * 
 * Modify these values to test different configuration scenarios.
 */

export const settings = {
  maxNotes: 16,
  motionThreshold: 20,
  enableFrameWorker: false,
  autoFPS: true,
  language: 'en-US'
};
