// File: web/core/commands/settings-commands.js
// Handles core settings state mutations (grid type, synth engine, maxNotes, etc.)
// Persistence moved to persistence-commands.js
// UI convenience handlers removed - they belong in UI modules

import { structuredLog } from '../../utils/logging.js';
import { getText } from '../../utils/utils.js';
// Do not import audio-processor directly; use engine.audioApi instead

export function registerSettingsCommands(engine) {
  const { registerCommandHandler, dispatch } = engine;

  // --- Handlers for Debug UI Controls ---  
  registerCommandHandler('setGridType', ({ payload, metadata }) => {
    const traceId = metadata?.traceId;
    structuredLog('DEBUG', 'setGridType handler ENTRY', { 
      payloadType: typeof payload,
      payloadKeys: payload ? Object.keys(payload) : 'null',
      payloadRaw: payload
    }, { traceId });
    
    const newGridId = payload.gridType;
    const currentState = engine.getState();
    
    // Debug: Log what we received
    structuredLog('DEBUG', 'setGridType command received', { 
      gridType: newGridId === undefined ? 'undefined' : String(newGridId)
    }, { traceId });
    
    if (currentState.availableGrids && currentState.availableGrids.find(g => g.id === newGridId)) {
      engine.setState({ gridType: newGridId });
      structuredLog('INFO', 'DebugUI: Grid type set', { gridType: newGridId }, { traceId });
    } else {
      structuredLog('WARN', 'DebugUI: Grid type not found or invalid', { 
        requestedGridType: newGridId === undefined ? 'undefined' : newGridId, 
        availableGrids: currentState.availableGrids?.map(g => g.id) || [] 
      }, { traceId });
    }
  });

  registerCommandHandler('setSynthEngine', ({ payload, metadata }) => {
    const traceId = metadata?.traceId;
    structuredLog('DEBUG', 'setSynthEngine handler ENTRY', { 
      payloadType: typeof payload,
      payloadKeys: payload ? Object.keys(payload) : 'null',
      payloadRaw: payload
    }, { traceId });
    
    const newEngineId = payload.synthesisEngine; // Standardized parameter name
    const currentState = engine.getState();
    
    // Debug: Log what we received
    structuredLog('DEBUG', 'setSynthEngine command received', { 
      synthesisEngine: newEngineId === undefined ? 'undefined' : String(newEngineId)
    }, { traceId });
    
    if (currentState.availableEngines && currentState.availableEngines.find(e => e.id === newEngineId)) {
      engine.setState({ synthesisEngine: newEngineId });
      try {
        if (engine.audioApi && typeof engine.audioApi.setSelectedSynthEngine === 'function') {
          engine.audioApi.setSelectedSynthEngine(newEngineId);
        } else {
          structuredLog('WARN', 'setSynthEngine: audioApi.setSelectedSynthEngine not available', {}, { traceId });
        }
      } catch (_) {}
      structuredLog('INFO', 'DebugUI: Synth engine set', { synthesisEngine: newEngineId }, { traceId });
    } else {
      structuredLog('WARN', 'DebugUI: Synth engine not found or invalid', { 
        requestedEngine: newEngineId === undefined ? 'undefined' : newEngineId, 
        availableEngines: currentState.availableEngines?.map(e => e.id) || [] 
      }, { traceId });
    }
  });

  registerCommandHandler('setMaxNotes', async ({ state: s, payload, metadata }) => {
    const traceId = metadata?.traceId;
    const maxNotes = parseInt(payload.maxNotes, 10);
    if (!isNaN(maxNotes) && maxNotes >= 1 && maxNotes <= 100) {
      s.maxNotes = maxNotes;
      try {
        if (engine.audioApi && typeof engine.audioApi.setMaxNotes === 'function') {
          engine.audioApi.setMaxNotes(s.maxNotes);
        } else if (engine.audioApi && typeof engine.audioApi.resizeOscillatorPool === 'function') {
          engine.audioApi.resizeOscillatorPool(s.maxNotes);
        } else {
          structuredLog('WARN', 'setMaxNotes: audioApi not available to update pool size', {}, { traceId });
        }
      } catch (e) { structuredLog('WARN', 'setMaxNotes/resizeOscillatorPool failed', { error: e?.message }, { traceId }); }
      structuredLog('INFO', 'DebugUI: Max notes set', { maxNotes }, { traceId });
    }
  });

  registerCommandHandler('setMotionThreshold', async ({ state: s, payload, metadata }) => {
    const traceId = metadata?.traceId;
    const threshold = parseFloat(payload.motionThreshold);
    // Motion threshold range is 20-120 (pixel difference threshold)
    if (!isNaN(threshold) && threshold >= 20 && threshold <= 120) {
      s.motionThreshold = threshold;
      structuredLog('INFO', 'DebugUI: Motion threshold set', { threshold }, { traceId });
    }
  });

  registerCommandHandler('setAutoFPS', async ({ state: s, payload, metadata }) => {
    const traceId = metadata?.traceId;
    const enabled = !!payload.enabled;
    s.autoFPS = enabled;
    structuredLog('INFO', 'DebugUI: Auto FPS set', { enabled }, { traceId });
  });

  // --- Handlers for Performance Analytics/Ingest Settings ---
  registerCommandHandler('setIngestEnabled', ({ state: s, payload, metadata }) => {
    const traceId = metadata?.traceId;
    const enabled = !!payload.enabled;
    s.ingestEnabled = enabled;
    structuredLog('INFO', 'Ingest enabled set', { enabled }, { traceId });
  });

  registerCommandHandler('setIngestPreferences', ({ state: s, payload, metadata }) => {
    const traceId = metadata?.traceId;
    const preferences = payload.preferences || {};
    s.ingestPreferences = { 
      ...s.ingestPreferences, 
      ...preferences 
    };
    structuredLog('INFO', 'Ingest preferences updated', { 
      updatedPreferences: preferences,
      fullPreferences: s.ingestPreferences 
    }, { traceId });
  });

  registerCommandHandler('setIngestCategories', ({ state: s, payload, metadata }) => {
    const traceId = metadata?.traceId;
    const categories = payload.categories || {};
    s.ingestCategories = categories;
    structuredLog('INFO', 'Ingest categories updated', { 
      categoryCount: Object.keys(categories).length,
      categories: Object.keys(categories) 
    }, { traceId });
  });

  // --- Replacement handlers for state.js mutators (migrated from core/state.js)
  registerCommandHandler('setMicStream', ({ payload, metadata }) => {
    const traceId = metadata?.traceId;
    const { stream } = payload || {};
    // Use engine.setState to ensure serializable state updates and change tracing
    const current = engine.getState();
    engine.setState({ micStream: stream });
    structuredLog('INFO', 'State updated via command: setMicStream', { micStreamSet: !!stream }, { traceId });
  });

  registerCommandHandler('setAutoFpsBenchmark', ({ payload, metadata }) => {
    const traceId = metadata?.traceId;
    const { intervalMs, sampleCount = 0, safetyFactor = 0.7 } = payload || {};
    const prev = engine.getState().autoFpsBenchmark || {};
    const newBenchmarkState = {
      ...prev,
      lastIntervalMs: intervalMs,
      measuredAt: Date.now(),
      sampleCount: typeof sampleCount === 'number' ? sampleCount : prev.sampleCount || 0,
      safetyFactor: typeof safetyFactor === 'number' ? safetyFactor : prev.safetyFactor || 0.7
    };
    engine.setState({ autoFpsBenchmark: newBenchmarkState });
    structuredLog('INFO', 'State updated via command: setAutoFpsBenchmark', { settings: newBenchmarkState }, { traceId });
  });

  registerCommandHandler('setStream', ({ payload, metadata }) => {
    const traceId = metadata?.traceId;
    const { stream } = payload || {};
    engine.setState({ stream });
    structuredLog('INFO', 'State updated via command: setStream', { streamSet: !!stream }, { traceId });
  });

  registerCommandHandler('setFrameProcessor', ({ payload, metadata }) => {
    const traceId = metadata?.traceId;
    const { proc } = payload || {};
    // Store serializable descriptor only (e.g., id) to keep state JSON-serializable
    const frameProcessorId = proc?.id ?? null;
    engine.setState({ frameProcessorId });
    structuredLog('INFO', 'State updated via command: setFrameProcessor', { frameProcessorId }, { traceId });
  });

  registerCommandHandler('allocateFrameBuffer', ({ payload, metadata }) => {
    const traceId = metadata?.traceId;
    const { width = 0, height = 0 } = payload || {};
    // Do not store raw buffers in state — only metadata about allocation
    const frameBufferMeta = { width, height, allocatedAt: Date.now() };
    engine.setState({ frameBuffer: frameBufferMeta });
    structuredLog('INFO', 'State updated via command: allocateFrameBuffer', { frameBufferMeta }, { traceId });
    return { frameBufferMeta };
  });

  registerCommandHandler('setFrameBuffer', ({ payload, metadata }) => {
    const traceId = metadata?.traceId;
    const { bufMeta } = payload || {};
    engine.setState({ frameBuffer: bufMeta || null });
    structuredLog('INFO', 'State updated via command: setFrameBuffer', { hasFrameBuffer: !!bufMeta }, { traceId });
  });

  registerCommandHandler('setAudioInterval', ({ payload, metadata }) => {
    const traceId = metadata?.traceId;
    const { timerId } = payload || {};
    // Store timer id metadata only (primitive) to avoid storing functions or handles
    engine.setState({ audioTimerId: timerId ?? null });
    structuredLog('INFO', 'State updated via command: setAudioInterval', { audioTimerId: timerId ?? null }, { traceId });
  });

  registerCommandHandler('toggleSemanticDetection', ({ payload, metadata }) => {
    const traceId = metadata?.traceId;
    const currentState = engine.getState();
    const enabled = payload?.enabled !== undefined ? payload.enabled : !currentState.enableSemanticDetection;
    
    engine.setState({ enableSemanticDetection: enabled });
    structuredLog('INFO', 'Semantic detection toggled', { 
      enabled, 
      context: 'Heuristic-based person/tree/rough_ground/trash/box detection'
    }, { traceId });
  });
}
