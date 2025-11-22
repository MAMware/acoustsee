// Jest test for analytics i18n deduplication

import { initializeAnalytics, getGlobalBatcher } from '../../core/event-bus-analytics.js';

describe('analytics i18n deduplication', () => {
  test('deduplicates identical I18N_KEY_MISSING events and accepts a different key', async () => {
    // Simple mock EventBus with subscribe/emit
    const handlers = {};
    const eventBus = {
      subscribe(topic, cb) {
        handlers[topic] = handlers[topic] || [];
        handlers[topic].push(cb);
        // return unsubscribe
        return () => { handlers[topic] = handlers[topic].filter(h => h !== cb); };
      },
      // simple emitter used by the test
      emit(topic, event) {
        (handlers[topic] || []).forEach(cb => {
          try { cb(event); } catch (e) { /* let tests surface errors */ }
        });
      }
    };

    // Minimal state with analytics destinations configured
    const state = {
      debugLogging: false,
      eventCategories: {
        DEBUG: { destinations: ['analytics'] },
        INFO: { destinations: ['analytics'] },
        WARN: { destinations: ['analytics'] },
        ERROR: { destinations: ['analytics'] }
      }
    };

    // Initialize analytics (long batchInterval so it won't flush during test)
    const cleanup = initializeAnalytics(eventBus, state, { batchInterval: 60 * 60 * 1000, endpoint: 'http://localhost/' });

    const batcher = getGlobalBatcher();
    expect(batcher).toBeDefined();

    // Ensure buffer exists and is empty
    if (!Array.isArray(batcher.buffer)) batcher.buffer = [];
    batcher.buffer.length = 0;

    // Helper to build a log event carrying an I18N message
    const makeLogEvent = (key) => ({
      type: 'log',
      category: 'DEBUG',
      timestamp: Date.now(),
      traceId: null,
      data: {
        message: 'I18N_KEY_MISSING',
        key,
        languageId: 'en-US'
      }
    });

    // Emit identical event twice for dedupe.test
    const evA = makeLogEvent('dedupe.test');
    eventBus.emit('log', evA);
    eventBus.emit('log', evA);

    // allow microtasks / subscriber handlers to run
    await new Promise(r => setTimeout(r, 50));

    const buf1 = batcher.buffer || [];
    const countDedupeTest = buf1.filter(e => e && e.type === 'i18n_error' && e.data && e.data.missingKey === 'dedupe.test').length;
    expect(countDedupeTest).toBe(1);

    // Emit a different key and expect count to increase to 2 total
    const evB = makeLogEvent('dedupe.other');
    eventBus.emit('log', evB);
    await new Promise(r => setTimeout(r, 50));

    const buf2 = batcher.buffer || [];
    const totalI18n = buf2.filter(e => e && e.type === 'i18n_error' && e.data && e.data.currentLanguage === 'en-US' && (e.data.missingKey === 'dedupe.test' || e.data.missingKey === 'dedupe.other')).length;
    expect(totalI18n).toBe(2);

    // Clean up analytics subscriptions and flusher
    if (typeof cleanup === 'function') cleanup();
  }, 10000);
});
