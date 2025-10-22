// filepath: future/web/video/frame-processor.js
import { structuredLog } from '../utils/logging.js';
import { rgbaToY } from './videoframe-helper.js';
import { getGridConfig } from './grids/grid-config.js';
import { 
  executeCriticalOperation, 
  AccessibilityError, 
  showCriticalError 
} from '../utils/error-handling.js';
import { WorkerContract } from './workers/worker-contract.js';

// --- Module State ---
let _config = {};
let frameProviderWorker = null;
let motionWorker = null;
let depthWorker = null;
let previousDepthPath = null; // Track depth computation path changes (used to avoid redundant reconfigurations)

// Flow Mode Workers (Phase 2)
let flowModeWorkers = {
  fastMotion: null,
  gridAggregator: null,
  panIntensityMapper: null
};

// Current mode and grid config are derived from engine state, not stored locally
// This keeps frame-processor stateless for configuration

// --- Helper Functions ---
function startMotionWorker(currentMode = 'flow') {
  if (motionWorker) return;
  try {
    const workerPath = currentMode === 'hybrid' ? './workers/image-worker.js' : './workers/motion-worker.js';
    motionWorker = new Worker(new URL(workerPath, import.meta.url), { type: 'module' });
    if (_config.registerWorker) _config.registerWorker(motionWorker, 'MotionSpecialist');
    
    // Add error handler for worker crashes
    motionWorker.onerror = (error) => {
      structuredLog('ERROR', 'Motion worker error', { 
        message: error.message, 
        filename: error.filename, 
        lineno: error.lineno 
      });
    };
    
    motionWorker.onmessage = (e) => {
      // This worker now uses a custom event system for promises
      const event = new CustomEvent('motionResult', { detail: e.data });
      motionWorker.dispatchEvent(event);
    };
    structuredLog('INFO', 'Motion Specialist worker started.');
    
    // Start depth worker for hybrid/focus
    if (currentMode === 'hybrid' || currentMode === 'focus') {
      startDepthWorker();
    }
  } catch (e) {
    structuredLog('ERROR', 'Failed to start Motion Specialist worker.', { error: e });
  }
}

function startDepthWorker() {
  if (depthWorker) return;
  try {
    depthWorker = new Worker(new URL('./workers/depth-worker.js', import.meta.url), { type: 'module' });
    if (_config.registerWorker) _config.registerWorker(depthWorker, 'DepthSpecialist');
    
    depthWorker.onerror = (error) => {
      structuredLog('ERROR', 'Depth worker error', { 
        message: error.message, 
        filename: error.filename, 
        lineno: error.lineno 
      });
    };
    
    depthWorker.onmessage = (e) => {
      if (e.data.type === 'depthCues') {
        engine.dispatch('depthCuesReady', e.data.result);
      }
    };
    structuredLog('INFO', 'Depth Specialist worker started.');
  } catch (e) {
    structuredLog('ERROR', 'Failed to start Depth Specialist worker.', { error: e });
  }
}

/**
 * Initialize Flow mode workers (Phase 2)
 * Creates instances of fast-motion-worker, fast-grid-aggregator, and pan-intensity-mapper
 */
function startFlowModeWorkers() {
  try {
    if (!flowModeWorkers.fastMotion) {
      flowModeWorkers.fastMotion = new Worker(
        new URL('./workers/fast-motion-worker.js', import.meta.url),
        { type: 'module' }
      );
      if (_config.registerWorker) _config.registerWorker(flowModeWorkers.fastMotion, 'FastMotionWorker');
      
      flowModeWorkers.fastMotion.onerror = (error) => {
        structuredLog('ERROR', 'Fast motion worker error', {
          message: error.message,
          filename: error.filename,
          lineno: error.lineno
        });
      };
      
      structuredLog('INFO', 'Fast motion worker started.');
    }

    if (!flowModeWorkers.gridAggregator) {
      flowModeWorkers.gridAggregator = new Worker(
        new URL('./workers/fast-grid-aggregator.js', import.meta.url),
        { type: 'module' }
      );
      if (_config.registerWorker) _config.registerWorker(flowModeWorkers.gridAggregator, 'GridAggregatorWorker');
      
      flowModeWorkers.gridAggregator.onerror = (error) => {
        structuredLog('ERROR', 'Grid aggregator worker error', {
          message: error.message,
          filename: error.filename,
          lineno: error.lineno
        });
      };
      
      structuredLog('INFO', 'Grid aggregator worker started.');
    }

    if (!flowModeWorkers.panIntensityMapper) {
      flowModeWorkers.panIntensityMapper = new Worker(
        new URL('./workers/pan-intensity-mapper.js', import.meta.url),
        { type: 'module' }
      );
      if (_config.registerWorker) _config.registerWorker(flowModeWorkers.panIntensityMapper, 'PanIntensityMapperWorker');
      
      flowModeWorkers.panIntensityMapper.onerror = (error) => {
        structuredLog('ERROR', 'Pan-intensity mapper worker error', {
          message: error.message,
          filename: error.filename,
          lineno: error.lineno
        });
      };
      
      structuredLog('INFO', 'Pan-intensity mapper worker started.');
    }
  } catch (e) {
    structuredLog('ERROR', 'Failed to start Flow mode workers', { error: e });
  }
}

/**
 * Process frame using Flow mode worker chain (Phase 2)
 * Sequential processing: motion → grid → params → audio
 */
function processFlowMode(frameData, width, height, state) {
  return new Promise((resolve) => {
    try {
      // Step 1: Extract Y-plane and send to motion worker
      let motionRegions = null;
      let gridData = null;
      let panIntensity = null;
      let resolved = false;

      // ✅ CRITICAL FIX: Pass frame dimensions to gridConfig so workers can map coordinates → cells
      const gridConfig = getGridConfig('flow', width, height);
      const yBuffer = rgbaToY(frameData, width, height);

      // Motion worker handler
      const motionHandler = (e) => {
        try {
          structuredLog('DEBUG', 'Motion handler: Received message', {
            messageType: e.data?.type,
            hasResult: !!e.data?.result,
            resultKeys: e.data?.result ? Object.keys(e.data.result) : null
          }, false, Math.random() < 0.01); // Sample: ~1% of frames
          
          // Validate message per Phase 1.5 pattern
          const validation = WorkerContract.validate(e.data);
          if (!validation.valid) {
            structuredLog('WARN', 'Fast motion worker validation failed', {
              error: validation.error,
              workerName: e.data.workerName
            });
            motionRegions = { coords: new Uint16Array(0), intens: new Uint8Array(0), count: 0 };
          } else {
            const result = WorkerContract.getResult(e.data);
            structuredLog('DEBUG', 'Motion handler: Extracted result', {
              hasCoords: result?.coords ? true : false,
              coordsType: result?.coords?.constructor?.name,
              hasIntens: result?.intens ? true : false,
              count: result?.count
            }, false, Math.random() < 0.01);
            motionRegions = result;
          }

          // Proceed to grid aggregator
          if (motionRegions && motionRegions.coords) {
            structuredLog('DEBUG', 'Motion handler: Sending to gridAggregator', {
              regionCount: motionRegions.count,
              coordsLength: motionRegions.coords.length
            }, false, Math.random() < 0.01);
            flowModeWorkers.gridAggregator.postMessage({
              type: 'processFrame',
              motionRegions,
              gridConfig
            });
          }
        } catch (error) {
          structuredLog('ERROR', 'Motion handler exception', { error: error.message });
          motionRegions = { coords: new Uint16Array(0), intens: new Uint8Array(0), count: 0 };
          flowModeWorkers.gridAggregator.postMessage({
            type: 'processFrame',
            motionRegions,
            gridConfig
          });
        }
      };

            // Grid aggregator handler
      const gridHandler = (e) => {
        try {
          structuredLog('DEBUG', 'Grid handler: Received message', {
            messageType: e.data?.type,
            hasResult: !!e.data?.result,
            resultKeys: e.data?.result ? Object.keys(e.data.result) : null
          }, false, Math.random() < 0.01);
          
          // Validate message per Phase 1.5 pattern
          const validation = WorkerContract.validate(e.data);
          if (!validation.valid) {
            structuredLog('WARN', 'Grid aggregator validation failed', {
              error: validation.error,
              workerName: e.data.workerName
            });
            gridData = new Float32Array(gridConfig.rows * gridConfig.cols);
          } else {
            const result = WorkerContract.getResult(e.data);
            structuredLog('DEBUG', 'Grid handler: Extracted result', {
              hasResult: !!result,
              hasGrid: result ? 'grid' in result : false,
              resultKeys: result ? Object.keys(result) : null
            }, false, Math.random() < 0.01);
            
            // ✅ Guard before accessing
            if (!result || typeof result.grid === 'undefined') {
              structuredLog('WARN', 'Grid aggregator returned invalid/empty result', {
                hasResult: !!result,
                hasGrid: result ? 'grid' in result : 'N/A'
              });
              gridData = new Float32Array(gridConfig.rows * gridConfig.cols);
            } else {
              gridData = result.grid;
            }
          }

          // Proceed to pan-intensity mapper
          if (gridData) {
            structuredLog('DEBUG', 'Grid handler: Sending to panIntensityMapper', {
              gridLength: gridData.length,
              gridType: gridData.constructor.name
            }, false, Math.random() < 0.01);
            flowModeWorkers.panIntensityMapper.postMessage({
              type: 'processFrame',
              grid: gridData,
              gridConfig
            });
          }
        } catch (error) {
          structuredLog('ERROR', 'Grid handler exception', { error: error.message });
          gridData = new Float32Array(gridConfig.rows * gridConfig.cols);
          flowModeWorkers.panIntensityMapper.postMessage({
            type: 'processFrame',
            grid: gridData,
            gridConfig
          });
        }
      };

      // Pan-intensity mapper handler (final in chain)
      const panIntensityHandler = (e) => {
        try {
          // Validate message per Phase 1.5 pattern
          const validation = WorkerContract.validate(e.data);
          if (!validation.valid) {
            structuredLog('WARN', 'Pan-intensity mapper validation failed', {
              error: validation.error,
              workerName: e.data.workerName
            });
            panIntensity = { pan: 0, intensity: 0 };
          } else {
            const result = WorkerContract.getResult(e.data);
            panIntensity = { pan: result.pan, intensity: result.intensity };
            structuredLog('DEBUG', 'panIntensityHandler: Received pan-intensity result', { pan: result.pan, intensity: result.intensity }, false, Math.random() < 0.05);
          }

          // Remove handlers
          flowModeWorkers.fastMotion.removeEventListener('message', motionHandler);
          flowModeWorkers.gridAggregator.removeEventListener('message', gridHandler);
          flowModeWorkers.panIntensityMapper.removeEventListener('message', panIntensityHandler);

          // CRITICAL: Apply grid mapping to shape the melody
          // Motion data → Grid mapping → Cues (as per architecture)
          let cues = [];
          const grid = _config.getCurrentGrid();
          
          if (grid && grid.mapFunction && motionRegions && motionRegions.coords && motionRegions.coords.length > 0) {
            // Convert motionRegions to movingRegions format that grids expect
            const movingRegions = [];
            for (let i = 0; i < motionRegions.count && i < motionRegions.coords.length / 2; i++) {
              const x = motionRegions.coords[i * 2];
              const y = motionRegions.coords[i * 2 + 1];
              const intensity = motionRegions.intens[i] || 0;
              movingRegions.push({ x, y, intensity });
            }
            
            // Let the grid shape the melody based on motion data
            const gridOutput = grid.mapFunction(frameData, width, height, null, { movingRegions });
            if (gridOutput && gridOutput.cues && gridOutput.cues.length > 0) {
              cues = gridOutput.cues;
              structuredLog('DEBUG', 'Flow mode: Grid mapped motion to cues', { 
                gridId: grid.id, 
                cuesCount: cues.length, 
                motionRegionsCount: movingRegions.length 
              }, false, Math.random() < 0.05);
            }
          }
          
          // Fallback: If grid didn't produce cues, use pan-intensity to create basic cues
          if (cues.length === 0 && panIntensity.intensity > 0.001) {
            cues = createCuesFromAudioParams(panIntensity, state);
            structuredLog('DEBUG', 'Flow mode: Fallback to pan-intensity cues', { 
              intensity: panIntensity.intensity 
            }, false, Math.random() < 0.05);
          }
          
          if (!resolved) {
            resolved = true;
            resolve({ cues, panIntensity });
          }
        } catch (error) {
          structuredLog('ERROR', 'Pan-intensity handler exception', { error: error.message });
          
          if (!resolved) {
            resolved = true;
            resolve({ cues: [], panIntensity: { pan: 0, intensity: 0 } });
          }
        }
      };

      // Setup message listeners
      flowModeWorkers.fastMotion.addEventListener('message', motionHandler);
      flowModeWorkers.gridAggregator.addEventListener('message', gridHandler);
      flowModeWorkers.panIntensityMapper.addEventListener('message', panIntensityHandler);

      // Start the chain: send frame to motion worker
      flowModeWorkers.fastMotion.postMessage(
        {
          type: 'frame',
          ts: Date.now(),
          w: width,
          h: height,
          yBuffer: yBuffer.buffer,
          threshold: state.motionThreshold || 0.5,
          maxRegions: 64,
          gridConfig,
          mode: 'flow'
        },
        [yBuffer.buffer]
      );

      // Set timeout to prevent hanging
      const timeoutId = setTimeout(() => {
        if (!resolved) {
          resolved = true;
          structuredLog('WARN', 'Flow mode chain timeout', { gridConfig });
          flowModeWorkers.fastMotion.removeEventListener('message', motionHandler);
          flowModeWorkers.gridAggregator.removeEventListener('message', gridHandler);
          flowModeWorkers.panIntensityMapper.removeEventListener('message', panIntensityHandler);
          resolve({ cues: [], panIntensity: { pan: 0, intensity: 0 } });
        }
      }, 100); // 100ms timeout for entire chain (should complete in ~22ms)
    } catch (error) {
      structuredLog('ERROR', 'processFlowMode exception', { error: error.message });
      resolve({ cues: [], panIntensity: { pan: 0, intensity: 0 } });
    }
  });
}

/**
 * Convert audio parameters (pan, intensity) to audio cues
 */
function createCuesFromAudioParams(params, state) {
  try {
    const baseFreq = state.baseFrequency || 440;
    const { pan, intensity } = params;

    // If no motion, return empty cues
    // Threshold: 0.001 (1% of max intensity) allows very subtle motion
    // This prevents spurious audio but allows real motion detection
    if (intensity === 0 || intensity < 0.001) {
      structuredLog('DEBUG', 'createCuesFromAudioParams: No motion (intensity below threshold)', { intensity, threshold: 0.001 }, false, Math.random() < 0.05);
      return [];
    }
    
    structuredLog('DEBUG', 'createCuesFromAudioParams: Motion detected', { intensity, pan }, false, Math.random() < 0.05);

    // Create single cue with pan and intensity for Flow mode
    const cue = {
      objectType: 'flow_motion',
      pitch: baseFreq,
      pan: Math.max(-1, Math.min(1, pan)),
      intensity: Math.max(0, Math.min(1, intensity)),
      position: {
        x: Math.max(-1, Math.min(1, pan)),
        y: 0.5,
        z: 0
      }
    };

    return [cue];
  } catch (error) {
    structuredLog('WARN', 'createCuesFromAudioParams failed', { error: error.message });
    return [];
  }
}

let prevFrameData = null;

function processWithMotionWorker(frameData, width, height, state) {
  return new Promise(resolve => {
    if (!motionWorker) return resolve({ movingRegions: [], textureGrid: [], objects: [], inferredBPM: 100 });

    const messageHandler = (event) => {
      const data = event.detail;
      if (data.type === 'flowCues') {
        motionWorker.removeEventListener('motionResult', messageHandler);
        const { result } = data;
        // Convert to old format for compatibility
        const movingRegions = result.gridFlows.flat().map(f => ({ x: 0, y: 0, intensity: f.mag * 10 })); // Placeholder
        const motionResults = { ...result, movingRegions };
        // Dispatch new cues
        engine.dispatch('flowCuesReady', motionResults);
        if (motionResults.objects.length > 0) engine.dispatch('objectCuesReady', { objects: motionResults.objects });
        if (Math.abs(motionResults.inferredBPM - (state.bpm || 100)) > 5) {
          engine.dispatch('bpmUpdate', { bpm: motionResults.inferredBPM });
        }
        resolve(motionResults);
      }
    };
    motionWorker.addEventListener('motionResult', messageHandler);

    const frame = { data: frameData, width, height };
    const prevFrame = prevFrameData ? { data: prevFrameData, width, height } : frame;
    
    // ✅ CRITICAL FIX: Pass frame dimensions to gridConfig (same fix as Flow mode)
    const gridConfig = getGridConfig(state.currentMode || 'hybrid', width, height);
    
    // For image-worker: pass enableSemanticDetection from state
    motionWorker.postMessage({
      type: 'processFrame', 
      frame, 
      prevFrame, 
      gridConfig,
      mode: state.currentMode || 'hybrid',
      enableSemantic: state.enableSemanticDetection || false
    });
    if (depthWorker && (state.currentMode === 'hybrid' || state.currentMode === 'focus')) {
      depthWorker.postMessage({
        type: 'processFrame', 
        frame, 
        prevFrame, 
        gridConfig,
        mode: state.currentMode || 'hybrid'
      });
    }
    prevFrameData = frameData.slice();
  });
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
  const minFrameInterval = 33; // ~30fps target
  
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
        canvas.width = videoElement.videoWidth || 640;
        canvas.height = videoElement.videoHeight || 480;
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
        
        engine.dispatch('flowCuesReady', motionResults);
        if (motionResults.objects.length > 0) engine.dispatch('objectCuesReady', { objects: motionResults.objects });
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
        engine.dispatch('audioCuesReady', dispatchPayload);
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
 * This is the single, correct entry point for video processing.
 */
export async function initializeVideo(config) {
  _config = { ..._config, ...config };
  
  structuredLog('DEBUG', 'initializeVideo: Starting video pipeline initialization', config);

  // Pass current mode from engine state to startMotionWorker
  const currentMode = config.engine?.getState?.()?.currentMode || 'flow';
  startMotionWorker(currentMode);
  
  // Initialize Flow mode workers (Phase 2)
  startFlowModeWorkers();

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
    if (Math.random() < 0.1) {
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

    frameProviderWorker.postMessage(
      { type: 'init', payload: { canvas: offscreenCanvas, streamReader } },
      [offscreenCanvas, streamReader]
    );

    // This onmessage handler IS the Orchestrator.
    frameProviderWorker.onmessage = async (event) => {
      const { type, payload } = event.data;
      if (type !== 'frame') return;

      const state = engine.getState();
      const frameData = new Uint8ClampedArray(payload.imageDataBuffer);
      const grid = _config.getCurrentGrid();
      let dispatchPayload = null;

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
        engine.dispatch('flowCuesReady', motionResults);
        if (motionResults.objects.length > 0) engine.dispatch('objectCuesReady', { objects: motionResults.objects });
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
        engine.dispatch('flowCuesReady', motionResults);
        if (motionResults.objects.length > 0) engine.dispatch('objectCuesReady', { objects: motionResults.objects });
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
        structuredLog('INFO', 'Dispatching audioCuesReady', { cueCount: dispatchPayload.cues ? dispatchPayload.cues.length : 0, mode: state.currentMode });
        engine.dispatch('audioCuesReady', {
          cues: dispatchPayload.cues || [],
          frameId: payload.frameId,
          startTime: payload.startTime
        });
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
      } else {
        frameProviderWorker.postMessage({ type: 'stop' });
      }
      
      // Check for depth path changes
      if (state.depthPath && state.depthPath !== previousDepthPath) {
        if (depthWorker) {
          depthWorker.postMessage({ type: 'setPath', path: state.depthPath });
          structuredLog('INFO', 'Depth path updated', { path: state.depthPath });
        }
        previousDepthPath = state.depthPath;
      }
      
      // Note: Grid configuration is embedded in every frame message (stateless pattern)
      // Mode changes automatically take effect on the next frame processing
      if (state.currentMode) {
        structuredLog('DEBUG', 'Paradigm mode active', { mode: state.currentMode });
      }
    });
    
    structuredLog('INFO', 'initializeVideo: Video pipeline initialization completed successfully');
    return true; // Success indicator
  }, { 
    videoElement: config?.videoElement, 
    hasCamera: !!config?.videoElement?.srcObject 
  });
}