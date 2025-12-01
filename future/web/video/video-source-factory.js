import { VIDEO_SOURCE_MANIFEST } from './source/video-source-manifest.js';
import { structuredLog } from '../utils/logging.js';
import { trackFeatureUse } from '../utils/ingest.js';

export class VideoSourceFactory {
  static async createSource(videoElement, engine, config, onFrameCallback) {
    // Level 1: Check user override
    const userOverride = engine.getState().videoSourceOverride;
    if (userOverride) {
      const strategy = VIDEO_SOURCE_MANIFEST.find(s => s.name === userOverride);
      if (strategy && strategy.isSupported()) {
        structuredLog('INFO', `Using user-selected video source: ${userOverride}`);
        return await this._initializeSource(strategy, videoElement, engine, config, onFrameCallback);
      } else {
        // STRICT GATING: User override not available
        const error = new Error(`STRATEGY_FAILURE: User-selected video source "${userOverride}" not available`);
        structuredLog('ERROR', error.message);
        trackFeatureUse('strategy-failure', {
          subsystem: 'video',
          strategy: userOverride,
          reason: 'user-override-not-supported'
        });
        throw error;
      }
    }
    
    // Level 2: Iterate manifest by priority
    for (const strategy of VIDEO_SOURCE_MANIFEST) {
      if (strategy.isSupported()) {
        structuredLog('INFO', `Selected video source: ${strategy.name}`, {
          description: strategy.description,
          priority: strategy.priority,
          capabilities: strategy.capabilities
        });
        return await this._initializeSource(strategy, videoElement, engine, config, onFrameCallback);
      }
    }
    
    // Level 3: No supported strategy found (critical failure)
    const error = new Error('CRITICAL: No supported video source available in this browser');
    structuredLog('ERROR', error.message);
    trackFeatureUse('strategy-failure', {
      subsystem: 'video',
      reason: 'no-supported-source',
      manifest: VIDEO_SOURCE_MANIFEST.map(s => ({ name: s.name, supported: s.isSupported() }))
    });
    throw error;
  }

  static async _initializeSource(strategy, videoElement, engine, config, onFrameCallback) {
    try {
      // === TELEMETRY: Video Source Selection Instrumentation ===
      // Reference: docs/design/DEV_PANEL_TELEMETRY-INSTRUMENTATION-SPEC.md (Section 1.1)
      const sourceStartTime = performance.now();
      
      // Instantiate strategy class
      const provider = new strategy.strategy(videoElement, { 
        engine,
        onFrame: onFrameCallback,
        registerWorker: config.registerWorker,
        getCurrentGrid: config.getCurrentGrid
      });
      
      // Initialize source (setup canvas, worker, etc.)
      await provider.initialize();
      
      const negotiationTime = performance.now() - sourceStartTime;
      
      // Emit appropriate telemetry event based on strategy
      if (strategy.name === 'MediaStreamTrackProcessor') {
        engine.emit('video_source_gpu_selected', {
          strategy: 'MediaStreamTrackProcessor',
          negotiationTime,
          timestamp: performance.now(),
          session_id: engine.getState?.()?.session?.id || 'unknown',
          mode: engine.getState?.()?.currentMode || 'Flow',
          preset: engine.getState?.()?.preset || 'Full'
        });
      } else if (strategy.name === 'Canvas2D') {
        engine.emit('video_source_cpu_fallback', {
          reason: 'GPU_unavailable',
          fallbackTime: negotiationTime,
          timestamp: performance.now(),
          session_id: engine.getState?.()?.session?.id || 'unknown',
          mode: engine.getState?.()?.currentMode || 'Flow',
          preset: engine.getState?.()?.preset || 'Full'
        });
      }
      
      // Start frame capture
      await provider.start();
      
      // Track active strategy in engine state
      const orchestration = engine.getState().orchestration || {};
      const newDecision = {
        timestamp: Date.now(),
        event: 'source_selected',
        reason: 'initialization',
        activeExtractor: strategy.name
      };

      // Use dispatch to ensure proper merging with existing state (e.g. capabilities)
      engine.dispatch('updateOrchestration', {
        activeExtractor: strategy.name,
        videoSourceCapabilities: strategy.capabilities,
        decisionLog: [newDecision, ...(orchestration.decisionLog || [])].slice(0, 10)
      });
      
      return provider;
    } catch (error) {
      structuredLog('ERROR', `STRATEGY_FAILURE: Failed to initialize ${strategy.name}`, { error: error.message });
      trackFeatureUse('strategy-failure', {
        subsystem: 'video',
        strategy: strategy.name,
        reason: 'initialization-exception',
        error: error.message
      });
      throw error;
    }
  }
}
