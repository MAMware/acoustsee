// Standalone dedupe test for analytics i18n mapping
// Run with: node --input-type=module future/web/test/unit/analytics-i18n.test.js

import { initializeAnalytics, getGlobalBatcher } from '../../core/event-bus-analytics.js';

async function runDedupeTest() {
  // Simple mock EventBus with subscribe/emit
  const handlers = {};
  const eventBus = {
    subscribe(topic, cb) {
      handlers[topic] = handlers[topic] || [];
      handlers[topic].push(cb);
      return () => { handlers[topic] = handlers[topic].filter(h => h !== cb); };
    },
    // helper to emit
    _emit(topic, event) {
      (handlers[topic] || []).forEach(cb => {
        try { cb(event); } catch (e) { console.error('handler error', e); }
      });
    }
  };

  // Minimal state with eventCategories configured to include analytics
  const state = {
    debugLogging: false,
    eventCategories: {
      DEBUG: { destinations: ['analytics'] },
      INFO: { destinations: ['analytics'] },
      WARN: { destinations: ['analytics'] },
      ERROR: { destinations: ['analytics'] }
    }
  };

  // Initialize analytics with a long batch interval so it doesn't flush during the test
  const cleanup = initializeAnalytics(eventBus, state, { batchInterval: 60 * 60 * 1000, endpoint: 'http://localhost/' });

  // Grab the global batcher (should have been set)
  const batcher = getGlobalBatcher();
  if (!batcher) {
    console.error('FAIL: global batcher not initialized');
    cleanup && cleanup();
    process.exit(2);
  }

  // Ensure buffer exists and is empty
  if (!Array.isArray(batcher.buffer)) batcher.buffer = [];
  batcher.buffer.length = 0;

  // 1) Emit the same I18N_KEY_MISSING twice for dedupe.test (en-US)
  const eventA = {
    type: 'log',
    category: 'DEBUG',
    timestamp: Date.now(),
    traceId: null,
    data: {
      message: 'I18N_KEY_MISSING',
      key: 'dedupe.test',
      languageId: 'en-US'
    }
  };

  eventBus._emit('log', eventA);
  eventBus._emit('log', eventA);

  // Allow microtask queue to process
  await new Promise(r => setTimeout(r, 50));

  const buf1 = batcher.buffer || [];
  const countDedupeTest = buf1.filter(e => e && e.type === 'i18n_error' && e.data && e.data.missingKey === 'dedupe.test').length;

  if (countDedupeTest !== 1) {
    console.error('FAIL: dedupe test expected 1 event for dedupe.test but found', countDedupeTest, 'buffer:', buf1);
    cleanup && cleanup();
    process.exit(2);
  }

  // 2) Emit a different key and assert buffer increases by 1 (now total 2)
  const eventB = {
    type: 'log',
    category: 'DEBUG',
    timestamp: Date.now(),
    traceId: null,
    data: {
      message: 'I18N_KEY_MISSING',
      key: 'dedupe.other',
      languageId: 'en-US'
    }
  };

  eventBus._emit('log', eventB);
  await new Promise(r => setTimeout(r, 50));

  const buf2 = batcher.buffer || [];
  const totalI18n = buf2.filter(e => e && e.type === 'i18n_error' && e.data && e.data.currentLanguage === 'en-US' && (e.data.missingKey === 'dedupe.test' || e.data.missingKey === 'dedupe.other')).length;

  if (totalI18n !== 2) {
    console.error('FAIL: expected 2 i18n events total after emitting second key; found', totalI18n, 'buffer:', buf2);
    cleanup && cleanup();
    process.exit(2);
  }

  console.log('PASS: analytics i18n dedupe test succeeded');
  cleanup && cleanup();
  process.exit(0);
}

runDedupeTest().catch(err => {
  console.error('TEST ERROR', err);
  process.exit(2);
});
