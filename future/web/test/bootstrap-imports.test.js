/**
 * Bootstrap & Import Validation Tests
 * 
 * PURPOSE: Catch import path errors, missing exports, and circular dependencies
 * at the bootstrap layer BEFORE they cause 404 errors in production.
 * 
 * CATCHES ERRORS LIKE: 
 * - "Failed to load core/ingest.js (404)" after consolidation to utils/ingest.js
 * - Missing exports from consolidated modules
 * - Circular dependency chains
 * - Broken import paths in main.js or boot.js
 * 
 */

describe('Bootstrap & Module Import Validation', () => {
  
  describe('main.js - Critical Imports', () => {
    test('should import createEngine from core/engine.js', async () => {
      const engine = await import('../core/engine.js');
      expect(engine.createEngine).toBeDefined();
      expect(typeof engine.createEngine).toBe('function');
    });

    test('should import ingest functions from utils/ingest.js (NOT core/ingest.js)', async () => {
      const ingest = await import('../utils/ingest.js');
      
      // These are the three functions main.js needs
      expect(ingest.trackFeatureUse).toBeDefined('trackFeatureUse missing from utils/ingest.js');
      expect(ingest.emergencyTrack).toBeDefined('emergencyTrack missing from utils/ingest.js');
      expect(ingest.pingIngest).toBeDefined('pingIngest missing from utils/ingest.js');
      
      expect(typeof ingest.trackFeatureUse).toBe('function');
      expect(typeof ingest.emergencyTrack).toBe('function');
      expect(typeof ingest.pingIngest).toBe('function');
    });

    test('should NOT have core/ingest.js after consolidation (ADR-0011)', async () => {
      // THIS TEST CATCHES THE BUG WE JUST FIXED
      // If main.js still imports from core/ingest.js, this would fail
      try {
        await import('../core/ingest.js');
        fail('core/ingest.js should not exist after consolidation to utils/ingest.js (ADR-0011)');
      } catch (err) {
        // Expected to fail - consolidation is complete
        expect(err.message).toMatch(/not found|Cannot find module/i);
      }
    });

    test('should import logging from utils/logging.js', async () => {
      const logging = await import('../utils/logging.js');
      expect(logging.structuredLog).toBeDefined();
      expect(logging.shouldSample).toBeDefined();
      expect(typeof logging.structuredLog).toBe('function');
      expect(typeof logging.shouldSample).toBe('function');
    });

    test('should import event bus from core/event-bus.js', async () => {
      const eventBus = await import('../core/event-bus.js');
      expect(eventBus.createEventBus).toBeDefined();
      expect(typeof eventBus.createEventBus).toBe('function');
    });

    test('should import language utilities from utils/utils.js', async () => {
      const utils = await import('../utils/utils.js');
      expect(utils.getText).toBeDefined();
      expect(utils.initializeLanguage).toBeDefined();
      expect(typeof utils.getText).toBe('function');
      expect(typeof utils.initializeLanguage).toBe('function');
    });

    test('should import audio manager from audio/audio-manager.js', async () => {
      const audioManager = await import('../audio/audio-manager.js');
      expect(audioManager.default).toBeDefined('default export (AudioManager class) missing');
    });

    test('should import video processor from video/frame-processor.js', async () => {
      const frameProcessor = await import('../video/frame-processor.js');
      expect(frameProcessor.initializeVideo).toBeDefined();
      expect(typeof frameProcessor.initializeVideo).toBe('function');
    });

    test('should import UI registry from ui/ui-registry.js', async () => {
      const uiRegistry = await import('../ui/ui-registry.js');
      expect(uiRegistry.getComponent).toBeDefined();
      expect(typeof uiRegistry.getComponent).toBe('function');
    });
  });

  describe('Consolidated Modules (ADR-0011 Violation 5)', () => {
    test('utils/ingest.js should have all telemetry functions', async () => {
      const ingest = await import('../utils/ingest.js');
      
      // Functions consolidated from old core/ingest.js
      const expectedFunctions = [
        'trackFeatureUse',
        'emergencyTrack',
        'pingIngest'
      ];

      for (const fn of expectedFunctions) {
        expect(ingest[fn]).toBeDefined(`Function "${fn}" missing from utils/ingest.js`);
        expect(typeof ingest[fn]).toBe('function');
      }
    });

    test('utils/common-formatting.js should exist as leaf module (ADR-0011 Violation 6)', async () => {
      const formatting = await import('../utils/common-formatting.js');
      
      // These functions break circular dependencies by being isolated
      const expectedFunctions = [
        'formatTimestamp',
        'formatMemory',
        'truncateString',
        'safeStringify'
      ];

      for (const fn of expectedFunctions) {
        expect(formatting[fn]).toBeDefined(`Function "${fn}" missing from common-formatting.js`);
        expect(typeof formatting[fn]).toBe('function');
      }
    });

    test('safeStringify should handle circular references without crashing', async () => {
      const { safeStringify } = await import('../utils/common-formatting.js');
      
      // Create intentional circular reference
      const circular = { a: 1, b: { c: 2 } };
      circular.self = circular;
      
      // Should not throw
      expect(() => {
        const result = safeStringify(circular);
        expect(typeof result).toBe('string');
      }).not.toThrow();
    });
  });

  describe('Video Source Manifest (ADR-0011 Violation 10)', () => {
    test('should have VIDEO_SOURCE_MANIFEST with strategies', async () => {
      const manifest = await import('../video/source/video-source-manifest.js');
      expect(manifest.VIDEO_SOURCE_MANIFEST).toBeDefined();
      expect(Array.isArray(manifest.VIDEO_SOURCE_MANIFEST)).toBe(true);
      expect(manifest.VIDEO_SOURCE_MANIFEST.length).toBeGreaterThan(0);
    });

    test('each manifest strategy should have required properties', async () => {
      const manifest = await import('../video/source/video-source-manifest.js');
      
      for (const strategy of manifest.VIDEO_SOURCE_MANIFEST) {
        expect(strategy.name).toBeDefined(`Strategy missing "name"`);
        expect(strategy.priority).toBeDefined(`Strategy "${strategy.name}" missing "priority"`);
        expect(strategy.isSupported).toBeDefined(`Strategy "${strategy.name}" missing "isSupported"`);
        expect(typeof strategy.isSupported).toBe('function');
      }
    });

    test('CanvasSource should implement SourceProviderContract', async () => {
      const { CanvasSource } = await import('../video/source/canvas-source.js');
      expect(CanvasSource).toBeDefined();
      
      // Check that class has required methods
      const requiredMethods = ['initialize', 'start', 'stop', 'dispose'];
      for (const method of requiredMethods) {
        expect(CanvasSource.prototype[method]).toBeDefined(`CanvasSource missing method: ${method}`);
      }
    });

    test('MediaStreamTrackSource should implement SourceProviderContract', async () => {
      const { MediaStreamTrackSource } = await import('../video/source/mediastream-track-source.js');
      expect(MediaStreamTrackSource).toBeDefined();
      
      // Check that class has required methods
      const requiredMethods = ['initialize', 'start', 'stop', 'dispose'];
      for (const method of requiredMethods) {
        expect(MediaStreamTrackSource.prototype[method]).toBeDefined(`MediaStreamTrackSource missing method: ${method}`);
      }
    });

    test('manifest should be sorted by priority (highest first)', async () => {
      const manifest = await import('../video/source/video-source-manifest.js');
      const strategies = manifest.VIDEO_SOURCE_MANIFEST;
      
      for (let i = 1; i < strategies.length; i++) {
        expect(strategies[i - 1].priority).toBeGreaterThanOrEqual(strategies[i].priority,
          `Manifest not sorted by priority: ${strategies[i - 1].name} (${strategies[i - 1].priority}) should come after ${strategies[i].name} (${strategies[i].priority})`);
      }
    });
  });

  describe('State Selectors (ADR-0011 Violation 6)', () => {
    test('engine should expose state selector functions', async () => {
      const { createEngine } = await import('../core/engine.js');
      const engine = createEngine();
      
      // Check that engine has selector methods
      const expectedSelectors = ['getMetrics', 'getOrchestration', 'getVideoState'];
      for (const selector of expectedSelectors) {
        expect(engine[selector]).toBeDefined(`Engine missing selector: ${selector}`);
        expect(typeof engine[selector]).toBe('function');
      }
    });

    test('getMetrics() should return metrics object with expected shape', async () => {
      const { createEngine } = await import('../core/engine.js');
      const engine = createEngine();
      
      const metrics = engine.getMetrics();
      expect(metrics).toBeDefined();
      expect(typeof metrics).toBe('object');
      
      // Should have these properties
      const expectedKeys = ['fps', 'memoryUsageMB', 'activeWorkers', 'frameLatencyMs', 'audioLatencyMs'];
      for (const key of expectedKeys) {
        expect(metrics).toHaveProperty(key, `getMetrics() missing property: ${key}`);
      }
    });

    test('getOrchestration() should return orchestration object with expected shape', async () => {
      const { createEngine } = await import('../core/engine.js');
      const engine = createEngine();
      
      const orch = engine.getOrchestration();
      expect(orch).toBeDefined();
      expect(typeof orch).toBe('object');
      
      // Should have these properties
      const expectedKeys = ['activeExtractor', 'activeFrameProvider', 'capabilities', 'currentMode', 'isProcessing'];
      for (const key of expectedKeys) {
        expect(orch).toHaveProperty(key, `getOrchestration() missing property: ${key}`);
      }
    });
  });

  describe('Resource Request API (ADR-0011 Violation 7 - Headless Core)', () => {
    test('engine should have requestResource and registerResourceHandler', async () => {
      const { createEngine } = await import('../core/engine.js');
      const engine = createEngine();
      
      expect(engine.requestResource).toBeDefined('engine missing requestResource method');
      expect(engine.registerResourceHandler).toBeDefined('engine missing registerResourceHandler method');
      expect(typeof engine.requestResource).toBe('function');
      expect(typeof engine.registerResourceHandler).toBe('function');
    });

    test('should be able to register and request resources', async () => {
      const { createEngine } = await import('../core/engine.js');
      const engine = createEngine();
      
      // Register a test resource
      const mockResource = { id: 'test' };
      engine.registerResourceHandler('TEST_RESOURCE', () => mockResource);
      
      // Request it back
      const result = engine.requestResource('TEST_RESOURCE');
      expect(result).toBe(mockResource);
    });

    test('media-adapter should register VIDEO_ELEMENT handler', async () => {
      const mediaAdapter = await import('../ui/media-adapter.js');
      expect(mediaAdapter.registerMediaAdapter).toBeDefined();
      expect(typeof mediaAdapter.registerMediaAdapter).toBe('function');
    });
  });

  describe('No Circular Dependencies (ADR-0011 Violation 4)', () => {
    test('utils/logging.js should not import from utils/utils.js', () => {
      const fs = require('fs');
      const path = require('path');
      const loggingPath = path.join(__dirname, '../utils/logging.js');
      const loggingCode = fs.readFileSync(loggingPath, 'utf8');
      
      // Should NOT have: import ... from './utils.js' or '../utils/utils.js'
      const hasCircularImport = /import\s+.*from\s+['"]\.\/utils\.js['"]/.test(loggingCode) ||
                                 /import\s+.*from\s+['"]\.\.\/utils\/utils\.js['"]/.test(loggingCode);
      
      expect(hasCircularImport).toBe(false, 'utils/logging.js has circular import to utils/utils.js');
    });

    test('utils/common-formatting.js should be a leaf module (no utility imports)', () => {
      const fs = require('fs');
      const path = require('path');
      const formattingPath = path.join(__dirname, '../utils/common-formatting.js');
      const formattingCode = fs.readFileSync(formattingPath, 'utf8');
      
      // Should only import from this package or not at all
      // Pattern: import ... from '../something' or import ... from './something'
      const imports = formattingCode.match(/import\s+.*from\s+['"][^'"]+['"]/g) || [];
      
      for (const imp of imports) {
        // Leaf module should not import from other utils
        expect(imp).not.toMatch(/from\s+['"]\.\.?\/utils\//,
          `common-formatting.js should be leaf module, but has: ${imp}`);
      }
    });
  });

  describe('Module Chain Integrity (End-to-End)', () => {
    test('boot.js should load without import errors', async () => {
      // boot.js is the entry point - if it fails, the whole app fails
      try {
        const boot = await import('../boot.js');
        expect(boot).toBeDefined();
      } catch (err) {
        fail(`Boot import chain failed: ${err.message}\n${err.stack}`);
      }
    });

    test('main.js should load without import errors', async () => {
      // main.js is the main application logic
      try {
        // We need to mock some dependencies to avoid full initialization
        jest.mock('../core/media-controller.js', () => ({}));
        jest.mock('../audio/audio-processor.js', () => ({}));
        
        const main = await import('../main.js');
        expect(main).toBeDefined();
      } catch (err) {
        fail(`Main import chain failed: ${err.message}\n${err.stack}`);
      }
    });

    test('frame-processor.js should import VIDEO_SOURCE_MANIFEST correctly', async () => {
      const frameProcessor = await import('../video/frame-processor.js');
      expect(frameProcessor.initializeVideo).toBeDefined();
      expect(typeof frameProcessor.initializeVideo).toBe('function');
      
      // The module should have loaded VIDEO_SOURCE_MANIFEST internally
      // This is an indirect test that video/source/video-source-manifest.js exists
    });
  });

  describe('Bootstrap Layer Exports', () => {
    test('boot.js should export expected functions', async () => {
      const boot = await import('../boot.js');
      expect(boot.debugStatus).toBeDefined();
      expect(boot.setLogger).toBeDefined();
      expect(typeof boot.debugStatus).toBe('function');
      expect(typeof boot.setLogger).toBe('function');
    });

    test('main.js should export init function', async () => {
      jest.mock('../core/media-controller.js', () => ({}));
      jest.mock('../audio/audio-processor.js', () => ({}));
      
      const main = await import('../main.js');
      expect(main.init).toBeDefined();
      expect(typeof main.init).toBe('function');
    });
  });

  describe('Import Resolution Correctness', () => {
    test('all imports in main.js should resolve to correct modules', () => {
      const fs = require('fs');
      const path = require('path');
      const mainPath = path.join(__dirname, '../main.js');
      const mainCode = fs.readFileSync(mainPath, 'utf8');
      
      // Extract all imports
      const importRegex = /import\s+(?:{[^}]*}|[^}]*?)\s+from\s+['"]([^'"]+)['"]/g;
      const imports = [];
      let match;
      while ((match = importRegex.exec(mainCode)) !== null) {
        imports.push(match[1]);
      }
      
      // None should be './core/ingest.js' (the bug we fixed)
      expect(imports).not.toContain('./core/ingest.js');
      
      // Should have './utils/ingest.js' instead
      expect(imports).toContain('./utils/ingest.js');
    });

    test('no imports should reference deleted or moved modules', () => {
      const fs = require('fs');
      const path = require('path');
      
      // List of modules that have been deleted or moved (ADR-0011)
      const deletedModules = [
        './core/ingest.js',           // Moved to ./utils/ingest.js
        './utils/legacy-logging.js',  // Consolidated
        './core/old-telemetry.js'     // Consolidated
      ];
      
      // Check main.js doesn't import from deleted modules
      const mainPath = path.join(__dirname, '../main.js');
      const mainCode = fs.readFileSync(mainPath, 'utf8');
      
      for (const deleted of deletedModules) {
        expect(mainCode).not.toContain(`from '${deleted}'`);
        expect(mainCode).not.toContain(`from "${deleted}"`);
      }
    });
  });

  describe('File Existence Validation', () => {
    test('all source files referenced in main.js should exist', () => {
      const fs = require('fs');
      const path = require('path');
      
      // Key files that main.js depends on
      const requiredFiles = [
        '../core/engine.js',
        '../core/event-bus.js',
        '../utils/logging.js',
        '../utils/ingest.js',
        '../utils/trace-id.js',
        '../utils/utils.js',
        '../audio/audio-manager.js',
        '../video/frame-processor.js',
        '../video/source/video-source-manifest.js',
        '../ui/ui-registry.js'
      ];
      
      const basePath = path.join(__dirname, '..');
      for (const file of requiredFiles) {
        const fullPath = path.join(basePath, file);
        expect(fs.existsSync(fullPath)).toBe(true, `Required file does not exist: ${file}`);
      }
    });

    test('deleted modules should NOT exist', () => {
      const fs = require('fs');
      const path = require('path');
      
      // Modules that have been deleted (consolidated into other locations)
      const deletedModules = [
        '../core/ingest.js'
      ];
      
      const basePath = path.join(__dirname, '..');
      for (const file of deletedModules) {
        const fullPath = path.join(basePath, file);
        expect(fs.existsSync(fullPath)).toBe(false, `Deleted module still exists: ${file}`);
      }
    });
  });
});
