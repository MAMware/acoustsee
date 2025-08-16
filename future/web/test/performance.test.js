// File: web/test/performance.test.js

describe('computeDefaultMaxNotes', () => {
  it('should return a low value for a low-spec mobile device', () => {
    // Reset modules so doMock will take effect
    jest.resetModules();

    // Merge the real module but override only the helper functions
    const actual = jest.requireActual('../utils/performance.js');
    jest.doMock('../utils/performance.js', () => ({
      ...actual,
      isMobile: jest.fn(() => true),
      getDeviceMemory: jest.fn(() => 1),
      getHardwareConcurrency: jest.fn(() => 2),
    }));

    // Require the module after mocking helpers
    // eslint-disable-next-line global-require
    const perf = require('../utils/performance.js');

    // Act: call the real implementation but inject mocked helpers
    const result = perf.computeDefaultMaxNotes(24, {
      isMobile: () => true,
      getDeviceMemory: () => 1,
      getHardwareConcurrency: () => 2
    });

    // Assert
    expect(result).toBe(6);
  });
});
