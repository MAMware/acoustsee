// File: future/web/core/ingest.js

/**
 * Send ingest events to your Wrangler Worker endpoint.
 * @param {string} event - The event name or level.
 * @param {{}} payload - Additional data to send.
 */
import { settings } from './state.js';
import { deviceSummary } from '../utils/performance.js';

const INGEST_ENDPOINT = 'https://acoustsee-analytics.mamware.workers.dev';

// Detect obvious local/test environments to avoid noisy network calls during
// developer runs and headless tests. This is intentionally conservative.
const IS_LOCALHOST = (typeof window !== 'undefined' && ['localhost', '127.0.0.1', '::1'].includes(window.location.hostname))
  || (typeof process !== 'undefined' && process.env.NODE_ENV === 'test');

function shouldSendIngest() {
  try {
    if (!settings?.ingestEnabled) return false;
  } catch (e) {
    return false;
  }
  if (IS_LOCALHOST) return false;
  return true;
}

export async function trackFeatureUse(event, payload = {}) {
  // Fast-path: do not attempt network calls in local/test environments.
  if (!shouldSendIngest()) {
    try { if (settings?.debugLogging) console.debug('ingest: suppressed trackFeatureUse for', event); } catch (e) {}
    return;
  }

  try {
    // --- NEW LOGIC ---
    let finalPayload;
    if (event === 'user-report') {
      // For user reports, the payload is already perfectly formatted.
      finalPayload = payload;
    } else {
      // For automatic errors, we build the payload as before.
      const device = (() => {
        try { return deviceSummary(); } catch (e) { return { error: 'device-summary-failed' }; }
      })();
      const { message, source, stack, ...rest } = payload || {};
      finalPayload = {
        level: event,
        message: message || event,
        source: source ?? null,
        stack: stack ?? null,
        ...rest,
        device,
        timestamp_client: Date.now()
      };
    }
    // --- END NEW LOGIC ---

    await fetch(INGEST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(finalPayload) // Send the correct payload
    });
  } catch (err) {
    console.error('Ingest send failed:', err);
  }
}

/**
 * Best-effort emergency beacon. Uses sendBeacon when available.
 */
export function emergencyTrack(eventName, errorPayload = {}) {
  try {
    if (!shouldSendIngest()) {
      try { if (settings?.debugLogging) console.debug('ingest: suppressed emergencyTrack for', eventName); } catch (e) {}
      return;
    }
    const payload = {
      event: eventName,
      payload: errorPayload,
      timestamp: Date.now(),
      isEmergency: true
    };
    if (typeof navigator !== 'undefined' && navigator.sendBeacon) {
      const blob = new Blob([JSON.stringify(payload)], { type: 'application/json' });
      navigator.sendBeacon(INGEST_ENDPOINT, blob);
      return;
    }
    fetch(INGEST_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (e) {
    // silent
  }
}

/**
 * Developer helper to ping the ingest endpoint from the console.
 */
export function pingIngest() {
  try {
    if (!shouldSendIngest()) {
      console.log('pingIngest: suppressed in local/test environment');
      return;
    }
    const endpoint = INGEST_ENDPOINT;
    const testPayload = {
      event: 'ingest-ping',
      payload: { message: 'Ping from client at ' + new Date().toISOString(), randomId: Math.random().toString(36).substring(7) },
      timestamp: Date.now()
    };
    console.log('Pinging ingest endpoint:', endpoint);
    console.log('Payload:', testPayload);
    fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify(testPayload)
    }).then(r => {
      if (r.ok) console.log('%cIngest Ping Succeeded!', 'color: green; font-weight: bold;');
      else console.error('%cIngest Ping Failed!', 'color: red; font-weight: bold;');
      return r.text().catch(() => '');
    }).then(t => { if (t) console.log('Response Body:', t); }).catch(err => console.error('Fetch Error:', err));
  } catch (e) {
    // silent
  }
}


