// File: web/core/commands/settings-commands.js
// Handles core settings state mutations (grid type, synth engine, maxNotes, etc.)
// Persistence moved to persistence-commands.js
// UI convenience handlers removed - they belong in UI modules

import { structuredLog } from '../../utils/logging.js';
import { getText } from '../../utils/utils.js';
import * as audioProcessor from '../../audio/audio-processor.js';
import { getAudioApi, setSelectedSynthEngine } from '../../audio/audio-processor.js';

export function registerSettingsCommands(engine) {
  const { registerCommandHandler, dispatch } = engine;

  // --- Handlers for Debug UI Controls ---  
  registerCommandHandler('setGridType', ({ payload }) => {
    structuredLog('DEBUG', 'setGridType handler ENTRY', { 
      payloadType: typeof payload,
      payloadKeys: payload ? Object.keys(payload) : 'null',
      payloadRaw: payload
    });
    
    const newGridId = payload.gridType;
    const currentState = engine.getState();
    
    // Debug: Log what we received
    structuredLog('DEBUG', 'setGridType command received', { 
      gridType: newGridId === undefined ? 'undefined' : String(newGridId)
    });
    
    if (currentState.availableGrids && currentState.availableGrids.find(g => g.id === newGridId)) {
      engine.setState({ gridType: newGridId });
      structuredLog('INFO', 'DebugUI: Grid type set', { gridType: newGridId });
    } else {
      structuredLog('WARN', 'DebugUI: Grid type not found or invalid', { 
        requestedGridType: newGridId === undefined ? 'undefined' : newGridId, 
        availableGrids: currentState.availableGrids?.map(g => g.id) || [] 
      });
    }
  });

  registerCommandHandler('setSynthEngine', ({ payload }) => {
    structuredLog('DEBUG', 'setSynthEngine handler ENTRY', { 
      payloadType: typeof payload,
      payloadKeys: payload ? Object.keys(payload) : 'null',
      payloadRaw: payload
    });
    
    const newEngineId = payload.synthesisEngine; // Standardized parameter name
    const currentState = engine.getState();
    
    // Debug: Log what we received
    structuredLog('DEBUG', 'setSynthEngine command received', { 
      synthesisEngine: newEngineId === undefined ? 'undefined' : String(newEngineId)
    });
    
    if (currentState.availableEngines && currentState.availableEngines.find(e => e.id === newEngineId)) {
      engine.setState({ synthesisEngine: newEngineId });
      try { setSelectedSynthEngine(newEngineId); } catch (_) {}
      structuredLog('INFO', 'DebugUI: Synth engine set', { synthesisEngine: newEngineId });
    } else {
      structuredLog('WARN', 'DebugUI: Synth engine not found or invalid', { 
        requestedEngine: newEngineId === undefined ? 'undefined' : newEngineId, 
        availableEngines: currentState.availableEngines?.map(e => e.id) || [] 
      });
    }
  });

  registerCommandHandler('setMaxNotes', async ({ state: s, payload }) => {
    const maxNotes = parseInt(payload.maxNotes, 10);
    if (!isNaN(maxNotes) && maxNotes >= 1 && maxNotes <= 100) {
      s.maxNotes = maxNotes;
      try {
        const api = getAudioApi();
        if (api && typeof api.setMaxNotes === 'function') api.setMaxNotes(s.maxNotes);
        else audioProcessor.resizeOscillatorPool(s.maxNotes);
      } catch (e) { structuredLog('WARN', 'setMaxNotes/resizeOscillatorPool failed', { error: e?.message }); }
      structuredLog('INFO', 'DebugUI: Max notes set', { maxNotes });
    }
  });

  registerCommandHandler('setMotionThreshold', async ({ state: s, payload }) => {
    const threshold = parseFloat(payload.motionThreshold);
    // Motion threshold range is 20-120 (pixel difference threshold)
    if (!isNaN(threshold) && threshold >= 20 && threshold <= 120) {
      s.motionThreshold = threshold;
      structuredLog('INFO', 'DebugUI: Motion threshold set', { threshold });
    }
  });

  registerCommandHandler('setAutoFPS', async ({ state: s, payload }) => {
    const enabled = !!payload.enabled;
    s.autoFPS = enabled;
    structuredLog('INFO', 'DebugUI: Auto FPS set', { enabled });
  });

  // --- Handlers for Performance Analytics/Ingest Settings ---
  registerCommandHandler('setIngestEnabled', ({ state: s, payload }) => {
    const enabled = !!payload.enabled;
    s.ingestEnabled = enabled;
    structuredLog('INFO', 'Ingest enabled set', { enabled });
  });

  registerCommandHandler('setIngestPreferences', ({ state: s, payload }) => {
    const preferences = payload.preferences || {};
    s.ingestPreferences = { 
      ...s.ingestPreferences, 
      ...preferences 
    };
    structuredLog('INFO', 'Ingest preferences updated', { 
      updatedPreferences: preferences,
      fullPreferences: s.ingestPreferences 
    });
  });

  registerCommandHandler('setIngestCategories', ({ state: s, payload }) => {
    const categories = payload.categories || {};
    s.ingestCategories = categories;
    structuredLog('INFO', 'Ingest categories updated', { 
      categoryCount: Object.keys(categories).length,
      categories: Object.keys(categories) 
    });
  });
}
