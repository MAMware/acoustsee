// filepath: future/web/video/frame-processor.js
import { structuredLog, shouldSample } from '../utils/logging.js';
import { rgbaToY } from './videoframe-helper.js';
import { getGridConfig } from './grids/grid-config.js';
import { 
  executeCriticalOperation, 
  AccessibilityError, 
  showCriticalError 
} from '../utils/error-handling.js';
import { WorkerContract } from './workers/worker-contract.js';
import { FrameConductor } from './frame-conductor.js';

// ============================================================================
// HIGH-FREQUENCY PAYLOAD OPTIMIZATION (Event Bus Performance)
// ============================================================================
// Commands like 'audioCuesReady' emit large payloads (motion matrices, specialists).
// This causes bus overhead. Enable payload capping to reduce event size.
// Configurable from dev panel (window.__audioSeeDebug.capHighFreqPayloads).
// See EVENT_BUS_IMPLEMENTATION_AUDIT_ISSUES.md for details.

function shouldCapHighFreqPayloads() {
  // Check dev panel override first
  if (window.__audioSeeDebug?.capHighFreqPayloads !== undefined) {
    return window.__audioSeeDebug.capHighFreqPayloads;
  }
  // Default: enabled (safe, reduces bus load)
  return true;
}

function getPayloadLimits() {
  // Allow dev panel to customize limits at runtime
  if (window.__audioSeeDebug?.payloadLimits) {
    return window.__audioSeeDebug.payloadLimits;
  }
  // Default limits
  return {
    'audioCuesReady': { cues: 50, motionRegions: 100 },
    'flowCuesReady': { objects: 50, regions: 100 },
    'depthCuesReady': { depthRegions: 50 }
  };
}

function capHighFreqPayload(commandName, payload) {
  if (!shouldCapHighFreqPayloads()) return payload;
  
  const limits = getPayloadLimits()[commandName];
  if (!limits) return payload;  // No cap for this command
  
  const capped = { ...payload };
  
  switch (commandName) {
    case 'audioCuesReady':
      if (limits.cues && Array.isArray(capped.cues)) {
        capped.cues = capped.cues.slice(0, limits.cues);
      }
      if (limits.motionRegions && capped.motion?.movingRegions) {
        capped.motion = { ...capped.motion };
        capped.motion.movingRegions = capped.motion.movingRegions.slice(0, limits.motionRegions);
      }
      // Note: Don't send full specialists data to reduce payload size
      capped.specialists = undefined;
      break;
      
    case 'flowCuesReady':
      if (limits.objects && Array.isArray(capped.objects)) {
        capped.objects = capped.objects.slice(0, limits.objects);
      }
      // Optionally cap regions if present
      if (limits.regions && capped.regions) {
        capped.regions = capped.regions.slice(0, limits.regions);
      }
      break;
      
    case 'depthCuesReady':
      if (limits.depthRegions && capped.depthRegions) {
        capped.depthRegions = capped.depthRegions.slice(0, limits.depthRegions);
      }
      break;
  }
  
  return capped;
}

// --- Module State ---
let _config = {};
let frameProviderWorker = null;
let motionWorker = null;
let depthWorker = null;
let previousDepthPath = null; // Track depth computation path changes (used to avoid redundant reconfigurations)

// FrameConductor: Manifest-driven orchestrator for Flow/Focus/Hybrid modes
let frameConductor = null;
const DELTA_HISTOGRAM_BINS = 16;
const DELTA_STATS_FLUSH_INTERVAL = 120;
const PAN_MAX_DELTA = 2;
const INTENSITY_MAX_DELTA = 1;
const PAN_TINY_THRESHOLD = 0.005;
const INTENSITY_TINY_THRESHOLD = 0.01;

function createDeltaHistogramState() {
  return {
    pan: new Uint32Array(DELTA_HISTOGRAM_BINS),
    intensity: new Uint32Array(DELTA_HISTOGRAM_BINS),
    panPrev: null,
    intensityPrev: null,
    panZeroStreak: 0,
    intensityZeroStreak: 0,
    samples: 0,
    recentMeanPanDelta: 0,
    recentMeanIntensityDelta: 0,
    recentVarPanDelta: 0,
    recentVarIntensityDelta: 0,
    lastWindowResetTs: Date.now()
  };
}

function resetDeltaHistogramState() {
  deltaHistogramState = createDeltaHistogramState();
  deltaFramesSinceSnapshot = 0;
}

function bucketHistogram(bins, delta, maxDelta) {
  if (maxDelta <= 0) return;
  const normalized = Math.min(1, delta / maxDelta);
  const idx = Math.min(bins.length - 1, Math.floor(normalized * bins.length));
  bins[idx] = (bins[idx] || 0) + 1;
}

function createDeltaSnapshot(hist) {
  return {
    pan: Array.from(hist.pan),
    intensity: Array.from(hist.intensity),
    meanPanDelta: hist.recentMeanPanDelta,
    meanIntensityDelta: hist.recentMeanIntensityDelta,
    zeroPanStreak: hist.panZeroStreak,
    zeroIntensityStreak: hist.intensityZeroStreak,
    samples: hist.samples,
    lastWindowResetTs: hist.lastWindowResetTs
  };
}

function decayHistogram(hist) {
  for (let i = 0; i < hist.pan.length; i++) {
    hist.pan[i] = hist.pan[i] >>> 1;
    hist.intensity[i] = hist.intensity[i] >>> 1;
  }
  hist.samples = hist.samples >>> 1;
  hist.recentVarPanDelta *= 0.5;
  hist.recentVarIntensityDelta *= 0.5;
  hist.lastWindowResetTs = Date.now();
}

function updateDeltaHistogram(pan, intensity, stallStats) {
  if (!stallStats) return;
  const hist = deltaHistogramState;
  if (hist.panPrev === null) {
    hist.panPrev = pan;
    hist.intensityPrev = intensity;
    return;
  }

  const panDelta = Math.abs(pan - hist.panPrev);
  const intensityDelta = Math.abs(intensity - hist.intensityPrev);
  hist.panPrev = pan;
  hist.intensityPrev = intensity;

  bucketHistogram(hist.pan, panDelta, PAN_MAX_DELTA);
  bucketHistogram(hist.intensity, intensityDelta, INTENSITY_MAX_DELTA);

  hist.panZeroStreak = panDelta < PAN_TINY_THRESHOLD ? hist.panZeroStreak + 1 : 0;
  hist.intensityZeroStreak = intensityDelta < INTENSITY_TINY_THRESHOLD ? hist.intensityZeroStreak + 1 : 0;

  hist.samples++;
  if (hist.samples > 0) {
    const panDiff = panDelta - hist.recentMeanPanDelta;
    hist.recentMeanPanDelta += panDiff / hist.samples;
    hist.recentVarPanDelta += panDiff * (panDelta - hist.recentMeanPanDelta);

    const intensityDiff = intensityDelta - hist.recentMeanIntensityDelta;
    hist.recentMeanIntensityDelta += intensityDiff / hist.samples;
    hist.recentVarIntensityDelta += intensityDiff * (intensityDelta - hist.recentMeanIntensityDelta);
  }

  deltaFramesSinceSnapshot++;
  if (deltaFramesSinceSnapshot >= DELTA_STATS_FLUSH_INTERVAL) {
    deltaFramesSinceSnapshot = 0;
    stallStats.deltaSnapshot = createDeltaSnapshot(hist);
    if (hist.samples > 10000) {
      decayHistogram(hist);
    }
  }
}

let deltaHistogramState = createDeltaHistogramState();
let deltaFramesSinceSnapshot = 0;
// Stall watchdog interval reference
let stallWatchdogInterval = null;

// Current mode and grid config are derived from engine state, not stored locally
// This keeps frame-processor stateless for configuration

/**
 * Process frame using Flow mode worker chain via FrameConductor (Phase 3.1b)
 * Sequential processing: motion → grid → params → audio
 */
async function processFlowMode(frameData, width, height, state) {
  if (!frameConductor) {
    structuredLog('ERROR', 'FrameConductor not initialized', {});
    return { cues: [], panIntensity: { pan: 0, intensity: 0 } };
  }

  try {
    // Use FrameConductor for orchestration
    const result = await frameConductor.processFrame(frameData, width, height, state);
    
    // TEMPORARY DIAGNOSTIC: Direct console.log to see actual values R111125eb could eventBus be more appropriate? 
    console.log('[DIAGNOSTIC] result.result:', result.result);
    console.log('[DIAGNOSTIC] pan:', result.result?.pan, 'type:', typeof result.result?.pan);
    console.log('[DIAGNOSTIC] intensity:', result.result?.intensity, 'type:', typeof result.result?.intensity);
    
    // Extract motion regions from conductor result
    let cues = [];
    let panIntensity = { pan: 0, intensity: 0 };  // Initialize for calculation
    
    // CRITICAL FIX: The conductor chain (motion → grid → pan-mapper) produces {pan, intensity}
    // Use the final result directly instead of re-processing through grid.mapFunction R111125sp we could use this approach with some tweaks as a variant for the sonicPointer
    if (result.result && typeof result.result.pan === 'number' && typeof result.result.intensity === 'number') {
      panIntensity = {
        pan: result.result.pan,
        intensity: result.result.intensity
      };
      
      // Convert to cues for audio system
      cues = createCuesFromAudioParams(panIntensity, state);
      
      structuredLog('DEBUG', 'Flow mode: Using conductor pan/intensity', { 
        panIntensity,
        cuesCount: cues.length 
      }, false, shouldSample('cueGeneration'));
    }
    
    // Legacy fallback: If result has coords (motion worker only, no pan-mapper)  R111125sf
    // This path should rarely execute with proper FrameConductor chain
    const grid = _config.getCurrentGrid();
    if (cues.length === 0 && grid && grid.mapFunction && result.result?.coords?.length > 0) {
      // Convert result to movingRegions format that grids expect
      const movingRegions = [];
      const regions = result.result;
      for (let i = 0; i < regions.count && i < regions.coords.length / 2; i++) {
        movingRegions.push({
          x: regions.coords[i * 2],
          y: regions.coords[i * 2 + 1],
          intensity: regions.intens[i] || 0
        });
      }
      
      // Map via grid
      const gridOutput = grid.mapFunction(frameData, width, height, null, { movingRegions });
      if (gridOutput?.cues?.length > 0) {
        cues = gridOutput.cues;
        
        // Calculate panIntensity from the first cue (grid-normalized intensity)
        // This fixes the motion threshold bug: panIntensity was hardcoded to 0
        if (cues[0]) {
          panIntensity = {
            pan: cues[0].pan || 0,
            intensity: cues[0].intensity || 0  // Already normalized by grid (0.02-0.08 typical)
          };
        }
        
        structuredLog('DEBUG', 'Flow mode: Grid mapped motion to cues', { 
          gridId: grid.id, 
          cuesCount: cues.length, 
          motionRegionsCount: movingRegions.length,
          panIntensity 
        }, false, shouldSample('cueGeneration'));
      }
    }
    
    // Fallback
    if (cues.length === 0) {
      cues = createCuesFromAudioParams({ pan: 0, intensity: 0 }, state);
    }
    
    // CORE-15: Return telemetry along with cues for state update R151125C15ingest 
    return { 
      cues, 
      panIntensity,
      normalizationTelemetry: result.normalizationTelemetry 
    };
  } catch (error) {
    structuredLog('ERROR', 'processFlowMode error', { error: error.message });
    return { cues: [], panIntensity: { pan: 0, intensity: 0 } };
  }
}

/**
 * Convert audio parameters (pan, intensity) to audio cues
 */
function createCuesFromAudioParams(params, state) {
  try {
    const baseFreq = state.baseFrequency || 440;
    const { pan, intensity } = params;

    // If no motion, return empty cues
    // Fix: Normalize intensity for proper threshold comparison
    // - If intensity > 1: Assume uint8 range (0-255), normalize to 0-1
    // - If intensity <= 1: Assume already normalized (0-1)
    // - Threshold 0.001 works for normalized range (0.255 in uint8 = effectively zero)
    const normalizedIntensity = intensity > 1 ? intensity / 255 : intensity;
    const threshold = 0.001;
    
    if (normalizedIntensity === 0 || normalizedIntensity < threshold) {
      structuredLog('DEBUG', 'createCuesFromAudioParams: No motion (intensity below threshold)', // R111125hot what is structuredLog doing on a hot path, what about eventBus or even console.log?
        { rawIntensity: intensity, normalizedIntensity, threshold }, 
        false, shouldSample('cueGeneration'));
      return [];
    }
    
    structuredLog('DEBUG', 'createCuesFromAudioParams: Motion detected', // R111125hot what is structuredLog doing on a hot path, what about eventBus or even console.log?
      { intensity, normalizedIntensity, pan }, 
      false, shouldSample('cueGeneration'));

    // Create single cue with pan and intensity for Flow mode
    // Map pan -> pitch so motion position changes tone (Bug: previously pitch was constant) R111125warn this looks like a silent fallback that mocks the real purpose and could drive a fake happy path
    const panClamped = Math.max(-1, Math.min(1, pan || 0));
    // Allow configuration via state; default to 12 semitones (1 octave)
    const semitoneRange = (state && state.semitoneRange) || 12;
    const semitones = panClamped * semitoneRange; // -semitoneRange .. +semitoneRange
    const pitch = baseFreq * Math.pow(2, semitones / 12);

    const cue = {
      objectType: 'flow_motion',
      pitch,
      pan: panClamped, // R111125evo this would be the evolution to the use of pan-intensity-mapper.js but i have doubts about this approach, i dont really see why  rely on another worker for the pan intensity, instead anotherworker could be doing something more useful like helping to build a mesh of grids  
      intensity: Math.max(0, Math.min(1, normalizedIntensity)),
      position: {
        x: panClamped,
        y: 0.5, // R111125y is the y plane hardcoded? here where coul a octaver changer based on z plane momtion location trigger 
        z: 0
      }
    };

    // Small debug log so we can verify pitch changes in user logs
    structuredLog('DEBUG', 'createCuesFromAudioParams: Generated cue', { // R111125hot what is structuredLog doing on a hot path, what about eventBus or even console.log?
      pitch,
      semitones,
      pan: panClamped,
      intensity: cue.intensity
    }, false, shouldSample('cueGeneration'));

    return [cue];
  } catch (error) {
    structuredLog('WARN', 'createCuesFromAudioParams failed', { error: error.message });
    return [];
  }
}

/**
 * Process frame using FrameConductor (Phase 3.1b)
 * Replaces hardcoded Focus/Hybrid mode worker chain with manifest-driven orchestration
 * 
 * For Focus/Hybrid modes, delegates to frameConductor.processFrame() instead of
 * manually managing motionWorker and depthWorker. This simplifies code and makes
 * adding new workers faster (just update manifest, no code changes needed).
 */
async function processWithMotionWorker(frameData, width, height, state) {
  if (!frameConductor) {
    structuredLog('WARN', 'FrameConductor not initialized, returning empty results');
    return { movingRegions: [], textureGrid: [], objects: [], inferredBPM: 100 };
  }

  try {
    // Use FrameConductor for Focus/Hybrid orchestration (Phase 3.1b)
    // Phase 3.1b-Hotfix: Remove legacy format conversion — return conductor result directly
    const result = await frameConductor.processFrame(frameData, width, height, state);
    
    // Return conductor result directly (no legacy format conversion)
    const motionResults = result.result || { cues: [], textureGrid: [], objects: [], inferredBPM: 100 };
    
    // Dispatch state change events for compatibility with existing subscribers
    engine.dispatch('flowCuesReady', capHighFreqPayload('flowCuesReady', motionResults));
    if (motionResults.objects?.length > 0) {
      engine.dispatch('objectCuesReady', capHighFreqPayload('objectCuesReady', { objects: motionResults.objects }));
    }
    if (Math.abs(motionResults.inferredBPM - (state.bpm || 100)) > 5) {
      engine.dispatch('bpmUpdate', { bpm: motionResults.inferredBPM });
    }
    
    return motionResults;
  } catch (error) {
    structuredLog('ERROR', 'processWithMotionWorker error', { 
      error: error.message,
      mode: state.currentMode
    });
    return { movingRegions: [], textureGrid: [], objects: [], inferredBPM: 100 };
  }
}

/**
 * Simulates object detection based on motion results.
 * In Focus mode, this converts motion data into detected semantic objects.
 * 
 * @param {object} motionResults - Results from motion worker containing movingRegions, etc.
 * @returns {object} Object detection results with detectedObjects array
 */
async function simulateObjectDetection(motionResults = {}) {
  try {
    // If no semantic detection is enabled or no motion, return empty
    if (!motionResults.objects || motionResults.objects.length === 0) {
      return { detectedObjects: [] };
    }

    // In a real implementation, this would run an ML model (TensorFlow, etc.)
    // For now, we simulate by treating the first motion object as a detected object
    const detectedObjects = motionResults.objects.slice(0, 1).map((obj, idx) => ({
      id: `obj_${idx}`,
      label: obj.label || 'unknown_object',
      confidence: Math.min(1.0, obj.confidence || 0.7),
      position: obj.position || { x: 0, y: 0, z: 0 },
      boundingBox: obj.boundingBox || { x: 0, y: 0, width: 100, height: 100 }
    }));

    return { detectedObjects };
  } catch (e) {
    structuredLog('WARN', 'simulateObjectDetection failed', { error: e?.message || String(e) });
    return { detectedObjects: [] };
  }
}

/**
 * Simulates shape analysis for a detected object.
 * Provides additional shape metadata (texture, edges, corners) for grid mapping.
 * 
 * @param {object} detectedObject - A detected object from object detection
 * @returns {object} Shape analysis results
 */
async function simulateShapeAnalysis(detectedObject = {}) {
  try {
    if (!detectedObject.id) {
      return { 
        shapeType: 'unknown',
        edges: [],
        texture: [],
        movingRegions: [] 
      };
    }

    // In a real implementation, this would analyze pixel-level features
    // For now, we return a basic shape analysis structure
    return {
      shapeType: detectedObject.label || 'generic',
      confidence: detectedObject.confidence || 0.5,
      edges: [],
      texture: [],
      // Simulate some motion regions based on the object's bounding box
      movingRegions: [{
        x: detectedObject.position?.x || 0.5,
        y: detectedObject.position?.y || 0.5,
        intensity: (detectedObject.confidence || 0.7) * 100
      }]
    };
  } catch (e) {
    structuredLog('WARN', 'simulateShapeAnalysis failed', { error: e?.message || String(e) });
    return {
      shapeType: 'unknown',
      edges: [],
      texture: [],
      movingRegions: []
    };
  }
}

/**
 * Canvas-based fallback for video frame capture (no MediaStreamTrackProcessor required).
 * This runs frame capture in the main thread and processes frames through the audio pipeline.
 * Slower than MediaStreamTrackProcessor but works in all browsers (Firefox, Safari, iOS).
 * 
 * NOTE: Frame processing logic (Flow/Flow-legacy/Focus mode handling) is intentionally
 * duplicated from the worker-based handler in frameProviderWorker.onmessage. Both
 * implementations call the same core functions (processFlowMode, processWithMotionWorker)
 * so they produce identical results. The duplication keeps the fallback self-contained
 * and simplifies debugging.
 * 
 * @param {HTMLVideoElement} videoElement - The video element to capture from
 * @param {object} engine - The state engine
 * @returns {Promise<object>} Control interface { start, stop, dispose }
 */
async function initializeVideoCanvasFallback(videoElement, engine) {
  structuredLog('INFO', 'Using canvas-based video capture (fallback mode)');
  
  // CRITICAL FIX: Track canvas fallback in state for timeout adaptation
  if (engine?.state?.videoCapture) {
    engine.state.videoCapture.usingCanvas = true;
    engine.state.videoCapture.detectedAt = Date.now();
    structuredLog('DEBUG', 'Canvas fallback detected - state updated for timeout adaptation', {
      timestamp: engine.state.videoCapture.detectedAt
    });
  }
  
  const canvas = document.createElement('canvas');
  canvas.width = videoElement.videoWidth || 640;
  canvas.height = videoElement.videoHeight || 480;
  
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) {
    throw new Error('Canvas 2D context not available');
  }
  
  let frameCounter = 0;
  let isRunning = false;
  let lastFrameTime = 0;
  const minFrameInterval = 66; // ~15fps target #is this const value in ms?, confirm R281025
  
  // Main frame capture loop
  async function captureFrame() {
    if (!isRunning) return;
    
    const now = performance.now();
    if (now - lastFrameTime < minFrameInterval) {
      requestAnimationFrame(captureFrame);
      return;
    }
    lastFrameTime = now;
    
    try {
      // Update canvas if video element size changed
      if (canvas.width !== videoElement.videoWidth || canvas.height !== videoElement.videoHeight) {
        canvas.width = videoElement.videoWidth || 320;
        canvas.height = videoElement.videoHeight || 240;
        structuredLog('DEBUG', 'Canvas fallback: Video size changed', {
          width: canvas.width,
          height: canvas.height
        });
      }
      
      // Draw current video frame to canvas
      ctx.drawImage(videoElement, 0, 0, canvas.width, canvas.height);
      
      // Extract image data
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      
      frameCounter++;
      
      // Simulate frame processing (same interface as worker-based approach)
      const state = engine.getState();
      const frameData = new Uint8ClampedArray(imageData.data);
      const grid = _config.getCurrentGrid();
      let dispatchPayload = null;
      
      // Only log every 30th frame to avoid flooding console
      if (frameCounter % 30 === 0) {
        structuredLog('DEBUG', 'Canvas fallback: Frame captured', {
          frameId: frameCounter,
          mode: state.currentMode,
          hasGrid: !!grid,
          width: canvas.width,
          height: canvas.height
        });
      }
      
      if (state.currentMode === 'flow') {
        const flowResult = await processFlowMode(frameData, canvas.width, canvas.height, state);
        
        // CORE-15: Update normalization telemetry in engine state if available R151125C15ingest
        if (flowResult && flowResult.normalizationTelemetry) {
          engine.setState({ 
            normalizationTelemetry: flowResult.normalizationTelemetry 
          });
        }
        
        if (flowResult && flowResult.cues) {
          if (flowResult.cues.length > 0) {
            dispatchPayload = flowResult;
            if (frameCounter % 30 === 0) {
              structuredLog('DEBUG', 'Canvas fallback: Flow mode cues generated', {
                cuesCount: flowResult.cues.length,
                pan: flowResult.panIntensity?.pan.toFixed(2),
                intensity: flowResult.panIntensity?.intensity.toFixed(2)
              });
            }
          } else {
            dispatchPayload = { cues: [], panIntensity: flowResult.panIntensity };
            if (frameCounter % 100 === 0) {
              structuredLog('DEBUG', 'Canvas fallback: No motion or intensity too low', {
                panIntensity: flowResult.panIntensity
              });
            }
          }
        } else {
          dispatchPayload = { cues: [], panIntensity: { pan: 0, intensity: 0 } };
        }
      } else if (state.currentMode === 'flow-legacy') {
        const motionResults = await processWithMotionWorker(frameData, canvas.width, canvas.height, state);
        
        engine.dispatch('flowCuesReady', capHighFreqPayload('flowCuesReady', motionResults));
        if (motionResults.objects.length > 0) engine.dispatch('objectCuesReady', capHighFreqPayload('objectCuesReady', { objects: motionResults.objects }));
        if (Math.abs(motionResults.inferredBPM - (state.bpm || 100)) > 5) {
          engine.dispatch('bpmUpdate', { bpm: motionResults.inferredBPM });
        }
        
        if (grid && grid.mapFunction) {
          const gridOutput = grid.mapFunction(frameData, canvas.width, canvas.height, null, motionResults);
          if (gridOutput && gridOutput.cues && gridOutput.cues.length > 0) {
            dispatchPayload = { cues: gridOutput.cues };
          } else {
            if (motionResults.movingRegions && motionResults.movingRegions.length > 0) {
              const defaultCues = motionResults.movingRegions.slice(0, 1).map(region => ({
                objectType: 'default_motion',
                pitch: 440 + (region.y || 0) * 400,
                intensity: Math.min(1.0, (region.intensity || 50) / 100),
                position: { x: region.x || 0, y: region.y || 0, z: 0 }
              }));
              dispatchPayload = { cues: defaultCues };
            }
          }
        } else {
          if (motionResults.movingRegions && motionResults.movingRegions.length > 0) {
            const defaultCues = motionResults.movingRegions.slice(0, 1).map(region => ({
              objectType: 'default_motion',
              pitch: 440 + (region.y || 0) * 400,
              intensity: Math.min(1.0, (region.intensity || 50) / 100),
              position: { x: region.x || 0, y: region.y || 0, z: 0 }
            }));
            dispatchPayload = { cues: defaultCues };
          }
        }
      } else if (state.currentMode === 'focus') {
        const motionResults = await processWithMotionWorker(frameData, canvas.width, canvas.height, state);
        
        const specialists = {
          depth: await processWithDepthWorker(frameData, canvas.width, canvas.height, state),
          objects: await simulateObjectDetection(frameData, canvas.width, canvas.height)
        };
        
        dispatchPayload = {
          cues: motionResults.objects || [],
          motion: motionResults,
          specialists
        };
      }
      
      // Dispatch audio cues if we have them
      if (dispatchPayload && dispatchPayload.cues && dispatchPayload.cues.length > 0) {
        engine.dispatch('audioCuesReady', capHighFreqPayload('audioCuesReady', dispatchPayload));
      }
      
    } catch (e) {
      structuredLog('ERROR', 'Canvas fallback frame capture error', {
        error: e?.message || String(e),
        frameId: frameCounter
      });
    }
    
    if (isRunning) {
      requestAnimationFrame(captureFrame);
    }
  }
  
  // Start the frame capture loop
  isRunning = true;
  requestAnimationFrame(captureFrame);
  
  structuredLog('INFO', 'Canvas fallback video capture started');
  
  return {
    start: () => {
      isRunning = true;
      requestAnimationFrame(captureFrame);
      structuredLog('DEBUG', 'Canvas fallback: Capture resumed');
    },
    stop: () => {
      isRunning = false;
      structuredLog('DEBUG', 'Canvas fallback: Capture stopped');
    },
    dispose: () => {
      isRunning = false;
      ctx = null;
      canvas = null;
      structuredLog('DEBUG', 'Canvas fallback: Disposed');
    }
  };
}

/**
 * Initializes the modern, off-thread video processing pipeline.
 * This is the single, correct entry point for video processing. //single? R281025
 */
export async function initializeVideo(config) {
  _config = { ..._config, ...config };
  
  structuredLog('DEBUG', 'initializeVideo: Starting video pipeline initialization', config);

  // Get current mode from engine state
  const currentMode = config.engine?.getState?.()?.currentMode || 'flow';
  
  // Initialize FrameConductor (Phase 3.1b - handles all worker orchestration)
  // FrameConductor replaces legacy startMotionWorker() and startDepthWorker()
  // CRITICAL FIX: Pass engine so timeout config can detect canvas fallback
  frameConductor = new FrameConductor({
    engine: config.engine,  // Pass engine for state-aware timeout calculation
    flowTimeout: 100,
    focusTimeout: 200,
    hybridTimeout: 10,
    logMetrics: true,
    logFrames: true
  });
  
  // Initialize conductor for default mode
  try {
    await frameConductor.initializeForMode(currentMode);
    structuredLog('INFO', 'FrameConductor initialized', { mode: currentMode });
  } catch (error) {
    structuredLog('ERROR', 'FrameConductor initialization failed', { mode: currentMode, error: error.message });
  }

  return await executeCriticalOperation('video-processing', async () => {
    const { videoElement, engine } = config;
    if (!videoElement || !videoElement.srcObject) {
      throw new AccessibilityError(
        "Camera access is required for visual-to-audio conversion",
        'VIDEO_SOURCE_UNAVAILABLE',
        { hasVideoElement: !!videoElement, hasSrcObject: !!videoElement?.srcObject }
      );
    }
    
    // Only log video validation occasionally to reduce dev panel spam
    if (shouldSample('frameProcessing')) {
      structuredLog('DEBUG', 'initializeVideo: Video element validated', { 
        hasVideoElement: !!videoElement, 
        hasSrcObject: !!videoElement.srcObject,
        videoWidth: videoElement.videoWidth,
        videoHeight: videoElement.videoHeight 
      });
    }
    
    // Check for required APIs with better fallback handling
    const hasOffscreenCanvas = 'transferControlToOffscreen' in HTMLCanvasElement.prototype;
    const hasMediaStreamTrackProcessor = typeof MediaStreamTrackProcessor !== 'undefined';
    
    if (!hasOffscreenCanvas) {
      structuredLog('WARN', 'OffscreenCanvas not supported, video processing may be limited');
      // For now, we'll still throw since our current architecture requires it
      throw new Error('OffscreenCanvas is required but not supported in this browser');
    }
    
    if (!hasMediaStreamTrackProcessor) {
      structuredLog('WARN', 'MediaStreamTrackProcessor not supported, using canvas-based fallback');
      // Use canvas-based frame capture as fallback
      return await initializeVideoCanvasFallback(videoElement, engine);
    }
    
    structuredLog('DEBUG', 'initializeVideo: Starting frame provider worker...');
    frameProviderWorker = new Worker(new URL('./workers/frame-provider-worker.js', import.meta.url), { type: 'module' });
    if (_config.registerWorker) _config.registerWorker(frameProviderWorker, 'FrameProvider');
    
    // Expose worker globally for dev panel throttling controls
    window.frameProviderWorker = frameProviderWorker;

    const canvas = document.createElement('canvas');
    canvas.width = videoElement.videoWidth || 640;
    canvas.height = videoElement.videoHeight || 480;
    structuredLog('DEBUG', 'initializeVideo: Canvas created', { width: canvas.width, height: canvas.height });
    
    const offscreenCanvas = canvas.transferControlToOffscreen();
    
    const [track] = videoElement.srcObject.getVideoTracks();
    if (!track) {
      throw new Error('No video track found in MediaStream');
    }
    
    const trackProcessor = new MediaStreamTrackProcessor({ track });
    const streamReader = trackProcessor.readable;
    
    structuredLog('DEBUG', 'initializeVideo: Sending init message to frame provider worker...');

    // Compute and apply initial throttling based on quality profile, if present R161125 arent we violating SRP? dont we handle this task at utils pipeline ?   

    const stateAtInit = engine.getState ? engine.getState() : {};
    const orchestration = stateAtInit.orchestration || {};
    const settingsState = stateAtInit.settings || {};
    const profileName = settingsState.qualityProfileOverride || orchestration?.qualityProfile?.name || 'auto';
    const profile = orchestration?.qualityProfiles?.[profileName] || orchestration?.qualityProfile || null;

    frameProviderWorker.postMessage(
      { type: 'init', payload: { canvas: offscreenCanvas, streamReader } },
      [offscreenCanvas, streamReader]
    );

    // Apply initial throttle if a recognized profile is configured (e.g., 'ultra-low') R161125 carefull with the silent "if" 
    if (profile && profile.fpsTarget && profile.targetWidth) {
      try {
        const srcWidth = canvas.width || (videoElement && videoElement.videoWidth) || 320;
        const srcFps = orchestration?.metrics?.fps || 30; // fallback when metrics not yet populated
        const targetWidth = profile.targetWidth || 160;
        const scale = Math.max(0.1, Math.min(1.0, (targetWidth / srcWidth)));
        const skipRate = Math.max(1, Math.ceil(srcFps / (profile.fpsTarget || 3)));

        // Apply to worker and persist in engine state
        frameProviderWorker.postMessage({ type: 'setResolutionScale', payload: { scale } });
        frameProviderWorker.postMessage({ type: 'setFrameSkipRate', payload: { skipRate } });
        try { engine.setState({ frameProviderThrottle: { skipRate, scale } }); } catch (e) {}
        try { engine.setState({ settings: { ...settingsState, updateInterval: Math.round(1000 / (profile.fpsTarget || 3)) } }); } catch (e) {}
        structuredLog('INFO', 'initializeVideo: Applied quality profile throttle', { profileName, scale, skipRate });
      } catch (e) {
        structuredLog('WARN', 'initializeVideo: Failed to apply quality profile throttle', { profileName, error: e?.message || String(e) });
      }
    }

    // This onmessage handler IS the Orchestrator.
    frameProviderWorker.onmessage = async (event) => {
      const { type, payload } = event.data;
      if (type !== 'frame') return;

      const state = engine.getState();
      const frameData = new Uint8ClampedArray(payload.imageDataBuffer);
      const grid = _config.getCurrentGrid();
      let dispatchPayload = null;
      // Access stallStats (guaranteed to exist in state.js); mutate in place
      const stallStats = state.stallStats || { deltaSnapshot: { pan: [], intensity: [] } };
      state.stallStats = stallStats;
      stallStats.lastFrameId = payload.frameId;

      // Only log every 30th frame to avoid flooding console
      if (payload.frameId && payload.frameId % 30 === 0) {
        structuredLog('DEBUG', 'Frame processor: Received frame', { 
          mode: state.currentMode, 
          hasGrid: !!grid, 
          gridId: grid?.id 
        });
      }

      if (state.currentMode === 'flow') {
        // Use new Flow mode worker chain (Phase 2)
        const flowResult = await processFlowMode(frameData, payload.width, payload.height, state);
        
        // Always set dispatchPayload, even if cues are empty (important for audio state)
        if (flowResult && flowResult.cues) {
          if (flowResult.cues.length > 0) {
            dispatchPayload = flowResult;
            
            // Sample log for successful motion detection
            if (payload.frameId && payload.frameId % 30 === 0) {
              structuredLog('DEBUG', 'Frame processor: Flow mode cues generated', {
                cuesCount: flowResult.cues.length,
                pan: flowResult.panIntensity?.pan.toFixed(2),
                intensity: flowResult.panIntensity?.intensity.toFixed(2)
              });
            }
          } else {
            // Motion detected but intensity too low - still dispatch empty
            dispatchPayload = { cues: [], panIntensity: flowResult.panIntensity };
            
            if (payload.frameId && payload.frameId % 100 === 0) {
              structuredLog('DEBUG', 'Frame processor: Flow mode - no motion or intensity too low', {
                panIntensity: flowResult.panIntensity
              });
            }
          }
        } else {
          // Timeout or error - dispatch empty safely
          dispatchPayload = { cues: [], panIntensity: { pan: 0, intensity: 0 } };
        }
      } else if (state.currentMode === 'flow-legacy') {
        // Legacy Flow mode using existing motion worker (fallback)
        const motionResults = await processWithMotionWorker(frameData, payload.width, payload.height, state);
        
        // Dispatch new cues
        engine.dispatch('flowCuesReady', capHighFreqPayload('flowCuesReady', motionResults));
        if (motionResults.objects.length > 0) engine.dispatch('objectCuesReady', capHighFreqPayload('objectCuesReady', { objects: motionResults.objects }));
        if (Math.abs(motionResults.inferredBPM - (state.bpm || 100)) > 5) {
          engine.dispatch('bpmUpdate', { bpm: motionResults.inferredBPM });
        }
        
        // Log textureGrid for debug
        if (window.location.search.includes('debug=true')) {
          structuredLog('DEBUG', 'Cues', { textureGrid: motionResults.textureGrid, objects: motionResults.objects });
        }
        
        // Very aggressive sampling - only log every 100th frame to reduce dev panel spam
        if (payload.frameId && payload.frameId % 100 === 0) {
          structuredLog('DEBUG', 'Frame processor: Motion results', { 
            movingRegions: motionResults.movingRegions.length 
          });
        }
        
        if (grid && grid.mapFunction) {
          const gridOutput = grid.mapFunction(frameData, payload.width, payload.height, null, motionResults);
          structuredLog('DEBUG', 'Grid cues generated', { cueCount: gridOutput?.cues?.length || 0, mode: state.currentMode, motionPresent: !!motionResults });
          if (gridOutput && gridOutput.cues && gridOutput.cues.length > 0) {
            // In Flow mode, the payload includes the cues array
            dispatchPayload = { cues: gridOutput.cues };
            // Only log every 30th frame to avoid flooding console
            if (payload.frameId && payload.frameId % 30 === 0) {
              structuredLog('DEBUG', 'Frame processor: Generated cues for Flow mode', { 
                cuesCount: gridOutput.cues.length 
              });
            }
          } else {
            // FALLBACK: Grid returned no cues, create a default one from motion data // R181025 we must be cautious with fallbacks, remember that this is a navigation aid for blind users
            if (motionResults.movingRegions && motionResults.movingRegions.length > 0) {
              const defaultCues = motionResults.movingRegions.slice(0, 1).map(region => ({
                objectType: 'default_motion',
                pitch: 440 + (region.y || 0) * 400, // Vary pitch based on position
                intensity: Math.min(1.0, (region.intensity || 50) / 100),
                position: { x: region.x || 0, y: region.y || 0, z: 0 }
              }));
              dispatchPayload = { cues: defaultCues };
              structuredLog('DEBUG', 'Frame processor: Created fallback cues for Flow mode', { cuesCount: defaultCues.length });
            }
          }
        } else {
          // FALLBACK: No grid available, create cues from motion data directly
          if (motionResults.movingRegions && motionResults.movingRegions.length > 0) {
            const defaultCues = motionResults.movingRegions.slice(0, 1).map(region => ({
              objectType: 'default_motion',
              pitch: 440 + (region.y || 0) * 400,
              intensity: Math.min(1.0, (region.intensity || 50) / 100),
              position: { x: region.x || 0, y: region.y || 0, z: 0 }
            }));
            dispatchPayload = { cues: defaultCues };
            structuredLog('DEBUG', 'Frame processor: No grid, using motion-based fallback cues', { cuesCount: defaultCues.length });
          }
        }

      } else if (state.currentMode === 'focus') {
        // In Focus mode, run specialists and generate a rich payload
        const motionResults = await processWithMotionWorker(frameData, payload.width, payload.height, state);
        
        // Dispatch new cues
        engine.dispatch('flowCuesReady', capHighFreqPayload('flowCuesReady', motionResults));
        if (motionResults.objects.length > 0) engine.dispatch('objectCuesReady', capHighFreqPayload('objectCuesReady', { objects: motionResults.objects }));
        if (Math.abs(motionResults.inferredBPM - (state.bpm || 100)) > 5) {
          engine.dispatch('bpmUpdate', { bpm: motionResults.inferredBPM });
        }
        
        const objectResults = await simulateObjectDetection(motionResults);

        if (objectResults.detectedObjects.length > 0) {
          const mainObject = objectResults.detectedObjects[0];
          const shapeResults = await simulateShapeAnalysis(mainObject);

          // Part A: Create the Primary "Identity" Cue with an 'isPrimary' flag
          const primaryCue = {
            objectType: mainObject.label, // 'bottle' from our simulation
            intensity: mainObject.confidence,
            position: mainObject.position,
            isPrimary: true
          };

          // Part B: Use the Grid as a "Sonic Sculptor" to create the "sheet music"
          let secondaryCues = [];
          if (grid && grid.mapFunction) {
             const gridOutput = grid.mapFunction(null, payload.width, payload.height, null, shapeResults);
             secondaryCues = (gridOutput && gridOutput.cues) || [];
          }
          structuredLog('DEBUG', 'Grid cues generated', { cueCount: secondaryCues.length, mode: state.currentMode, motionPresent: !!objectResults });

          // If the grid didn't produce any "form" cues, create a simple default one.
          if (secondaryCues.length === 0) {
            secondaryCues.push({ pitch: 440, intensity: 0.8, position: mainObject.position });
          }

          // Combine into a single standardized cues array (primary first)
          const combinedCues = [primaryCue, ...secondaryCues];
          dispatchPayload = { cues: combinedCues };
        } else {
          // FALLBACK: If no objects detected in Focus mode, fall back to Flow mode grid mapping // R181025 isnt this the purpose of the hybrid mode? 
          // This ensures audio continues even when object detection fails or finds nothing
          if (grid && grid.mapFunction) {
            const gridOutput = grid.mapFunction(frameData, payload.width, payload.height, null, motionResults);
            if (gridOutput && gridOutput.cues && gridOutput.cues.length > 0) {
              dispatchPayload = { cues: gridOutput.cues };
              structuredLog('DEBUG', 'Focus mode fallback: Using motion-based cues', { cueCount: gridOutput.cues.length });
            }
          }
        }
      }
      
      if (dispatchPayload) {
        // Update stall metrics prior to dispatch
        const panIntensity = dispatchPayload.panIntensity || { pan: 0, intensity: 0 };
        const pan = panIntensity.pan ?? 0;
        const intensity = panIntensity.intensity ?? 0;
        updateDeltaHistogram(pan, intensity, stallStats);
        // Determine if pan/intensity materially changed (avoid floating noise)
        const PAN_DELTA_THRESHOLD = 0.01;
        const INTENSITY_DELTA_THRESHOLD = 0.01;
        const panChanged = Math.abs(pan - stallStats.lastPan) > PAN_DELTA_THRESHOLD;
        const intensityChanged = Math.abs(intensity - stallStats.lastIntensity) > INTENSITY_DELTA_THRESHOLD;
        if (panChanged || intensityChanged) {
          stallStats.unchangedPanFrames = 0;
          stallStats.lastPan = pan;
          stallStats.lastIntensity = intensity;
        } else {
          stallStats.unchangedPanFrames++;
        }
        structuredLog('INFO', 'Dispatching audioCuesReady', { cueCount: dispatchPayload.cues ? dispatchPayload.cues.length : 0, mode: state.currentMode });
        engine.dispatch('audioCuesReady', capHighFreqPayload('audioCuesReady', {
          cues: dispatchPayload.cues || [],
          frameId: payload.frameId,
          startTime: payload.startTime
        }));
        // Update stall stats post audio dispatch
        stallStats.lastAudioCueTs = Date.now();
        stallStats.lastCueCount = dispatchPayload.cues ? dispatchPayload.cues.length : 0;
        if (stallStats.stallDetected && stallStats.lastCueCount > 0) {
          // Clear stall flag after successful cue dispatch
            stallStats.stallDetected = false;
        }
        // Sampled telemetry logging every 60 frames
        if (payload.frameId && payload.frameId % 60 === 0) {
          // Export scalar stall stats
          structuredLog('DEBUG', 'STALL_STATS_SAMPLE', {
            lastAudioCueTs: stallStats.lastAudioCueTs,
            unchangedPanFrames: stallStats.unchangedPanFrames,
            stallDetected: stallStats.stallDetected,
            stallCount: stallStats.stallCount,
            lastCueCount: stallStats.lastCueCount
          });
          // Export compact delta histogram snapshot to EventBus (command event)
          try {
            const snap = stallStats.deltaSnapshot || createDeltaSnapshot({
              pan: new Uint32Array(DELTA_HISTOGRAM_BINS),
              intensity: new Uint32Array(DELTA_HISTOGRAM_BINS)
            });
            // Keep payload compact: 16-bin arrays + summary stats
            const payloadSnapshot = {
              frameId: payload.frameId,
              meanPanDelta: snap.meanPanDelta,
              meanIntensityDelta: snap.meanIntensityDelta,
              zeroPanStreak: snap.zeroPanStreak,
              zeroIntensityStreak: snap.zeroIntensityStreak,
              pan: Array.from(snap.pan || []),
              intensity: Array.from(snap.intensity || [])
            };
            engine.dispatch && engine.dispatch('deltaHistogramSnapshot', payloadSnapshot);
            // Optional low-volume log for correlation in logs pane
            if (Math.random() < 0.1) {
              structuredLog('DEBUG', 'DELTA_HISTOGRAM_SNAPSHOT', {
                frameId: payloadSnapshot.frameId,
                meanPanDelta: payloadSnapshot.meanPanDelta,
                meanIntensityDelta: payloadSnapshot.meanIntensityDelta
              });
            }
          } catch (e) {
            structuredLog('WARN', 'Failed to export delta histogram snapshot', { error: e?.message || String(e) });
          }
        }
        // Persist updated stallStats in engine state
        engine.setState({ stallStats });
        // Robust fallback: also dispatch direct audio play command which may be
        // consumed by older or alternate audio handlers expecting this event.
        try {
          engine.dispatch && engine.dispatch('audioPlayCues', { cues: dispatchPayload.cues || [] });
          structuredLog('DEBUG', 'Frame processor: Also dispatched audioPlayCues fallback', { cueCount: dispatchPayload.cues.length });
        } catch (e) {
          structuredLog('WARN', 'Frame processor: Failed to dispatch audioPlayCues fallback', { error: e?.message || String(e) });
        }
      }
    };

    engine.onStateChange(state => {
      if (!frameProviderWorker) return;
      if (state.isProcessing) {
        frameProviderWorker.postMessage({ type: 'start' });
        // Start stall watchdog if not already running
        if (!stallWatchdogInterval) {
          const STALL_INTERVAL_MS = 500; // evaluation cadence
          const MAX_SILENCE_MS = 1500;   // time threshold without cues
          const MAX_UNCHANGED_FRAMES = 90; // unchanged pan/intensity threshold
          stallWatchdogInterval = setInterval(() => {
            try {
              const currentState = engine.getState();
              const stats = currentState.stallStats;
              if (!stats) return; // safety
              if (stats.lastAudioCueTs === 0) return; // no cues yet
              const silenceDuration = Date.now() - stats.lastAudioCueTs;
              const stallBySilence = silenceDuration > MAX_SILENCE_MS;
              const stallByStaticPan = stats.unchangedPanFrames > MAX_UNCHANGED_FRAMES;
              if ((stallBySilence || stallByStaticPan) && !stats.stallDetected) {
                stats.stallDetected = true;
                stats.stallCount++;
                structuredLog('WARN', 'STALL_DETECTED', {
                  stallBySilence,
                  stallByStaticPan,
                  silenceDuration,
                  unchangedPanFrames: stats.unchangedPanFrames,
                  lastCueCount: stats.lastCueCount
                });
                // Attempt recovery: reset motion worker (no silent strategy downgrade)
                try { engine.dispatch('resetMotionWorker'); } catch (e) {
                  structuredLog('ERROR', 'Failed to dispatch resetMotionWorker during stall recovery', { error: e?.message || String(e) });
                }
                // Reset dynamic counters (keep stallCount history)
                stats.unchangedPanFrames = 0;
                engine.setState({ stallStats: stats });
              }
            } catch (err) {
              structuredLog('ERROR', 'Stall watchdog error', { error: err?.message || String(err) });
            }
          }, STALL_INTERVAL_MS);
          structuredLog('INFO', 'Stall watchdog started');
        }
      } else {
        frameProviderWorker.postMessage({ type: 'stop' });
        // Stop stall watchdog when processing halts
        if (stallWatchdogInterval) {
          clearInterval(stallWatchdogInterval);
          stallWatchdogInterval = null;
          structuredLog('INFO', 'Stall watchdog stopped');
        }
        resetDeltaHistogramState();
      }
      
      // Phase 3.1b: Hot-swap workers when mode changes via FrameConductor
      if (state.currentMode && frameConductor) {
        // Mode change detection is efficient (getMetrics is O(1))
        // Only calls initializeForMode if mode actually changed (cached comparison)
        const metrics = frameConductor.getMetrics?.();
        const currentConductorMode = metrics?.currentMode;
        if (currentConductorMode !== state.currentMode) {
          frameConductor.initializeForMode(state.currentMode).then(() => {
            structuredLog('INFO', 'Mode switched via FrameConductor', { 
              newMode: state.currentMode,
              previousMode: currentConductorMode
            });
          }).catch((error) => {
            structuredLog('ERROR', 'Failed to switch mode in FrameConductor', { 
              mode: state.currentMode, 
              error: error.message 
            });
          });
        }
      }
      
      // Check for depth path changes
      if (state.depthPath && state.depthPath !== previousDepthPath) {
        // "FrameConductor updates its internal depth worker state" via the updateDepthPath 
        // method (semantic: pass new path config to depth computation)
        if (frameConductor && frameConductor.updateDepthPath) {
          frameConductor.updateDepthPath(state.depthPath);
        } else if (depthWorker) {
          depthWorker.postMessage({ type: 'setPath', path: state.depthPath });
          structuredLog('INFO', 'Depth path updated (legacy)', { path: state.depthPath });
        }
        previousDepthPath = state.depthPath;
      }
      
      // Grid configuration IS embedded in frame message (stateless by design)
      // This keeps frame-processor lean (no per-frame grid state) and lets frame-provider
      // stream independent of orchestration concerns. See docs: "stateless pattern"
      if (state.currentMode) {
        structuredLog('DEBUG', 'Operating mode active', { mode: state.currentMode });
      }
    });
    
    structuredLog('INFO', 'initializeVideo: Video pipeline initialization completed successfully');
    return true; // Success indicator
  }, { 
    videoElement: config?.videoElement, 
    hasCamera: !!config?.videoElement?.srcObject 
  });
}

/**
 * Dispose video processor and clean up all resources (Phase 3.1b).
 * Call this on app shutdown to terminate workers and free memory.
 * 
 * This function:
 * - Terminates frame provider worker
 * - Terminates motion and depth workers (if still running)
 * - Disposes FrameConductor and all its managed workers
 * - Clears module state
 */
export function disposeVideo() {
  try {
    // Terminate legacy workers (cleanup for any remaining direct references)
    if (frameProviderWorker) {
      frameProviderWorker.terminate();
      frameProviderWorker = null;
      structuredLog('INFO', 'Frame provider worker terminated');
    }
    
    if (motionWorker) {
      motionWorker.terminate();
      motionWorker = null;
      structuredLog('INFO', 'Motion worker terminated');
    }
    
    if (depthWorker) {
      depthWorker.terminate();
      depthWorker = null;
      structuredLog('INFO', 'Depth worker terminated');
    }
    
    // Phase 3.1b: Dispose FrameConductor (terminates all manifest-managed workers)
    if (frameConductor) {
      frameConductor.dispose();
      frameConductor = null;
      structuredLog('INFO', 'FrameConductor disposed (all workers terminated)');
    }
    
    // Reset module state
    _config = {};
    previousDepthPath = null;
    
    structuredLog('INFO', 'Video processor fully disposed');
  } catch (error) {
    structuredLog('ERROR', 'Error during video processor disposal', { 
      error: error.message 
    });
  }
}