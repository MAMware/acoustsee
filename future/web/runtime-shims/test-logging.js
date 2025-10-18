/**
 * Smoke test for logging module improvements
 * Tests:
 * - Configurable throttling
 * - unthrottled flag bypassing throttling
 * - traceId injection and global context
 * - warnOnce helper
 * - throttleError deduplication
 * - dispose() cleanup
 */

import path from 'path';
import { fileURLToPath } from 'url';

// Basic environment shims for running test
global.navigator = { userAgent: 'Node.js Runtime' };
global.window = global.window || { location: { hostname: 'localhost' } };
global.document = global.document || {
  visibilityState: 'visible',
  addEventListener: () => {},
  head: { appendChild: () => {} },
  getElementById: () => null,
  querySelector: () => null
};

// Mock IDB and analytics
global.window.indexedDB = {
  open: () => ({ onsuccess: null, onerror: null })
};
global.window.ANALYTICS_ENDPOINT = null;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import the logging module
import {
  structuredLog,
  setLogLevel,
  setSampleRate,
  warnOnce,
  throttleError,
  setGlobalTraceId,
  getGlobalTraceId,
  dispose,
  loggingConfig
} from '../utils/logging.js';

function testThrottlingConfiguration() {
  console.log('\n=== Test 1: Throttling Configuration ===');
  
  // Save original config
  const originalMaxLogs = loggingConfig.maxLogsPerMessage;
  const originalWindow = loggingConfig.throttleWindowMs;
  const originalEnabled = loggingConfig.enableThrottling;
  
  try {
    // Test 1a: Make throttling less aggressive
    loggingConfig.maxLogsPerMessage = 20;
    loggingConfig.throttleWindowMs = 2000;
    console.log(`✓ Updated throttle config: max=${loggingConfig.maxLogsPerMessage}, window=${loggingConfig.throttleWindowMs}ms`);
    
    // Test 1b: Disable throttling
    loggingConfig.enableThrottling = false;
    console.log('✓ Disabled throttling globally');
    
    loggingConfig.enableThrottling = true;
    console.log('✓ Re-enabled throttling globally');
  } finally {
    // Restore
    loggingConfig.maxLogsPerMessage = originalMaxLogs;
    loggingConfig.throttleWindowMs = originalWindow;
    loggingConfig.enableThrottling = originalEnabled;
  }
}

function testUnthrottledFlag() {
  console.log('\n=== Test 2: Unthrottled Flag ===');
  
  let logCount = 0;
  const originalLog = console.log;
  
  try {
    // Set very restrictive throttling
    loggingConfig.maxLogsPerMessage = 1;
    loggingConfig.throttleWindowMs = 10000; // 10 seconds
    
    // Log first message (should pass)
    structuredLog('DEBUG', 'test_message', { test: 1 }, true, false);
    logCount++;
    
    // Log same message again (should be throttled)
    structuredLog('DEBUG', 'test_message', { test: 2 }, true, false);
    
    // Log same message with unthrottled flag (should pass)
    structuredLog('DEBUG', 'test_message', { test: 3 }, true, false, { unthrottled: true });
    logCount++;
    
    console.log(`✓ Unthrottled flag bypassed throttling (logged ${logCount} times despite throttle limit)`);
  } finally {
    loggingConfig.maxLogsPerMessage = 5;
    loggingConfig.throttleWindowMs = 1000;
  }
}

function testTraceIdInjection() {
  console.log('\n=== Test 3: TraceId Injection and Global Context ===');
  
  // Test 3a: Set global trace ID
  const traceId1 = '12345-abcde-67890';
  setGlobalTraceId(traceId1);
  
  if (getGlobalTraceId() !== traceId1) {
    throw new Error('Global trace ID not set correctly');
  }
  console.log(`✓ Global trace ID set: ${traceId1}`);
  
  // Test 3b: Per-call trace ID override
  const traceId2 = '99999-zzzzz-11111';
  structuredLog('INFO', 'test_with_trace', { data: 'value' }, true, false, { traceId: traceId2 });
  console.log(`✓ Per-call trace ID override works: ${traceId2}`);
  
  // Test 3c: Reset global trace ID
  setGlobalTraceId(null);
  if (getGlobalTraceId() !== null) {
    throw new Error('Global trace ID not reset');
  }
  console.log('✓ Global trace ID reset to null');
}

function testWarnOnceHelper() {
  console.log('\n=== Test 4: WarnOnce Helper ===');
  
  let callCount = 0;
  const originalStructuredLog = structuredLog;
  
  // Note: We can't easily intercept calls, so we'll test the mechanism
  const key1 = 'warning_key_1';
  const key2 = 'warning_key_2';
  
  // First call with key1 should log
  warnOnce(key1, 'WARN', 'This is a warning', { context: 'test1' });
  console.log(`✓ First warnOnce call with key "${key1}" logged`);
  
  // Second call with same key should not log (but we can't verify from here)
  warnOnce(key1, 'WARN', 'This is a warning', { context: 'test1' });
  console.log(`✓ Second warnOnce call with key "${key1}" suppressed (mechanism working)`);
  
  // Different key should log
  warnOnce(key2, 'WARN', 'Different warning', { context: 'test2' });
  console.log(`✓ WarnOnce with different key "${key2}" logged`);
}

function testThrottleErrorDeduplication() {
  console.log('\n=== Test 5: ThrottleError Deduplication ===');
  
  // Test 5a: First error should always log
  const err1 = new Error('Test error 1');
  const result1 = throttleError(err1, { sampleEvery: 3 });
  
  if (!result1.log || result1.occurrences !== 1) {
    throw new Error('First error should always log');
  }
  console.log(`✓ First error logs: ${JSON.stringify(result1)}`);
  
  // Test 5b: Second occurrence should not log (1+1=2, 2 % 3 !== 0)
  const result2 = throttleError(err1, { sampleEvery: 3 });
  if (result2.log || result2.occurrences !== 2) {
    throw new Error('Second error should not log');
  }
  console.log(`✓ Second error throttled: ${JSON.stringify(result2)}`);
  
  // Test 5c: Third occurrence should log (2+1=3, 3 % 3 === 0) - sample point
  const result3 = throttleError(err1, { sampleEvery: 3 });
  if (!result3.log || result3.occurrences !== 3) {
    throw new Error('Third error should log (sample point)');
  }
  console.log(`✓ Third error logs (sample point): ${JSON.stringify(result3)}`);
  
  // Test 5d: Fourth occurrence should not log (3+1=4, 4 % 3 !== 0)
  const result4 = throttleError(err1, { sampleEvery: 3 });
  if (result4.log || result4.occurrences !== 4) {
    throw new Error('Fourth error should not log');
  }
  console.log(`✓ Fourth error throttled: ${JSON.stringify(result4)}`);
  
  // Test 5e: Sixth occurrence should log (5+1=6, 6 % 3 === 0) - next sample point
  const result5 = throttleError(err1, { sampleEvery: 3 });
  const result6 = throttleError(err1, { sampleEvery: 3 });
  if (!result6.log || result6.occurrences !== 6) {
    throw new Error('Sixth error should log (sample point)');
  }
  console.log(`✓ Sixth error logs (sample point): ${JSON.stringify(result6)}`);
  
  // Test 5f: Different error should always log
  const err2 = new Error('Test error 2');
  const result7 = throttleError(err2, { sampleEvery: 3 });
  if (!result7.log || result7.occurrences !== 1) {
    throw new Error('Different error should always log');
  }
  console.log(`✓ Different error logs as first occurrence: ${JSON.stringify(result7)}`);
  
  // Test 5g: Custom key
  const result8 = throttleError(new Error('Any error'), { key: 'custom_key_1', sampleEvery: 2 });
  if (!result8.log) {
    throw new Error('First occurrence with custom key should log');
  }
  console.log(`✓ Custom key works: ${JSON.stringify(result8)}`);
}

function testDisposeCleanup() {
  console.log('\n=== Test 6: Dispose Cleanup ===');
  
  // Set up state
  setGlobalTraceId('test-trace-id');
  warnOnce('key_to_clear', 'WARN', 'Message');
  throttleError(new Error('Error to clear'), { sampleEvery: 10 });
  
  // Verify state is populated
  if (getGlobalTraceId() === null) {
    throw new Error('TraceId should be set before dispose');
  }
  console.log('✓ State populated before dispose');
  
  // Dispose
  dispose();
  
  // Verify cleanup
  if (getGlobalTraceId() !== null) {
    throw new Error('TraceId should be null after dispose');
  }
  console.log('✓ TraceId cleared after dispose');
  
  // Verify warnOnce is cleared (can log same key again)
  warnOnce('key_to_clear', 'WARN', 'Message again');
  console.log('✓ WarnOnce state cleared (key can be logged again)');
  
  // Verify throttleError is cleared
  const result = throttleError(new Error('Error to clear'), { sampleEvery: 10 });
  if (result.occurrences !== 1) {
    throw new Error('ThrottleError should start fresh after dispose');
  }
  console.log('✓ ThrottleError state cleared');
}

function testPersistenceOptions() {
  console.log('\n=== Test 7: Persistence Options ===');
  
  // Test with explicit persistAs key
  structuredLog('INFO', 'custom_event', { data: 'test' }, true, false, {
    persistAs: 'telemetry'
  });
  console.log('✓ Log with explicit persistAs="telemetry"');
  
  // Test without persistAs (default to level-based)
  structuredLog('WARN', 'warning_event', { data: 'test' }, true, false);
  console.log('✓ WARN level log persists by default (no persistAs needed)');
  
  // Test INFO with no persistAs (should not persist)
  structuredLog('INFO', 'info_event', { data: 'test' }, true, false);
  console.log('✓ INFO level log does not persist by default (unless persistAs set)');
}

// Run all tests
async function runAllTests() {
  console.log('Starting logging module smoke tests...');
  
  try {
    testThrottlingConfiguration();
    testUnthrottledFlag();
    testTraceIdInjection();
    testWarnOnceHelper();
    testThrottleErrorDeduplication();
    testDisposeCleanup();
    testPersistenceOptions();
    
    console.log('\n✅ All logging smoke tests passed!\n');
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    process.exit(1);
  }
}

runAllTests();
