// Shared constants for the acoustsee project
export const TTS_COOLDOWN_MS = 3000;
export const DEFAULT_FPS = 20;
export const FALLBACK_LANGUAGE = 'en-US';
export const DEFAULT_LOG_LEVEL = 'INFO'; 
export const LOG_LEVELS = {
  DEBUG: 0,
  INFO: 1,
  WARN: 2,
  ERROR: 3
};

// Version constants for different modules
export const BUILD_VERSION = '0.9.5';
export const AUDIO_VERSION = '0.8.4-improvedUnlock';
export const VIDEO_VERSION = '0.8.4-flowOrchestration';
export const UI_VERSION = '0.8.4-missingTranslationsGUI';
export const LANGUAGES_VERSION = '0.4.4-enhancedI18N+';
export const UTILS_VERSION = '0.9.8-eventBus';

// Motion detection algorithm parameters (fast-motion-worker.js)
// These constants control the optical flow and motion region detection behavior
export const MOTION_DETECTOR_CONFIG = {
  // Spatial sampling step: 1 = every pixel (high quality, slow), 6 = every 6th pixel (low latency)
  STEP: 6,
  // Motion threshold: pixel intensity difference to trigger detection (lower = more sensitive)
  THRESHOLD: 20,
  // Maximum number of distinct motion regions to track per frame
  MAX_REGIONS: 64,
  // Window size for adaptive motion normalization (in frames at video FPS)
  WINDOW_SIZE: 5
};

// Build information (auto-injected by scripts/codegen/inject-build-info.js)
export const BUILD_COMMIT = '35308e3';
export const BUILD_BRANCH = 'v0.9.7.4-devPanelOverhaul';
export const BUILD_TIMESTAMP = '2025-12-02T12:59:06.998Z';

