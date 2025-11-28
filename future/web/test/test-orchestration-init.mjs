#!/usr/bin/env node
/**
 * Quick test to verify orchestration state initialization
 */

import { createEngine } from '../core/engine.js';

console.log('Testing orchestration state initialization...\n');

try {
  const engine = createEngine();
  console.log('✓ Engine created successfully');
  
  const state = engine.getState();
  console.log('✓ Got state from engine');
  
  if (!state.orchestration) {
    console.error('✗ ERROR: orchestration state is missing!');
    process.exit(1);
  }
  
  console.log('✓ Orchestration state exists');
  console.log('\nOrchestration State Structure:');
  console.log('  activeExtractor:', state.orchestration.activeExtractor);
  console.log('  isMonitoring:', state.orchestration.isMonitoring);
  console.log('  capabilities:', Object.keys(state.orchestration.capabilities).length, 'fields');
  console.log('  metrics:', Object.keys(state.orchestration.metrics).length, 'fields');
  console.log('  decisionLog length:', state.orchestration.decisionLog.length);
  console.log('  currentMode:', state.orchestration.currentMode);
  console.log('  qualityProfile:', state.orchestration.qualityProfile.name);
  
  console.log('\nCapabilities Detail:');
  Object.entries(state.orchestration.capabilities).forEach(([key, value]) => {
    console.log(`  - ${key}: ${value}`);
  });
  
  console.log('\n✓ All orchestration state fields present and initialized!');
  console.log('✓ Test PASSED');
  
} catch (error) {
  console.error('✗ Test FAILED:', error.message);
  console.error(error.stack);
  process.exit(1);
}
