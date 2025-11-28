import { structuredLog, shouldSample } from '../utils/logging.js';
import { EVENTS } from '../core/events.js';

/**
 * AudioRouter - Decouples Video Pipeline from Audio Engine (ADR-0006)
 *
 * Responsibilities:
 * 1. Receive raw analysis data from FrameConductor
 * 2. Apply sonification mapping (Data -> Cues)
 * 3. Dispatch standardized events to the Engine
 */
export class AudioRouter {
  constructor(engine) {
    this.engine = engine;
    this.payloadLimits = this._getPayloadLimits();
  }

  /**
   * Process analysis results and dispatch audio cues
   * @param {Object} result - The result from FrameConductor (flow or focus)
   * @param {Object} state - Current engine state
   * @returns {Object} Telemetry about what was dispatched { cueCount }
   */
  route(result, state) {
    if (!this.engine) return { cueCount: 0 };

    let cues = [];
    let dispatchPayload = null;

    // 1. Extract Cues based on Mode
    if (state.currentMode === 'flow') {
      cues = this._processFlowMode(result, state);
      
      // Prepare payload
      if (cues.length > 0) {
        dispatchPayload = { 
            cues, 
            panIntensity: result.panIntensity || { pan: 0, intensity: 0 } 
        };
      } else {
        // Empty payload with pan/intensity for UI feedback
        dispatchPayload = { 
            cues: [], 
            panIntensity: result.panIntensity || { pan: 0, intensity: 0 } 
        };
      }
    } else if (state.currentMode === 'focus') {
      // Focus mode logic (pass-through for now, based on frame-processor)
      cues = result.objects || [];
      dispatchPayload = {
        cues,
        motion: result,
        specialists: result.specialists
      };
    }

    // 2. Dispatch to Engine
    if (dispatchPayload) {
        this._dispatch(dispatchPayload, result.frameId, result.startTime, state);
    }

    return { cueCount: cues.length };
  }

  _processFlowMode(result, state) {
    // If result already has cues (from grid mapping), use them
    if (result.cues && result.cues.length > 0) {
        return result.cues;
    }

    // Otherwise, generate from pan/intensity (Audio Params)
    if (result.panIntensity) {
        return this._createCuesFromAudioParams(result.panIntensity, state);
    }

    return [];
  }

  _createCuesFromAudioParams(params, state) {
    const baseFreq = state.baseFrequency || 440;
    const { pan, intensity } = params;

    // Normalize intensity
    const normalizedIntensity = intensity > 1 ? intensity / 255 : intensity;
    const threshold = 0.001;
    
    if (normalizedIntensity < threshold) {
      return [];
    }
    
    const panClamped = Math.max(-1, Math.min(1, pan || 0));
    const semitoneRange = (state && state.semitoneRange) || 12;
    const semitones = panClamped * semitoneRange;
    const pitch = baseFreq * Math.pow(2, semitones / 12);

    const cue = {
      objectType: 'flow_motion',
      pitch,
      pan: panClamped,
      intensity: Math.max(0, Math.min(1, normalizedIntensity)),
      position: {
        x: panClamped,
        y: 0.5,
        z: 0
      }
    };

    return [cue];
  }

  _dispatch(payload, frameId, startTime, state) {
    const eventName = EVENTS.AUDIO.CUES_READY;
    
    // Apply capping
    const cappedPayload = this._capHighFreqPayload(eventName, {
        ...payload,
        frameId,
        startTime
    });

    // CRITICAL DEBUG: Log cue dispatch with full context
    const cueCount = payload.cues ? payload.cues.length : 0;
    const isArray = Array.isArray(payload.cues);
    structuredLog('INFO', 'AudioRouter: Dispatching audioCuesReady', { 
        cueCount,
        isArray,
        hasCues: !!payload.cues,
        mode: state.currentMode,
        hasPanIntensity: !!payload.panIntensity
    });

    // Log cue details if any exist
    if (cueCount > 0) {
        const cueTypes = {};
        payload.cues.forEach(c => {
            const type = c.objectType || 'unknown';
            cueTypes[type] = (cueTypes[type] || 0) + 1;
        });
        structuredLog('DEBUG', 'AudioRouter: Cue composition', { 
            cueTypes,
            firstCue: payload.cues[0],
            frameId,
            cappedCount: cappedPayload.cues?.length || 0
        });
    }

    this.engine.dispatch(eventName, cappedPayload);

    // Fallback for legacy listeners
    try {
        this.engine.dispatch('audioPlayCues', { cues: payload.cues || [] });
    } catch (e) {
        // Ignore fallback errors
    }
  }

  _getPayloadLimits() {
    if (window.__audioSeeDebug?.payloadLimits) {
      return window.__audioSeeDebug.payloadLimits;
    }
    return {
      'audioCuesReady': { cues: 50, motionRegions: 100 },
      'flowCuesReady': { objects: 50, regions: 100 },
      'depthCuesReady': { depthRegions: 50 }
    };
  }

  _capHighFreqPayload(commandName, payload) {
    // Check dev panel override
    const shouldCap = window.__audioSeeDebug?.capHighFreqPayloads !== undefined 
        ? window.__audioSeeDebug.capHighFreqPayloads 
        : true;

    if (!shouldCap) return payload;
    
    const limits = this.payloadLimits[commandName];
    if (!limits) return payload;
    
    const capped = { ...payload };
    
    if (commandName === 'audioCuesReady') {
      if (limits.cues && Array.isArray(capped.cues)) {
        capped.cues = capped.cues.slice(0, limits.cues);
      }
      if (limits.motionRegions && capped.motion?.movingRegions) {
        capped.motion = { ...capped.motion };
        capped.motion.movingRegions = capped.motion.movingRegions.slice(0, limits.motionRegions);
      }
      capped.specialists = undefined;
    }
    
    return capped;
  }
}
