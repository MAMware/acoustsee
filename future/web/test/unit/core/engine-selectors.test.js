/**
 * Unit tests for engine state selectors (ADR-0011: Hexagonal Purity)
 * 
 * These tests verify the selector pattern that decouples UI from internal state structure.
 * Selectors provide null-safe access and a stable API contract for consumers.
 * 
 * Test coverage:
 * - Empty/undefined state handling (null-safety)
 * - Partial state (some fields present, others missing)
 * - Complete state (all fields populated)
 * - API contract stability (return type consistency)
 */

// Mock dependencies to isolate engine selectors
jest.mock('../../../core/media-controller.js', () => ({
  startCamera: jest.fn(),
  stopCamera: jest.fn(),
  startMic: jest.fn(),
  stopMic: jest.fn(),
  isCameraActive: jest.fn()
}));

jest.mock('../../../audio/audio-processor.js', () => ({
  playCues: jest.fn(),
  resizeOscillatorPool: jest.fn()
}));

jest.mock('../../../utils/utils.js', () => ({
  getText: jest.fn(async (key) => key),
  speakText: jest.fn(),
  setLanguage: jest.fn(),
  translatePage: jest.fn(),
  announceMessage: jest.fn()
}));

jest.mock('../../../video/frame-processor.js', () => ({
  processFrameWithState: jest.fn(async () => ({ cues: [] })),
  initializeVideo: jest.fn(async () => ({}))
}));

jest.mock('../../../utils/logging.js', () => ({
  structuredLog: jest.fn(),
  throttleError: jest.fn(() => ({ log: false })),
  shouldSample: jest.fn(() => false),
  default: { logError: jest.fn() }
}));

// Import the real createEngine to test actual selector implementation
import { createEngine } from '../../../core/engine.js';

describe('Engine State Selectors (ADR-0011)', () => {
  let engine;

  beforeEach(() => {
    engine = createEngine();
  });

  describe('getMetrics()', () => {
    test('returns default values when state is empty/undefined', () => {
      const metrics = engine.getMetrics();
      
      // All fields should have safe defaults (not undefined or null)
      expect(metrics.fps).toBe(0);
      expect(metrics.memoryUsageMB).toBe(0);
      expect(metrics.activeWorkers).toBe(0);
      expect(metrics.frameLatencyMs).toBe(0);
      expect(metrics.audioLatencyMs).toBe(0);
    });

    test('returns actual values when state is populated', () => {
      // Set state with real metric values
      engine.setState({
        orchestration: {
          metrics: {
            fps: 30,
            activeWorkers: 2,
            frameLatencyMs: 12.5
          }
        },
        metrics: {
          memoryUsageMB: 45.2,
          audioLatencyMs: 8.3
        }
      });

      const metrics = engine.getMetrics();
      
      expect(metrics.fps).toBe(30);
      expect(metrics.memoryUsageMB).toBe(45.2);
      expect(metrics.activeWorkers).toBe(2);
      expect(metrics.frameLatencyMs).toBe(12.5);
      expect(metrics.audioLatencyMs).toBe(8.3);
    });

    test('handles partial state (some fields missing)', () => {
      // Only set orchestration.metrics.fps
      engine.setState({
        orchestration: {
          metrics: {
            fps: 24
            // activeWorkers missing
            // frameLatencyMs missing
          }
        }
        // metrics object missing entirely
      });

      const metrics = engine.getMetrics();
      
      expect(metrics.fps).toBe(24);
      expect(metrics.memoryUsageMB).toBe(0); // default
      expect(metrics.activeWorkers).toBe(0); // default
      expect(metrics.frameLatencyMs).toBe(0); // default
      expect(metrics.audioLatencyMs).toBe(0); // default
    });

    test('returns consistent object shape (API contract)', () => {
      const metrics = engine.getMetrics();
      
      // Verify all expected keys exist
      expect(metrics).toHaveProperty('fps');
      expect(metrics).toHaveProperty('memoryUsageMB');
      expect(metrics).toHaveProperty('activeWorkers');
      expect(metrics).toHaveProperty('frameLatencyMs');
      expect(metrics).toHaveProperty('audioLatencyMs');
      
      // Verify types
      expect(typeof metrics.fps).toBe('number');
      expect(typeof metrics.memoryUsageMB).toBe('number');
      expect(typeof metrics.activeWorkers).toBe('number');
      expect(typeof metrics.frameLatencyMs).toBe('number');
      expect(typeof metrics.audioLatencyMs).toBe('number');
    });
  });

  describe('getOrchestration()', () => {
    test('returns default values when state is empty/undefined', () => {
      const orch = engine.getOrchestration();
      
      expect(orch.activeExtractor).toBeNull();
      expect(orch.activeFrameProvider).toBeNull();
      expect(orch.capabilities).toEqual({});
      expect(orch.decisionLog).toEqual([]);
      expect(orch.currentMode).toBe('flow');
      expect(orch.isProcessing).toBe(false);
      expect(orch.metrics).toEqual({});
      expect(orch.videoWorkerDebugConfig).toBeNull();
    });

    test('returns actual values when state is populated', () => {
      engine.setState({
        orchestration: {
          activeExtractor: 'MediaStreamTrackProcessor',
          activeFrameProvider: 'canvas-2d',
          capabilities: { webgl: true, webgpu: false },
          decisionLog: [{ time: 1234, decision: 'selected canvas' }],
          isProcessing: true,
          metrics: { fps: 30 }
        },
        currentMode: 'focus',
        videoWorkerDebugConfig: { enableProfiling: true }
      });

      const orch = engine.getOrchestration();
      
      expect(orch.activeExtractor).toBe('MediaStreamTrackProcessor');
      expect(orch.activeFrameProvider).toBe('canvas-2d');
      expect(orch.capabilities).toEqual({ webgl: true, webgpu: false });
      expect(orch.decisionLog).toHaveLength(1);
      expect(orch.currentMode).toBe('focus');
      expect(orch.isProcessing).toBe(true);
      expect(orch.videoWorkerDebugConfig).toEqual({ enableProfiling: true });
    });

    test('handles partial state (some fields missing)', () => {
      engine.setState({
        orchestration: {
          activeExtractor: 'WASM-SIMD'
          // Other orchestration fields missing
        },
        currentMode: 'hybrid'
        // videoWorkerDebugConfig missing
      });

      const orch = engine.getOrchestration();
      
      expect(orch.activeExtractor).toBe('WASM-SIMD');
      expect(orch.activeFrameProvider).toBeNull(); // default
      expect(orch.capabilities).toEqual({}); // default
      expect(orch.decisionLog).toEqual([]); // default
      expect(orch.currentMode).toBe('hybrid');
      expect(orch.isProcessing).toBe(false); // default
      expect(orch.videoWorkerDebugConfig).toBeNull(); // default
    });

    test('returns consistent object shape (API contract)', () => {
      const orch = engine.getOrchestration();
      
      // Verify all expected keys exist
      expect(orch).toHaveProperty('activeExtractor');
      expect(orch).toHaveProperty('activeFrameProvider');
      expect(orch).toHaveProperty('capabilities');
      expect(orch).toHaveProperty('decisionLog');
      expect(orch).toHaveProperty('currentMode');
      expect(orch).toHaveProperty('isProcessing');
      expect(orch).toHaveProperty('metrics');
      expect(orch).toHaveProperty('videoWorkerDebugConfig');
      
      // Verify types
      expect(Array.isArray(orch.decisionLog)).toBe(true);
      expect(typeof orch.capabilities).toBe('object');
      expect(typeof orch.isProcessing).toBe('boolean');
      expect(typeof orch.currentMode).toBe('string');
    });
  });

  describe('getVideoState()', () => {
    test('returns default values when state is empty/undefined', () => {
      const video = engine.getVideoState();
      
      expect(video.currentMode).toBe('flow');
      expect(video.usingCanvas).toBe(false);
      expect(video.detectedAt).toBeNull();
      expect(video.activeFrameProvider).toBeNull();
      expect(video.frameProviderOverride).toBeNull();
    });

    test('returns actual values when state is populated', () => {
      engine.setState({
        currentMode: 'focus',
        videoCapture: {
          usingCanvas: true,
          detectedAt: 1700000000000
        },
        orchestration: {
          activeFrameProvider: 'canvas-2d'
        },
        frameProviderOverride: 'MediaStreamTrackProcessor'
      });

      const video = engine.getVideoState();
      
      expect(video.currentMode).toBe('focus');
      expect(video.usingCanvas).toBe(true);
      expect(video.detectedAt).toBe(1700000000000);
      expect(video.activeFrameProvider).toBe('canvas-2d');
      expect(video.frameProviderOverride).toBe('MediaStreamTrackProcessor');
    });

    test('handles partial state (some fields missing)', () => {
      engine.setState({
        currentMode: 'hybrid',
        videoCapture: {
          usingCanvas: true
          // detectedAt missing
        }
        // orchestration missing
        // frameProviderOverride missing
      });

      const video = engine.getVideoState();
      
      expect(video.currentMode).toBe('hybrid');
      expect(video.usingCanvas).toBe(true);
      expect(video.detectedAt).toBeNull(); // default
      expect(video.activeFrameProvider).toBeNull(); // default
      expect(video.frameProviderOverride).toBeNull(); // default
    });

    test('returns consistent object shape (API contract)', () => {
      const video = engine.getVideoState();
      
      // Verify all expected keys exist
      expect(video).toHaveProperty('currentMode');
      expect(video).toHaveProperty('usingCanvas');
      expect(video).toHaveProperty('detectedAt');
      expect(video).toHaveProperty('activeFrameProvider');
      expect(video).toHaveProperty('frameProviderOverride');
      
      // Verify types
      expect(typeof video.currentMode).toBe('string');
      expect(typeof video.usingCanvas).toBe('boolean');
    });
  });

  describe('Selector Independence (Decoupling Verification)', () => {
    test('UI can use selectors without knowing internal state structure', () => {
      // Simulate what UI code should look like:
      // Instead of: const fps = engine.getState().orchestration?.metrics?.fps ?? 0
      // UI uses: const { fps } = engine.getMetrics()
      
      engine.setState({
        orchestration: {
          metrics: { fps: 60, activeWorkers: 4 }
        }
      });

      // UI code pattern (clean, decoupled)
      const { fps, activeWorkers } = engine.getMetrics();
      expect(fps).toBe(60);
      expect(activeWorkers).toBe(4);

      // Even if internal structure changes, the selector API remains stable
      // This test documents the contract that UI depends on
    });

    test('selectors return fresh objects (not references to internal state)', () => {
      engine.setState({
        orchestration: {
          metrics: { fps: 30 }
        }
      });

      const metrics1 = engine.getMetrics();
      const metrics2 = engine.getMetrics();

      // Modifying returned object should not affect internal state
      metrics1.fps = 999;
      
      // Next call should still return original value
      expect(metrics2.fps).toBe(30);
      expect(engine.getMetrics().fps).toBe(30);
    });
  });
});
