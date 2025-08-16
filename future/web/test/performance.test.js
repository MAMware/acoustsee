// File: web/test/performance.test.js
import { computeDefaultMaxNotes } from '../utils/performance.js';

describe('computeDefaultMaxNotes', () => {
  it('should return a low value for a low-spec mobile device', () => {
    // Arrange: Create mock helper functions
    const mockIsMobile = () => true;
    const mockGetDeviceMemory = () => 1; // 1 GB RAM
    const mockGetHardwareConcurrency = () => 2; // 2 cores

    // Act: Call the real function with injected mocked helpers
    const result = computeDefaultMaxNotes(24, {
      isMobile: mockIsMobile,
      getDeviceMemory: mockGetDeviceMemory,
      getHardwareConcurrency: mockGetHardwareConcurrency
    });

    // Assert: Check that the result is what we expect
    expect(result).toBe(6);
  });
});
