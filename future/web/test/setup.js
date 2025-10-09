// Minimal Jest setup for future/web tests
// Provide safe globals and quiet noisy logs during tests
global.IS_JEST = true;

// Silence console.info/warn in tests (optional)
const originalWarn = console.warn;
console.warn = (...args) => {
  if (String(args[0]).includes('IndexedDB') || String(args[0]).includes('[IDB FALLBACK]')) return;
  originalWarn.apply(console, args);
};

// Minimal navigator.mediaDevices shim so tests that request getUserMedia don't throw
if (typeof global.navigator === 'undefined') global.navigator = {};
global.navigator.mediaDevices = global.navigator.mediaDevices || {
  getUserMedia: jest.fn().mockResolvedValue({
    getTracks: () => [{ stop: jest.fn() }]
  })
};
