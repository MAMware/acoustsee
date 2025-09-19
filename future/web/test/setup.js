// Minimal Jest setup for future/web tests
// Provide safe globals and quiet noisy logs during tests
global.IS_JEST = true;

// Silence console.info/warn in tests (optional)
const originalWarn = console.warn;
console.warn = (...args) => {
  if (String(args[0]).includes('IndexedDB') || String(args[0]).includes('[IDB FALLBACK]')) return;
  originalWarn.apply(console, args);
};
