// File: web/test/performance.test.js
import { computeDefaultMaxNotes } from '../utils/performance.js';

// Mock the helper functions it uses
jest.mock('../utils/performance.js', () => {
  const originalModule = jest.requireActual('../utils/performance.js');
  return {
    ...originalModule,
    isMobile: jest.fn(),
    getDeviceMemory: jest.fn(),
    getHardwareConcurrency: jest.fn(),
  };
});

// Import the mocks so we can control them
import { isMobile, getDeviceMemory, getHardwareConcurrency } from '../utils/performance.js';

describe('computeDefaultMaxNotes', () => {
  it('should return a low value for a low-spec mobile device', () => {
    // Arrange: Set up the conditions for the test
    isMobile.mockReturnValue(true);
    getDeviceMemory.mockReturnValue(1); // 1 GB RAM
    getHardwareConcurrency.mockReturnValue(2); // 2 cores

    // Act: Run the function we are testing
    const maxNotes = computeDefaultMaxNotes(24);

    // Assert: Check that the result is what we expect
    expect(maxNotes).toBe(6);
  });
});