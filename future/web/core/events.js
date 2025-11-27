/**
 * @fileoverview Centralized constants for event names and command names.
 * Prevents "magic strings" and ensures consistency across the application.
 */

export const EVENTS = {
  AUDIO: {
    CUES_READY: 'audioCuesReady',
    PLAY_CUES: 'audioPlayCues',
  },
  PERFORMANCE: {
    LOG_FRAME_BENCHMARK: 'logFrameBenchmark',
  },
  MEDIA: {
    START_PROCESSING: 'startProcessing',
    STOP_PROCESSING: 'stopProcessing',
    TOGGLE_PROCESSING: 'toggleProcessing',
    INITIALIZE_VIDEO_PIPELINE: 'initializeVideoPipeline',
    UPDATE_VIDEO_WORKER_DEBUG_CONFIG: 'updateVideoWorkerDebugConfig',
    TOGGLE_CAMERA: 'toggleCamera',
    TOGGLE_MICROPHONE: 'toggleMicrophone',
  },
  SETTINGS: {
    SET_GRID_TYPE: 'setGridType',
    SET_SYNTH_ENGINE: 'setSynthEngine',
    SET_MAX_NOTES: 'setMaxNotes',
    SET_MOTION_THRESHOLD: 'setMotionThreshold',
  },
  UI: {
    ANNOUNCE_MESSAGE: 'announceMessage',
  }
};
