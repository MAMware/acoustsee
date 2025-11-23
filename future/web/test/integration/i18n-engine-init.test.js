/**
 * Integration test for i18n engine persistence using initializeLanguage persist callback.
 */

// Mock frame-processor to avoid import.meta parsing in underlying module graph during Jest run.
jest.mock('../../video/frame-processor.js', () => ({
  initializeVideo: jest.fn(),
  processFrameWithState: jest.fn()
}));

jest.autoMockOff();

jest.mock('../../utils/logging.js', () => ({
  structuredLog: jest.fn()
}));

import { createEngine } from '../../core/engine.js';
import { initializeLanguage, clearTranslationsCache } from '../../utils/utils.js';
import { structuredLog } from '../../utils/logging.js';

// Helper to count a specific log code
function hasLog(code) {
  return structuredLog.mock.calls.some(c => c[1] === code);
}

describe('i18n engine integration', () => {
  beforeEach(() => {
    clearTranslationsCache && clearTranslationsCache();
    structuredLog.mockClear();
    // Provide a minimal fetch that will not be used for en-US (bundled path)
    global.fetch = jest.fn((url) => Promise.resolve({ ok: true, json: () => Promise.resolve({}) }));
  });

  afterEach(() => {
    delete global.fetch;
  });

  test('initializeLanguage with persist sets engine state i18n.ready', async () => {
    const engine = createEngine();
    engine.setState({ availableLanguages: [{ id: 'en-US' }, { id: 'es-ES' }] });
    const configState = engine.getState(); // shallow copy
    expect(configState.i18n).toBeUndefined();

    await initializeLanguage(configState, { persist: (partial) => engine.setState(partial) });

    const after = engine.getState();
    expect(after.i18n).toBeDefined();
    expect(after.i18n.ready).toBe(true);
    expect(after.language).toBe('en-US'); // bundled fallback path
    // Should not have logged NOT_INITIALIZED after proper init
    expect(hasLog('I18N_NOT_INITIALIZED')).toBe(false);
  });
});
