/**
 * @fileoverview Motion Threshold Validation Test Suite
 * 
 * Executable test suite for validating the motion threshold algorithm
 * in AcoustSee. Tests cover:
 * - Threshold calculation formulas
 * - Intensity scaling
 * - Adaptive adjustment logic
 * - Audio mapping
 * 
 * @module test/motion-threshold-validator
 * @usage
 *   const validator = new MotionThresholdValidator();
 *   const results = validator.runAllTests();
 *   validator.generateReport(results);
 */

/**
 * Motion Threshold Validator
 * 
 * Comprehensive testing of motion detection threshold algorithm
 */
class MotionThresholdValidator {
  constructor() {
    this.testResults = [];
    this.metrics = {
      passed: 0,
      failed: 0,
      warnings: 0
    };
  }

  /**
   * Test Suite 1: Threshold Calculation
   * Validates UI slider → pixel threshold conversion
   */
  testThresholdCalculation() {
    console.log('\n=== Test Suite 1: Threshold Calculation ===\n');

    const testCases = [
      { 
        name: 'Minimum sensitivity (insensitive)',
        uiValue: 0.0, 
        expectedThreshold: 255,
        tolerance: 0.1
      },
      { 
        name: 'Low sensitivity (75% insensitive)',
        uiValue: 0.25, 
        expectedThreshold: 191.25,
        tolerance: 1
      },
      { 
        name: 'Medium sensitivity',
        uiValue: 0.5, 
        expectedThreshold: 127.5,
        tolerance: 1
      },
      { 
        name: 'High sensitivity (75% sensitive)',
        uiValue: 0.75, 
        expectedThreshold: 63.75,
        tolerance: 1
      },
      { 
        name: 'Maximum sensitivity (noise-prone)',
        uiValue: 1.0, 
        expectedThreshold: 0,
        tolerance: 0.1
      }
    ];

    testCases.forEach(testCase => {
      const effectiveThreshold = (1 - testCase.uiValue) * 255;
      const pass = Math.abs(effectiveThreshold - testCase.expectedThreshold) <= testCase.tolerance;
      
      this.recordTestResult({
        suite: 'Threshold Calculation',
        test: testCase.name,
        input: `UI: ${testCase.uiValue}`,
        expected: testCase.expectedThreshold.toFixed(2),
        actual: effectiveThreshold.toFixed(2),
        pass,
        metric: 'Formula: (1 - threshold) * 255'
      });
    });
  }

  /**
   * Test Suite 2: Intensity Scaling
   * Validates optical flow magnitude → audio intensity conversion
   */
  testIntensityScaling() {
    console.log('\n=== Test Suite 2: Intensity Scaling ===\n');

    const testCases = [
      {
        name: 'No motion',
        magnitude: 0.0,
        expectedIntensity: 0,
        description: 'Static pixels'
      },
      {
        name: 'Slow motion',
        magnitude: 2.5,
        expectedIntensity: 25,
        description: 'Gentle hand movement'
      },
      {
        name: 'Medium motion',
        magnitude: 12.5,
        expectedIntensity: 125,
        description: 'Normal gesture speed'
      },
      {
        name: 'Fast motion',
        magnitude: 25.0,
        expectedIntensity: 255,
        description: 'Quick gesture (clamped)'
      },
      {
        name: 'Very fast motion (overflow)',
        magnitude: 50.0,
        expectedIntensity: 255,
        description: 'Extremely fast (clamped at 255)'
      }
    ];

    testCases.forEach(testCase => {
      const intensity = Math.min(255, Math.floor(testCase.magnitude * 10));
      const pass = intensity === testCase.expectedIntensity;

      this.recordTestResult({
        suite: 'Intensity Scaling',
        test: testCase.name,
        input: `Magnitude: ${testCase.magnitude}`,
        expected: testCase.expectedIntensity,
        actual: intensity,
        pass,
        metric: testCase.description,
        formula: 'intensity = min(255, floor(mag * 10))'
      });
    });
  }

  /**
   * Test Suite 3: Adaptive Threshold Logic
   * Validates automatic threshold adjustment based on region count
   */
  testAdaptiveThreshold() {
    console.log('\n=== Test Suite 3: Adaptive Threshold Logic ===\n');

    const testCases = [
      {
        name: 'Too few regions (decrease sensitivity)',
        count: 5,
        baseThreshold: 20,
        shouldChange: 'decrease',
        expectedRatio: 0.95,
        description: 'Count < 10: Make more sensitive'
      },
      {
        name: 'Sweet spot (no change)',
        count: 30,
        baseThreshold: 20,
        shouldChange: 'none',
        expectedRatio: 1.0,
        description: 'Count 10-50: Threshold stable'
      },
      {
        name: 'Too many regions (increase sensitivity)',
        count: 60,
        baseThreshold: 20,
        shouldChange: 'increase',
        expectedRatio: 1.05,
        description: 'Count > 50: Make less sensitive'
      },
      {
        name: 'Bounds check - minimum',
        count: 5,
        baseThreshold: 5,  // Already at minimum
        shouldChange: 'bounce',
        expectedRatio: 1.0,  // Should stay at 5
        description: 'Threshold clamped to 5-50 range'
      },
      {
        name: 'Bounds check - maximum',
        count: 60,
        baseThreshold: 50,  // Already at maximum
        shouldChange: 'bounce',
        expectedRatio: 1.0,  // Should stay at 50
        description: 'Threshold clamped to 5-50 range'
      }
    ];

    testCases.forEach(testCase => {
      let newThreshold = testCase.baseThreshold;
      let changeType = 'none';

      if (testCase.count < 10) {
        newThreshold = Math.max(5, testCase.baseThreshold * 0.95);
        changeType = newThreshold < testCase.baseThreshold ? 'decrease' : 'bounce';
      } else if (testCase.count > 50) {
        newThreshold = Math.min(50, testCase.baseThreshold * 1.05);
        changeType = newThreshold > testCase.baseThreshold ? 'increase' : 'bounce';
      }

      const expectedThreshold = testCase.baseThreshold * testCase.expectedRatio;
      const pass = Math.abs(newThreshold - expectedThreshold) < 0.1;

      this.recordTestResult({
        suite: 'Adaptive Threshold',
        test: testCase.name,
        input: `Count: ${testCase.count}, Base: ${testCase.baseThreshold}`,
        expected: `${expectedThreshold.toFixed(2)} (${testCase.shouldChange})`,
        actual: `${newThreshold.toFixed(2)} (${changeType})`,
        pass,
        metric: testCase.description,
        bounds: 'Clamped to [5, 50]'
      });
    });
  }

  /**
   * Test Suite 4: Boundary Conditions
   * Tests edge cases and error conditions
   */
  testBoundaryConditions() {
    console.log('\n=== Test Suite 4: Boundary Conditions ===\n');

    const testCases = [
      {
        name: 'Zero magnitude (static)',
        magnitude: 0,
        expectedIntensity: 0,
        description: 'Should not cause errors'
      },
      {
        name: 'Very small threshold (0.001)',
        uiValue: 0.999,
        expectedThreshold: 0.255,
        tolerance: 1,
        description: 'Near-noise sensitivity'
      },
      {
        name: 'Negative count edge case',
        count: 0,
        baseThreshold: 20,
        shouldDecrease: true,
        description: 'Should be treated as < 10'
      },
      {
        name: 'Very large magnitude (100)',
        magnitude: 100,
        expectedIntensity: 255,
        description: 'Should clamp to 255'
      },
      {
        name: 'Threshold at boundary (4.99)',
        threshold: 4.99,
        minBound: 5,
        description: 'Should clamp to 5'
      },
      {
        name: 'Threshold at boundary (50.01)',
        threshold: 50.01,
        maxBound: 50,
        description: 'Should clamp to 50'
      }
    ];

    testCases.forEach(testCase => {
      let pass = false;
      let actualResult = null;

      // Test threshold clamping
      if (testCase.minBound !== undefined) {
        actualResult = Math.max(testCase.minBound, testCase.threshold);
        pass = actualResult === testCase.minBound;
      } else if (testCase.maxBound !== undefined) {
        actualResult = Math.min(testCase.maxBound, testCase.threshold);
        pass = actualResult === testCase.maxBound;
      } else if (testCase.magnitude !== undefined) {
        actualResult = Math.min(255, Math.floor(testCase.magnitude * 10));
        pass = actualResult === testCase.expectedIntensity;
      } else {
        // UI threshold test
        actualResult = (1 - testCase.uiValue) * 255;
        pass = Math.abs(actualResult - testCase.expectedThreshold) <= testCase.tolerance;
      }

      this.recordTestResult({
        suite: 'Boundary Conditions',
        test: testCase.name,
        input: testCase.magnitude !== undefined ? testCase.magnitude : testCase.uiValue,
        expected: testCase.expectedIntensity || testCase.expectedThreshold || testCase.minBound || testCase.maxBound,
        actual: actualResult,
        pass,
        metric: testCase.description
      });
    });
  }

  /**
   * Test Suite 5: Audio Mapping Consistency
   * Validates that intensity maps correctly to audio gain
   */
  testAudioMapping() {
    console.log('\n=== Test Suite 5: Audio Mapping ===\n');

    const testCases = [
      {
        name: 'No motion → silence',
        intensity: 0,
        expectedGainRange: [0, 0.01],
        description: 'Audio amplitude ≈ 0'
      },
      {
        name: 'Low motion → quiet',
        intensity: 50,
        expectedGainRange: [0.02, 0.10],
        description: 'Quiet audio (< 0.1 amplitude)'
      },
      {
        name: 'Medium motion → normal',
        intensity: 128,
        expectedGainRange: [0.40, 0.60],
        description: 'Normal volume (0.4-0.6 amplitude)'
      },
      {
        name: 'High motion → loud',
        intensity: 200,
        expectedGainRange: [0.75, 0.90],
        description: 'Loud audio (0.75+ amplitude)'
      },
      {
        name: 'Maximum motion → maximum',
        intensity: 255,
        expectedGainRange: [0.90, 1.0],
        description: 'Maximum amplitude'
      }
    ];

    const MAX_GAIN = 0.15;  // From Karplus-Strong docs

    testCases.forEach(testCase => {
      // Normalized gain: intensity / 255 * MAX_GAIN
      const normalizedGain = (testCase.intensity / 255) * MAX_GAIN;
      const [minGain, maxGain] = testCase.expectedGainRange;
      
      // Scale by MAX_GAIN for actual comparison
      const expectedMin = minGain * MAX_GAIN;
      const expectedMax = maxGain * MAX_GAIN;
      const pass = normalizedGain >= expectedMin && normalizedGain <= expectedMax;

      this.recordTestResult({
        suite: 'Audio Mapping',
        test: testCase.name,
        input: `Intensity: ${testCase.intensity}`,
        expected: `Gain: ${(expectedMin * 1000).toFixed(0)}-${(expectedMax * 1000).toFixed(0)} mA`,
        actual: `Gain: ${(normalizedGain * 1000).toFixed(0)} mA`,
        pass,
        metric: testCase.description,
        formula: `gain = (intensity / 255) * ${MAX_GAIN}`
      });
    });
  }

  /**
   * Record a test result
   */
  recordTestResult(result) {
    this.testResults.push(result);

    if (result.pass) {
      this.metrics.passed++;
      console.log(`✓ ${result.test}: ${result.actual}`);
    } else {
      this.metrics.failed++;
      console.log(`✗ ${result.test}: Expected ${result.expected}, got ${result.actual}`);
    }
  }

  /**
   * Run all test suites
   */
  runAllTests() {
    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  Motion Threshold Validation Test Suite - Starting     ║');
    console.log('╚══════════════════════════════════════════════════════════╝');

    this.testThresholdCalculation();
    this.testIntensityScaling();
    this.testAdaptiveThreshold();
    this.testBoundaryConditions();
    this.testAudioMapping();

    return this.testResults;
  }

  /**
   * Generate human-readable report
   */
  generateReport(results = null) {
    results = results || this.testResults;

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║  Test Report                                           ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    // Summary
    const total = this.metrics.passed + this.metrics.failed;
    const passRate = ((this.metrics.passed / total) * 100).toFixed(1);

    console.log(`Total Tests: ${total}`);
    console.log(`Passed: ${this.metrics.passed} ✓`);
    console.log(`Failed: ${this.metrics.failed} ✗`);
    console.log(`Pass Rate: ${passRate}%\n`);

    // Detailed results by suite
    const suites = [...new Set(results.map(r => r.suite))];
    suites.forEach(suite => {
      const suiteResults = results.filter(r => r.suite === suite);
      const suitePassed = suiteResults.filter(r => r.pass).length;
      console.log(`${suite}: ${suitePassed}/${suiteResults.length}`);
    });

    // Overall status
    console.log('\n' + (this.metrics.failed === 0 
      ? '✓ All tests passed!' 
      : `✗ ${this.metrics.failed} test(s) failed`));

    return {
      passed: this.metrics.passed,
      failed: this.metrics.failed,
      total: total,
      passRate: parseFloat(passRate),
      results: results
    };
  }

  /**
   * Export results as JSON
   */
  exportAsJSON() {
    return {
      timestamp: new Date().toISOString(),
      metrics: this.metrics,
      results: this.testResults
    };
  }

  /**
   * Export results as CSV
   */
  exportAsCSV() {
    const headers = ['Suite', 'Test', 'Input', 'Expected', 'Actual', 'Pass', 'Metric'];
    const rows = this.testResults.map(r => [
      r.suite,
      r.test,
      r.input,
      r.expected,
      r.actual,
      r.pass ? 'YES' : 'NO',
      r.metric
    ]);

    const csv = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${cell}"`).join(','))
    ].join('\n');

    return csv;
  }
}

// Export for use in test files
if (typeof module !== 'undefined' && module.exports) {
  module.exports = MotionThresholdValidator;
}

// Usage example:
/*
const validator = new MotionThresholdValidator();
const results = validator.runAllTests();
validator.generateReport();

// Export results
const jsonResults = validator.exportAsJSON();
const csvResults = validator.exportAsCSV();
console.log('CSV Output:\n', csvResults);
*/
