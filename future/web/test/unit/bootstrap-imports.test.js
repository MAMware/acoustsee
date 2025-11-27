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
      const engine = await import('../../core/engine.js');
      expect(engine.createEngine).toBeDefined();
      expect(typeof engine.createEngine).toBe('function');
    });

    test('should import ingest functions from utils/ingest.js (NOT core/ingest.js)', async () => {
      const ingest = await import('../../utils/ingest.js');
      
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
        await import('../../core/ingest.js');
        fail('core/ingest.js should not exist after consolidation to utils/ingest.js (ADR-0011)');
      } catch (err) {
        // Expected to fail - consolidation is complete
        expect(err.message).toMatch(/not found|Cannot find module/i);
      }
    });

    test('should import logging from utils/logging.js', async () => {
      const logging = await import('../../utils/logging.js');
      expect(logging.structuredLog).toBeDefined();
      expect(logging.shouldSample).toBeDefined();
      expect(typeof logging.structuredLog).toBe('function');
      expect(typeof logging.shouldSample).toBe('function');
    });

    test('should import event bus from core/event-bus.js', async () => {
      const eventBus = await import('../../core/event-bus.js');
      expect(eventBus.createEventBus).toBeDefined();
      expect(typeof eventBus.createEventBus).toBe('function');
    });
  });

  describe('Module Chain Integrity (End-to-End)', () => {
    test('boot.js should load without import errors', async () => {
      // boot.js is the entry point - if it fails, the whole app fails
      try {
        const boot = await import('../../boot.js');
        expect(boot).toBeDefined();
      } catch (err) {
        fail(`Boot import chain failed: ${err.message}`);
      }
    });

    test('main.js should load without import errors', async () => {
      try {
        const main = await import('../../main.js');
        expect(main).toBeDefined();
      } catch (err) {
        fail(`Main import chain failed: ${err.message}`);
      }
    });
  });

  describe('File Existence Validation', () => {
    test('all source files referenced in main.js should exist', () => {
      const fs = require('fs');
      const path = require('path');
      
      // Key files that main.js depends on
      const requiredFiles = [
        '../../core/engine.js',
        '../../core/event-bus.js',
        '../../utils/logging.js',
        '../../utils/ingest.js',
        '../../audio/audio-manager.js',
        '../../video/frame-processor.js',
        '../../ui/ui-registry.js'
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
        '../../core/ingest.js'
      ];
      
      const basePath = path.join(__dirname, '..');
      for (const file of deletedModules) {
        const fullPath = path.join(basePath, file);
        expect(fs.existsSync(fullPath)).toBe(false, `Deleted module still exists: ${file}`);
      }
    });
  });
});
