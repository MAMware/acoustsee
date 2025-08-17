// Global test setup: silence console and mock common browser APIs

// Silence console
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'info').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});

// Mock structuredLog to avoid heavy logging
jest.mock('../utils/logging.js', () => ({ structuredLog: jest.fn() }));

// Provide a default mock for navigator.mediaDevices so tests can override if needed
if (typeof global.navigator === 'undefined') global.navigator = {};
if (!navigator.mediaDevices) {
  navigator.mediaDevices = {
    getUserMedia: jest.fn().mockRejectedValue(new Error('getUserMedia not mocked in test'))
  };
}
