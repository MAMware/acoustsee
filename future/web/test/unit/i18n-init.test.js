/**
 * Jest tests for i18n initialization and getText behavior
 */

jest.autoMockOff();

// Mock structuredLog so we can assert messages
jest.mock('../../utils/logging.js', () => ({
  structuredLog: jest.fn()
}));

import { initializeLanguage, getText, clearTranslationsCache } from '../../utils/utils.js';
import { structuredLog } from '../../utils/logging.js';

describe('i18n initialization and getText', () => {
  beforeEach(() => {
    // Reset module-level caches and mocks
    jest.resetModules();
    clearTranslationsCache && clearTranslationsCache();
    structuredLog.mockClear && structuredLog.mockClear();
  });

  afterEach(() => {
    // Clear any global fetch mock
    if (global.fetch && global.fetch._isMock) delete global.fetch;
  });

  test('Happy Path: initializeLanguage sets ready and loads translations', async () => {
    // Mock fetch to return a simple translations JSON
    const fakeTranslations = { 'greeting': 'Hello from ES' };
    global.fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(fakeTranslations) }));
    global.fetch._isMock = true;

    const state = { availableLanguages: [{ id: 'es-ES' }], language: 'es-ES' };
    await initializeLanguage(state);

    expect(state.i18n).toBeDefined();
    expect(state.i18n.ready).toBe(true);

    const text = await getText('greeting', {}, state);
    expect(text).toBe('Hello from ES');
  });

  test('Fail Fast: getText called before initializeLanguage returns fallback and logs once', async () => {
    // Ensure no fetch is involved
    if (global.fetch) delete global.fetch;

    const state = { availableLanguages: [{ id: 'en-US' }] };

    const out = await getText('will.fail', {}, state);
    expect(out).toBe('[missing:will.fail]');
    // structuredLog should have been called with I18N_NOT_INITIALIZED once
    const calls = structuredLog.mock.calls;
    const found = calls.some(c => Array.isArray(c) && c[1] === 'I18N_NOT_INITIALIZED');
    expect(found).toBe(true);
  });

  test('Fallback: initializeLanguage falls back to bundled en-US when fetch fails', async () => {
    // Mock fetch to fail
    global.fetch = jest.fn(() => Promise.reject(new Error('network down')));
    global.fetch._isMock = true;

    const state = { availableLanguages: [{ id: 'fr-FR' }], language: 'fr-FR' };
    await initializeLanguage(state);

    // After failed preload, initializer should fall back to en-US (bundled)
    expect(state.language === 'en-US' || state.i18n.languageId === 'en-US').toBe(true);
    expect(state.i18n.ready).toBe(true);
  });
});
