/**
 * haptic-shim.js - Test Haptic Utilities
 * 
 * Centralized setup for haptic testing in Node.js environments.
 * Consolidates vibration-related global mocking and test utilities.
 */

/**
 * Setup haptic globals for test environment.
 * Provides navigator.vibrate stub and tracking for assertions.
 * 
 * @returns {Object} Tracking object with captured vibration patterns
 * 
 * @example
 * const haptics = setupHapticShim();
 * // navigator.vibrate is now available
 * navigator.vibrate([50, 100, 50]);
 * expect(haptics.lastPattern).toEqual([50, 100, 50]);
 */
export function setupHapticShim() {
  const tracking = {
    lastPattern: null,
    patterns: [],
    callCount: 0
  };

  if (typeof global !== 'undefined' && !global.navigator) {
    global.navigator = {};
  }

  global.navigator.vibrate = (pattern) => {
    tracking.lastPattern = pattern;
    if (Array.isArray(pattern)) {
      tracking.patterns.push([...pattern]);
    } else if (typeof pattern === 'number') {
      tracking.patterns.push(pattern);
    }
    tracking.callCount++;
  };

  return tracking;
}

/**
 * Reset haptic tracking between tests.
 * 
 * @param {Object} tracking - Tracking object from setupHapticShim()
 * 
 * @example
 * resetHapticTracking(haptics);
 */
export function resetHapticTracking(tracking) {
  if (!tracking) return;
  tracking.lastPattern = null;
  tracking.patterns = [];
  tracking.callCount = 0;
}

/**
 * Assert that a specific vibration pattern was triggered.
 * 
 * @param {Object} tracking - Tracking object from setupHapticShim()
 * @param {Array|number} expectedPattern - Expected pattern
 * @param {string} message - Optional assertion message
 * @throws {Error} If pattern doesn't match
 * 
 * @example
 * assertHapticPattern(haptics, [30, 50, 30], "Three pulses expected");
 */
export function assertHapticPattern(tracking, expectedPattern, message = '') {
  if (!tracking) {
    throw new Error('Haptic tracking not initialized. Call setupHapticShim() first.');
  }

  const isEqual = (a, b) => {
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((v, i) => v === b[i]);
    }
    return a === b;
  };

  if (!isEqual(tracking.lastPattern, expectedPattern)) {
    throw new Error(
      `Haptic pattern mismatch. ${message}\n` +
      `Expected: ${JSON.stringify(expectedPattern)}\n` +
      `Actual: ${JSON.stringify(tracking.lastPattern)}`
    );
  }
}

/**
 * Get count of vibration calls.
 * 
 * @param {Object} tracking - Tracking object from setupHapticShim()
 * @returns {number} Number of vibrate() calls
 */
export function getHapticCallCount(tracking) {
  return tracking?.callCount || 0;
}

/**
 * Get all captured vibration patterns.
 * 
 * @param {Object} tracking - Tracking object from setupHapticShim()
 * @returns {Array} Array of all patterns captured
 */
export function getHapticPatterns(tracking) {
  return tracking?.patterns || [];
}
