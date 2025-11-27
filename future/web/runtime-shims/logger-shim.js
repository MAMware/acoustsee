/**
 * Simplified Structured Logging Shim
 * 
 * Provides basic logging functions compatible with the real logging system (Phase 3.1c+).
 * 
 * LIMITATIONS:
 * - Does NOT persist to IndexedDB
 * - Does NOT support real throttling (accepts options but ignores)
 * - Does NOT include stack traces, userAgent, or URL metadata
 * - Sampling is approximate (uses simple modulo counter)
 * 
 * ENHANCEMENTS (v0.9.5+):
 * - Supports full structuredLog() signature with options
 * - Implements shouldSample() for sampling events
 * - Logs with trace IDs when available
 * 
 * USE FOR:
 * - Testing modules that use structuredLog()
 * - Verifying log message formats and sampling
 * - Smoke testing logging integration
 * 
 * For real logging behavior with persistence, use browser integration tests.
 */

// Simple counter-based sampling (approximates real shouldSample behavior)
const samplingCounters = {};
const SAMPLING_RATES = {
  frameProcessing: 0.01,
  workerProcessing: 0.05,
  audioSynthesis: 0.1,
  modeChanges: 0.5,
  cueGeneration: 0.1,
};

export function shouldSample(eventType = 'frameProcessing') {
  const rate = SAMPLING_RATES[eventType] ?? 0.1;
  if (rate <= 0) return false;
  if (rate >= 1) return true;
  
  if (!samplingCounters[eventType]) samplingCounters[eventType] = 0;
  samplingCounters[eventType]++;
  const interval = Math.round(1 / rate);
  return (samplingCounters[eventType] % interval) === 0;
}

export function setSamplingRate(eventType, rate) {
  if (typeof rate !== 'number' || rate < 0 || rate > 1) {
    console.warn('[LOG] Invalid sampling rate', { eventType, rate });
    return;
  }
  SAMPLING_RATES[eventType] = rate;
}

export function structuredLog(level, text, data, persist = true, applyRateLimiting = true, options = {}) {
  const { traceId, unthrottled = false, announce = false, speak = false } = options;
  
  const out = { 
    level, 
    text, 
    data,
    ...(traceId && { traceId })
  };
  
  if (level === 'ERROR') console.error('[LOG]', JSON.stringify(out));
  else if (level === 'WARN') console.warn('[LOG]', JSON.stringify(out));
  else console.info('[LOG]', JSON.stringify(out));
  
  if (announce) console.log('[ANNOUNCE]', text);
  if (speak) console.log('[SPEAK]', text);
}

export function setLogLevel(level) {
  console.log('[LOG] setLogLevel', { level });
}

export function warnOnce(id, level, text, data) {
  console.warn('[WARN_ONCE]', { id, text, data });
}

export function throttleError(error, options = {}) {
  const { sampleEvery = 1 } = options;
  return true; // Shim: always allow in tests
}

export function dispose() {
  // No-op cleanup
}
