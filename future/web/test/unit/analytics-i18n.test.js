// Standalone test script for analytics i18n mapping
// Run with: node --input-type=module future/web/test/unit/analytics-i18n.test.js

import { initializeAnalytics, getGlobalBatcher } from '../../core/event-bus-analytics.js';

async function run() {
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
    process.exit(2);
  }

  // Emit a log event that should be mapped
  const event = {
    type: 'log',
    category: 'DEBUG',
    timestamp: Date.now(),
    traceId: null,
    data: {
      message: 'I18N_KEY_MISSING',
      key: 'test.missing',
      languageId: 'es-ES'
    }
  };

  // Emit
  eventBus._emit('log', event);

  // Allow microtask queue to process
  await new Promise(r => setTimeout(r, 50));

  // Inspect batcher buffer
  const buffer = batcher.buffer || [];
  if (buffer.length === 0) {
    console.error('FAIL: no events were added to batcher.buffer');
    cleanup && cleanup();
    process.exit(2);
  }

  // Find first i18n_error event
  const mapped = buffer.find(e => e && e.type === 'i18n_error');
  if (!mapped) {
    console.error('FAIL: no i18n_error event found in batcher buffer', buffer);
    cleanup && cleanup();
    process.exit(2);
  }

  // Assertions
  const passType = mapped.type === 'i18n_error';
  const passCategory = mapped.category === 'I18N_KEY_MISSING';
  const passMissingKey = mapped.data && mapped.data.missingKey === 'test.missing';
  const passLang = mapped.data && mapped.data.currentLanguage === 'es-ES';

  if (passType && passCategory && passMissingKey && passLang) {
    console.log('PASS: analytics i18n mapping test succeeded');
    cleanup && cleanup();
    process.exit(0);
  } else {
    console.error('FAIL: assertions failed', { mapped });
    cleanup && cleanup();
    process.exit(2);
  }
}

run().catch(err => {
  console.error('TEST ERROR', err);
  process.exit(2);
});
